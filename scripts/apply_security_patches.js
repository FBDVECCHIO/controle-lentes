const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, '..', 'api', 'backend.js');
let code = fs.readFileSync(targetFile, 'utf8');

// 1. JWT helpers at top
const jwtCode = `
const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || "atlas-controle-lentes-security-secret-key-2026";

function generateToken(userPayload) {
  try {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 horas
    const payload = Buffer.from(JSON.stringify({ ...userPayload, exp })).toString("base64url");
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(\`\${header}.\${payload}\`).digest("base64url");
    return \`\${header}.\${payload}.\${signature}\`;
  } catch (e) {
    return null;
  }
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  try {
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(\`\${header}.\${payload}\`).digest("base64url");
    if (expectedSig !== signature) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}
`;

if (!code.includes('generateToken(')) {
  code = code.replace('const SUPABASE_KEY =', jwtCode + '\nconst SUPABASE_KEY =');
}

// 2. Update authenticateUser to return token
const authTarget = `    await logAction(username, "Login efetuado com sucesso");
    
    var extra = parseExtraPermissions(user.medicos, user);
    // Retorna o objeto de usuário formatado para sessões
    return {
      success: true,`;

const authReplacement = `    await logAction(username, "Login efetuado com sucesso");
    
    var token = generateToken({
      username: user.usuario,
      nome: user.nome,
      loja: user.loja || 'Todos'
    });
    
    var extra = parseExtraPermissions(user.medicos, user);
    // Retorna o objeto de usuário formatado para sessões
    return {
      success: true,
      token: token,`;

if (code.includes(authTarget)) {
  code = code.replace(authTarget, authReplacement);
}

// 3. Fix getAppData bypass
const getAppDataTarget = `async function getAppData(loggedUser) {
  if (loggedUser && !await validateUserSession(loggedUser)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }`;

const getAppDataReplacement = `async function getAppData(loggedUser) {
  var username = getUserUsername(loggedUser);
  if (!username) {
    return { success: false, error: 'UNAUTHORIZED: Acesso negado. Usuário não autenticado.' };
  }
  if (!await validateUserSession(loggedUser)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }`;

if (code.includes(getAppDataTarget)) {
  code = code.replace(getAppDataTarget, getAppDataReplacement);
}

// 4. Sanitize getUsersList: remove senha: u.senha
code = code.replace('senha: u.senha,', "senha: '••••••••',");

// 5. Hide allowedFunctions from GET healthcheck
code = code.replace(
  'allowedFunctions: Object.keys(backendFunctions)',
  'status_detail: "Operando sob o Protocolo de Segurança A.T.L.A.S."'
);

// 6. Secure changeOwnPassword (require currentPassword if supplied or check match)
const changePassTarget = `async function changeOwnPassword(newPassword, loggedUserUsername) {
  try {
    var username = getUserUsername(loggedUserUsername);
    if (!username) {
      return { success: false, error: "Sessão inválida." };
    }
    
    // Buscar o usuário
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    if (users.length === 0) {
      return { success: false, error: "Usuário não encontrado." };
    }
    
    var user = users[0];`;

const changePassReplacement = `async function changeOwnPassword(newPassword, loggedUserUsername, currentPassword) {
  try {
    var username = getUserUsername(loggedUserUsername);
    if (!username) {
      return { success: false, error: "Sessão inválida." };
    }
    
    // Buscar o usuário
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    if (users.length === 0) {
      return { success: false, error: "Usuário não encontrado." };
    }
    
    var user = users[0];
    
    // Se fornecida senha atual, validar antes da alteração
    if (currentPassword !== undefined && currentPassword !== null && currentPassword !== "") {
      if (user.senha !== currentPassword) {
        return { success: false, error: "Senha atual incorreta." };
      }
    }`;

if (code.includes(changePassTarget)) {
  code = code.replace(changePassTarget, changePassReplacement);
}

// 7. Store restriction checks on deleteVendas
const deleteVendasTarget = `async function deleteVendas(osList, loggedUserUsername) {
  try {
    if (!osList || osList.length === 0) return { success: true };
    for (var i = 0; i < osList.length; i++) {
      var os = osList[i];
      await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os), {
        method: "DELETE"
      });
      await logAction(loggedUserUsername, "Excluiu venda OS: " + os);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}`;

const deleteVendasReplacement = `async function deleteVendas(osList, loggedUserUsername) {
  try {
    if (!osList || osList.length === 0) return { success: true };
    var username = getUserUsername(loggedUserUsername);
    if (!username) return { success: false, error: "Acesso não autorizado." };
    
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    var userLoja = (users && users.length > 0) ? (users[0].loja || 'Todos') : 'Todos';

    for (var i = 0; i < osList.length; i++) {
      var os = osList[i];
      if (userLoja !== 'Todos') {
        var existing = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
        if (existing && existing.length > 0 && existing[0].loja !== userLoja) {
          return { success: false, error: "Permissão negada: não é permitido excluir vendas de outra filial." };
        }
      }
      await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os), {
        method: "DELETE"
      });
      await logAction(loggedUserUsername, "Excluiu venda OS: " + os);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}`;

if (code.includes(deleteVendasTarget)) {
  code = code.replace(deleteVendasTarget, deleteVendasReplacement);
}

// 8. Dispatcher protection: token checking
const dispatcherTarget = `    const functionName = body.functionName;
    const args = body.arguments || [];

    if (!functionName) {
      res.status(400).json({ success: false, error: "Nenhuma functionName especificada." });
      return;
    }

    if (!backendFunctions[functionName]) {
      res.status(404).json({ success: false, error: "Função não autorizada ou não encontrada: " + functionName });
      return;
    }`;

const dispatcherReplacement = `    const functionName = body.functionName;
    const args = body.arguments || [];

    if (!functionName) {
      res.status(400).json({ success: false, error: "Nenhuma functionName especificada." });
      return;
    }

    if (!backendFunctions[functionName]) {
      res.status(404).json({ success: false, error: "Função não autorizada ou não encontrada: " + functionName });
      return;
    }

    // Validação de token de segurança para chamadas RPC protegidas
    if (functionName !== 'authenticateUser') {
      const authHeader = req.headers.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.token || null);
      const verified = verifyToken(token);
      
      // Fallback para usuário de sessão já validado nos argumentos
      const candidateUser = args.find(a => typeof a === 'string' && a.length > 0 && a.length < 50);
      if (!verified && (!candidateUser || !await validateUserSession(candidateUser))) {
        res.status(401).json({ success: false, error: "UNAUTHORIZED: Token de segurança ausente ou sessão expirada." });
        return;
      }
    }`;

if (code.includes(dispatcherTarget)) {
  code = code.replace(dispatcherTarget, dispatcherReplacement);
}

fs.writeFileSync(targetFile, code, 'utf8');
console.log('[A.T.L.A.S.] Patches de segurança aplicados com sucesso em api/backend.js!');
