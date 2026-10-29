/**
 * Web App de Gestão de Lentes e Vendas - Backend Serverless API (Vercel)
 * Conectado diretamente ao Supabase PostgreSQL na Nuvem (sem dependência de Apps Script/Sheets)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mngwfearwjkpisararbe.supabase.co";

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || "atlas-controle-lentes-security-secret-key-2026";

function generateToken(userPayload) {
  try {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 horas
    const payload = Buffer.from(JSON.stringify({ ...userPayload, exp })).toString("base64url");
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
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
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (expectedSig !== signature) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 
                     process.env.SUPABASE_SERVICE_KEY || 
                     process.env.SUPABASE_KEY || 
                     process.env.SUPABASE_ANON_KEY || 
                     "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3dmZWFyd2prcGlzYXJhcmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTc5MzksImV4cCI6MjA5NjE3MzkzOX0.vk9Ol41NU2RI72-ZZKIcm7hzccYBjzPPptb6rZv_mKs";

// Objeto de compatibilidade Logger para evitar ReferenceError em ambiente Node.js / Vercel
const Logger = typeof console !== 'undefined' ? console : { log: function() {}, warn: function() {}, error: function() {} };

/**
 * Formata data no fuso de São Paulo (substitui Utilities.formatDate)
 */
function formatDateSP(date) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    return date ? date.toISOString() : "";
  }
}

/**
 * Dispara requisições HTTP REST para a API do Supabase (Node.js nativo).
 */
async function supabaseFetch(path, options = {}) {
  if (!path || typeof path !== 'string' || path.indexOf('/') !== 0) {
    console.warn("Aviso: supabaseFetch chamado com caminho inválido: " + path);
    return [];
  }
  options.headers = options.headers || {};
  options.headers['apikey'] = SUPABASE_KEY;
  options.headers['Authorization'] = 'Bearer ' + SUPABASE_KEY;
  options.headers['Content-Type'] = 'application/json';
  options.headers['Prefer'] = options.headers['Prefer'] || 'return=representation';

  // Support payload as body
  if (options.payload && !options.body) {
    options.body = options.payload;
    delete options.payload;
  }
  const silentExpectedErrors = !!options.silentExpectedErrors;
  delete options.silentExpectedErrors;
  delete options.muteHttpExceptions;

  const url = SUPABASE_URL + '/rest/v1' + path;
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    if (!silentExpectedErrors) {
      console.error("Erro API Supabase: " + text + " (URL: " + url + ")");
    }
    throw new Error("Erro no banco de dados (" + response.status + "): " + text);
  }

  if (!text || text.trim() === "") return [];
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

async function supabaseFetchAll(paths) {
  if (!paths || !Array.isArray(paths)) {
    console.warn("Aviso: supabaseFetchAll chamado com parâmetro inválido.");
    return [];
  }
  return Promise.all(paths.map(async (p) => await supabaseFetch(p)));
}

async function supabaseFetchPaginated(path, pageSize = 1000) {
  let allRows = [];
  let offset = 0;
  let keepGoing = true;
  while (keepGoing) {
    const separator = path.includes('?') ? '&' : '?';
    const pagePath = `${path}${separator}limit=${pageSize}&offset=${offset}`;
    const rows = await supabaseFetch(pagePath);
    if (Array.isArray(rows) && rows.length > 0) {
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) {
        keepGoing = false;
      } else {
        offset += pageSize;
      }
    } else {
      keepGoing = false;
    }
  }
  return allRows;
}

// Conversores de Data (DD/MM/YYYY <=> YYYY-MM-DD)
function dmyToYmd(dmy) {
  if (!dmy) return null;
  var parts = dmy.split('/');
  if (parts.length !== 3) return dmy;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function ymdToDmy(ymd) {
  if (!ymd) return "";
  if (ymd.indexOf('T') !== -1) {
    ymd = ymd.split('T')[0];
  }
  var parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/**
 * Registra logs de auditoria no Supabase.
 */
async function logAction(username, action) {
  try {
    await supabaseFetch("/auditoria_logs", {
      method: "POST",
      headers: { 'Prefer': 'return=minimal' },
      payload: JSON.stringify({
        usuario: username || 'sistema',
        acao: action
      })
    });
  } catch (e) {
    console.warn("Aviso ao salvar log de auditoria: " + e.toString());
  }
}

// ==========================================
// ROTAS DE ENTRADA WEB APP (API GATEWAY)
// ==========================================



// ==========================================
// MÉTODOS DE REGISTRO E AUTENTICAÇÃO
// ==========================================

async function authenticateUser(username, password) {
  try {
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    if (users.length === 0) {
      users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(username.trim()));
    }
    if (users.length === 0) {
      return { success: false, error: "Usuário não encontrado." };
    }
    
    var user = users[0];
    if (user.senha !== password) {
      return { success: false, error: "Senha incorreta." };
    }
    
    if (user.status !== 'ATIVO') {
      return { success: false, error: "Este usuário está inativo." };
    }
    
    await logAction(username, "Login efetuado com sucesso");
    
    var token = generateToken({
      username: user.usuario,
      nome: user.nome,
      loja: user.loja || 'Todos'
    });
    
    var extra = parseExtraPermissions(user.medicos, user);
    // Retorna o objeto de usuário formatado para sessões
    return {
      success: true,
      token: token,
      user: {
        username: user.usuario,
        nome: user.nome,
        loja: user.loja || 'Todos',
        mustChangePassword: extra.mustChangePassword,
        permissions: {
          conferencia: user.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: user.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: user.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: user.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: user.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: user.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: user.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: user.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: user.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          medicos: extra.medicos,
          orcamentos: extra.orcamentos,
          garantias: extra.garantias,
          devolucoes: extra.devolucoes,
          assistencia: extra.assistencia,
          visitaMedica: extra.visitaMedica,
          vendaOSList: extra.vendaOSList,
          leadKanban: extra.leadKanban,
          leadControle: extra.leadControle,
          ocorrencias: extra.ocorrencias
        }
      }
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getUserUsername(loggedUser) {
  if (!loggedUser) return "";
  if (typeof loggedUser === 'string') {
    if (loggedUser.trim().indexOf('{') === 0) {
      try {
        var parsed = JSON.parse(loggedUser);
        return parsed.username || parsed.usuario || "";
      } catch (e) {}
    }
    return loggedUser;
  }
  if (typeof loggedUser === 'object') {
    return loggedUser.username || loggedUser.usuario || "";
  }
  return "";
}

// Cache em memória de alta performance para usuários/permissões (TTL: 60s)
const userSessionCache = new Map();
const USER_CACHE_TTL_MS = 60 * 1000;

function invalidateUserCache(username) {
  if (!username) {
    userSessionCache.clear();
    return;
  }
  var norm = String(username).trim().toLowerCase();
  userSessionCache.delete(norm);
}

async function getCachedUser(username) {
  if (!username) return null;
  var norm = String(username).trim().toLowerCase();
  var cached = userSessionCache.get(norm);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.user;
  }
  var users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(norm));
  if (!users || users.length === 0) {
    return null;
  }
  var user = users[0];
  userSessionCache.set(norm, {
    user: user,
    expiresAt: Date.now() + USER_CACHE_TTL_MS
  });
  return user;
}

async function validateUserSession(loggedUser, requiredPermission) {
  try {
    var username = getUserUsername(loggedUser);
    if (!username) return false;
    
    var user = await getCachedUser(username);
    if (!user) return false;
    if (user.status !== 'ATIVO') return false;
    
    if (requiredPermission) {
      // Mapeamento de chaves de permissão
      var permissionCol = requiredPermission;
      if (requiredPermission === 'logVendas') permissionCol = 'log_vendas';
      if (requiredPermission === 'resumoVendas') permissionCol = 'resumo_vendas';
      
      var newPerms = ['medicos', 'orcamentos', 'garantias', 'devolucoes', 'assistencia', 'visitaMedica', 'vendaOSList', 'leadKanban', 'leadControle', 'ocorrencias'];
      if (newPerms.indexOf(requiredPermission) !== -1) {
        var extra = parseExtraPermissions(user.medicos, user);
        return extra[requiredPermission] === 'ATIVO';
      }
      
      return user[permissionCol] === 'ATIVO';
    }
    return true;
  } catch (e) {
    return false;
  }
}

async function validateUserAnyPermission(loggedUser, permissionsList) {
  if (!permissionsList || permissionsList.length === 0) {
    return await validateUserSession(loggedUser);
  }
  var username = getUserUsername(loggedUser);
  if (!username) return false;
  
  var user = await getCachedUser(username);
  if (!user || user.status !== 'ATIVO') return false;
  
  // Avaliação em memória de todas as permissões em 0ms
  for (var i = 0; i < permissionsList.length; i++) {
    var perm = permissionsList[i];
    var col = perm;
    if (perm === 'logVendas') col = 'log_vendas';
    if (perm === 'resumoVendas') col = 'resumo_vendas';
    
    var newPerms = ['medicos', 'orcamentos', 'garantias', 'devolucoes', 'assistencia', 'visitaMedica', 'vendaOSList', 'leadKanban', 'leadControle', 'ocorrencias'];
    if (newPerms.indexOf(perm) !== -1) {
      var extra = parseExtraPermissions(user.medicos, user);
      if (extra[perm] === 'ATIVO') return true;
    } else if (user[col] === 'ATIVO') {
      return true;
    }
  }
  return false;
}

// ==========================================
// INFRAESTRUTURA DE CACHE E DETECÇÃO RELACIONAL (FASES 1, 2 E 3)
// ==========================================
const staticCatalogCache = new Map();
const STATIC_CATALOG_TTL_MS = 30 * 1000; // 30s para catálogos estáticos com invalidação imediata em mutações
const relationalTableCache = new Map();
const upsertConstraintCache = new Map();

function invalidateCatalogCache(key) {
  if (!key) {
    staticCatalogCache.clear();
    return;
  }
  staticCatalogCache.delete(key);
}

async function getCachedCatalog(key, path) {
  var entry = staticCatalogCache.get(key);
  if (entry && Date.now() < entry.expiresAt) {
    return entry.data;
  }
  var data = await supabaseFetch(path);
  staticCatalogCache.set(key, {
    data: data,
    expiresAt: Date.now() + STATIC_CATALOG_TTL_MS
  });
  return data;
}

async function fetchRelationalTableSafe(tableName, querySuffix) {
  var cachedState = relationalTableCache.get(tableName);
  if (cachedState && !cachedState.available && Date.now() < cachedState.expiresAt) {
    return null;
  }
  try {
    var rows = await supabaseFetch("/" + tableName + (querySuffix || ""), { silentExpectedErrors: true });
    relationalTableCache.set(tableName, {
      available: true,
      expiresAt: Date.now() + 5 * 60 * 1000
    });
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    var msg = err ? err.toString() : "";
    if (msg.indexOf("PGRST205") !== -1 || msg.indexOf("404") !== -1 || msg.indexOf("Could not find the table") !== -1) {
      relationalTableCache.set(tableName, {
        available: false,
        expiresAt: Date.now() + 60 * 1000
      });
      return null;
    }
    console.error("Erro API Supabase (" + tableName + "): " + msg);
    throw err;
  }
}

async function supabaseUpsertSingleTrip(tableName, conflictCol, matchQuery, payloadObj) {
  var canUpsert = upsertConstraintCache.get(tableName);
  if (!canUpsert || Date.now() >= canUpsert.expiresAt || canUpsert.supported !== false) {
    try {
      await supabaseFetch("/" + tableName + "?on_conflict=" + encodeURIComponent(conflictCol), {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        payload: JSON.stringify(payloadObj),
        silentExpectedErrors: true
      });
      upsertConstraintCache.set(tableName, {
        supported: true,
        expiresAt: Date.now() + 10 * 60 * 1000
      });
      return { mode: "upsert" };
    } catch (upsertErr) {
      var errStr = upsertErr ? upsertErr.toString() : "";
      if (errStr.indexOf("42P10") !== -1 || errStr.indexOf("no unique or exclusion constraint") !== -1) {
        upsertConstraintCache.set(tableName, {
          supported: false,
          expiresAt: Date.now() + 60 * 1000
        });
      } else {
        throw upsertErr;
      }
    }
  }

  // Fallback compatível caso o índice UNIQUE ainda não tenha sido criado no banco
  var exists = await supabaseFetch("/" + tableName + "?" + matchQuery + "&select=" + encodeURIComponent(conflictCol) + "&limit=1");
  if (exists && exists.length > 0) {
    await supabaseFetch("/" + tableName + "?" + matchQuery, {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      payload: JSON.stringify(payloadObj)
    });
    return { mode: "patch" };
  } else {
    await supabaseFetch("/" + tableName, {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      payload: JSON.stringify(payloadObj)
    });
    return { mode: "post" };
  }
}

function formatMedicoFromRow(m) {
  var det = (m.detalhes && typeof m.detalhes === 'object') ? m.detalhes : {};
  return Object.assign({}, det, {
    idMedico: m.id || det.idMedico || ('MED-' + m.crm),
    id: m.id || det.idMedico || ('MED-' + m.crm),
    nome: m.nome || det.nome || '',
    crm: m.crm || det.crm || '',
    representante: m.representante !== undefined && m.representante !== null ? m.representante : (det.representante || '')
  });
}

function formatClinicaFromRow(c) {
  var det = (c.detalhes && typeof c.detalhes === 'object') ? c.detalhes : {};
  return Object.assign({}, det, {
    id: c.id || det.id || '',
    nome: c.nome || det.nome || '',
    cidade: c.cidade !== undefined && c.cidade !== null ? c.cidade : (det.cidade || ''),
    representante: c.representante !== undefined && c.representante !== null ? c.representante : (det.representante || '')
  });
}

function formatOrcamentoFromRow(o) {
  var extra = (o.extra && typeof o.extra === 'object') ? o.extra : {};
  return Object.assign({}, extra, {
    id: o.id,
    data: o.data || extra.data || '',
    loja: o.loja || extra.loja || '',
    vendedor: o.vendedor || extra.vendedor || '',
    valorEstimado: Number(o.valor_estimado !== undefined ? o.valor_estimado : (extra.valorEstimado || 0)),
    clienteNome: o.cliente_nome || extra.clienteNome || '',
    clienteWhatsApp: o.cliente_whatsapp || extra.clienteWhatsApp || '',
    clienteEmail: o.cliente_email || extra.clienteEmail || '',
    motivoPerda: o.motivo_perda || extra.motivoPerda || '',
    detalhes: o.detalhes !== undefined && o.detalhes !== null ? o.detalhes : (extra.detalhes || '')
  });
}

function formatAssistenciaFromRow(a) {
  var det = (a.detalhes && typeof a.detalhes === 'object') ? a.detalhes : {};
  return Object.assign({}, det, {
    id: a.id,
    osLoja: a.os_loja || det.osLoja || '',
    loja: a.loja || det.loja || '',
    clienteNome: a.cliente_nome || det.clienteNome || '',
    clienteTelefone: a.cliente_telefone || det.clienteTelefone || '',
    clienteEmail: a.cliente_email || det.clienteEmail || '',
    lenteOriginal: a.lente_original || det.lenteOriginal || '',
    motivoQueixa: a.motivo_queixa || det.motivoQueixa || '',
    detalhesQueixa: a.detalhes_queixa || det.detalhesQueixa || '',
    tecnicoNome: a.tecnico_nome || det.tecnicoNome || '',
    tecnicoWhatsApp: a.tecnico_whatsapp || det.tecnicoWhatsApp || '',
    tecnicoCalendly: a.tecnico_calendly || det.tecnicoCalendly || '',
    dataAgendamento: a.data_agendamento || det.dataAgendamento || '',
    status: a.status || det.status || 'PENDENTE_ACEITE'
  });
}

function formatVisitaFromRow(v) {
  var isClin = v.medico_crm === 'CLINICA' || 
    (v.medico_nome && (v.medico_nome.toLowerCase().includes('clínica') || v.medico_nome.toLowerCase().includes('clinica')));
  return {
    id: v.id,
    data: v.data,
    hora: v.hora,
    representante: v.representante,
    medicoNome: v.medico_nome,
    medicoCrm: v.medico_crm,
    medico_nome: v.medico_nome,
    medico_crm: v.medico_crm,
    tipo: isClin ? 'Clinica' : 'Medico',
    clinicaNome: isClin ? v.medico_nome : '',
    assunto: v.assunto,
    status: v.status,
    relato: v.relato || '',
    lat: (v.lat !== null && v.lat !== undefined && !isNaN(v.lat)) ? Number(v.lat) : null,
    lng: (v.lng !== null && v.lng !== undefined && !isNaN(v.lng)) ? Number(v.lng) : null,
    created_at: v.created_at
  };
}

// ==========================================
// LEITURA SELETIVA E DE ALTA VELOCIDADE (getAppData - FASES 1, 2 E 3)
// ==========================================

async function getAppData(loggedUser, options) {
  var username = getUserUsername(loggedUser);
  if (!username) {
    return { success: false, error: 'UNAUTHORIZED: Acesso negado. Usuário não autenticado.' };
  }
  var userRecord = await getCachedUser(username);
  if (!userRecord || userRecord.status !== 'ATIVO') {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  try {
    var opts = (options && typeof options === 'object') ? options : {};
    var extraPerms = parseExtraPermissions(userRecord.medicos, userRecord);
    var isFullAdmin = (userRecord.usuario && userRecord.usuario.toLowerCase() === 'admin') || userRecord.configuracoes === 'ATIVO';
    var userLoja = userRecord.loja || 'Todos';
    var hasStoreScope = (userLoja && userLoja !== 'Todos' && !isFullAdmin);

    // Fase 2: Determinação cirúrgica de escopo por perfil (Role-Based Selective Payload + Proteção LGPD)
    var needFullVendas = isFullAdmin ||
      userRecord.venda === 'ATIVO' ||
      userRecord.log_vendas === 'ATIVO' ||
      userRecord.resumo_vendas === 'ATIVO' ||
      userRecord.dashboard === 'ATIVO' ||
      userRecord.auditoria === 'ATIVO' ||
      extraPerms.garantias === 'ATIVO' ||
      extraPerms.devolucoes === 'ATIVO' ||
      extraPerms.assistencia === 'ATIVO' ||
      extraPerms.vendaOSList === 'ATIVO';

    var needMedicosComissaoOnly = !needFullVendas && extraPerms.medicos === 'ATIVO';
    var needVendas = needFullVendas || needMedicosComissaoOnly;

    var needConferencias = isFullAdmin ||
      userRecord.conferencia === 'ATIVO' ||
      userRecord.registros === 'ATIVO' ||
      userRecord.dashboard === 'ATIVO' ||
      userRecord.auditoria === 'ATIVO' ||
      extraPerms.garantias === 'ATIVO' ||
      extraPerms.devolucoes === 'ATIVO';

    var needProdutos = isFullAdmin || needFullVendas || needConferencias || extraPerms.orcamentos === 'ATIVO';
    var needLogs = isFullAdmin || userRecord.logs === 'ATIVO' || userRecord.auditoria === 'ATIVO';
    var needCrm = isFullAdmin || extraPerms.leadKanban === 'ATIVO' || extraPerms.leadControle === 'ATIVO' || userRecord.dashboard === 'ATIVO';
    var needOcorrencias = isFullAdmin || extraPerms.ocorrencias === 'ATIVO' || userRecord.auditoria === 'ATIVO' || userRecord.dashboard === 'ATIVO';
    var needVisitas = isFullAdmin || extraPerms.visitaMedica === 'ATIVO' || extraPerms.medicos === 'ATIVO' || userRecord.dashboard === 'ATIVO';
    var needOrcamentos = isFullAdmin || extraPerms.orcamentos === 'ATIVO' || userRecord.venda === 'ATIVO' || userRecord.dashboard === 'ATIVO';
    var needAssistencias = isFullAdmin || extraPerms.assistencia === 'ATIVO' || userRecord.venda === 'ATIVO' || userRecord.conferencia === 'ATIVO';

    // Janela deslizante padrão de 90 dias para visitas_medicas (1 consulta indexada rápida em vez de paginação sequencial infinita)
    var daysWindow = Number(opts.daysWindow) > 0 ? Number(opts.daysWindow) : 90;
    var windowCutoffDate = new Date(Date.now() - daysWindow * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    var fullHistory = !!opts.fullHistory;

    var storeFilterEq = hasStoreScope ? ("&loja=eq." + encodeURIComponent(userLoja)) : "";
    var leadStoreFilterEq = hasStoreScope ? ("&loja_destino=eq." + encodeURIComponent(userLoja)) : "";

    var visitasPromise = Promise.resolve([]);
    if (needVisitas) {
      if (fullHistory) {
        visitasPromise = supabaseFetchPaginated("/visitas_medicas?order=data.desc,hora.desc").catch(function() { return []; });
      } else {
        visitasPromise = supabaseFetch("/visitas_medicas?data=gte." + windowCutoffDate + "&order=data.desc,hora.desc&limit=1000").catch(function() { return []; });
      }
    }

    var vendasSelectPath = needMedicosComissaoOnly
      ? ("/vendas?select=os_venda,data,loja,total_venda,detalhes&order=data.desc&limit=300" + storeFilterEq)
      : ("/vendas?order=data.desc&limit=300" + storeFilterEq);

    // Dispara todas as consultas estritamente necessárias em paralelo (com catálogos estáticos em memória)
    const [
      lojasRaw,
      labsRaw,
      vendedoresRaw,
      representantesRaw,
      contatosRaw,
      produtosRaw,
      configsList,
      logsRaw,
      vendasRaw,
      confsRaw,
      ocorrenciasRaw,
      campsRaw,
      leadsRaw,
      visitasRaw,
      relMedicos,
      relClinicas,
      relOrcamentos,
      relAssistencias
    ] = await Promise.all([
      getCachedCatalog('lojas', '/lojas'),
      needProdutos || needConferencias || isFullAdmin ? getCachedCatalog('laboratorios', '/laboratorios') : Promise.resolve([]),
      needFullVendas || needOrcamentos || isFullAdmin ? getCachedCatalog('vendedores', '/vendedores') : Promise.resolve([]),
      getCachedCatalog('representantes', '/representantes'),
      needFullVendas || isFullAdmin ? getCachedCatalog('contatos_resumo', '/contatos_resumo') : Promise.resolve([]),
      needProdutos ? getCachedCatalog('produtos', '/produtos') : Promise.resolve([]),
      getCachedCatalog('config_settings', '/config_settings'),
      needLogs ? supabaseFetch("/auditoria_logs?order=data_hora.desc&limit=100") : Promise.resolve([]),
      needVendas ? supabaseFetch(vendasSelectPath) : Promise.resolve([]),
      needConferencias ? supabaseFetch("/conferencias?order=data.desc&limit=300" + storeFilterEq) : Promise.resolve([]),
      needOcorrencias ? supabaseFetch("/ocorrencias?order=data.desc&limit=300" + storeFilterEq) : Promise.resolve([]),
      needCrm ? supabaseFetch("/campanhas?order=id.asc") : Promise.resolve([]),
      needCrm ? supabaseFetch("/leads?order=id.desc&limit=500" + leadStoreFilterEq) : Promise.resolve([]),
      visitasPromise,
      fetchRelationalTableSafe('medicos', '?order=nome.asc'),
      fetchRelationalTableSafe('clinicas', '?order=nome.asc'),
      needOrcamentos ? fetchRelationalTableSafe('orcamentos', '?order=data.desc&limit=500' + storeFilterEq) : Promise.resolve(null),
      needAssistencias ? fetchRelationalTableSafe('assistencias', '?order=data_agendamento.desc&limit=300' + storeFilterEq) : Promise.resolve(null)
    ]);

    // 1. Obter tabelas simples
    var lojas = lojasRaw.map(function(x) { return x.nome; });
    var labs = labsRaw.map(function(x) { return x.nome; });
    var vendedores = vendedoresRaw.map(function(x) { return x.nome; });
    var representantes = representantesRaw.map(function(x) { return x.nome; });
    
    var contatos = contatosRaw.map(function(x) {
      return { nome: x.nome, telefone: x.telefone };
    });
    
    var produtos = produtosRaw.map(function(x) {
      return { nome: x.nome, preco: Number(x.preco), laboratorio: x.laboratorio, tipo: x.tipo };
    });
    
    // 2. Logs de Auditoria (últimos 100)
    var logs = logsRaw.map(function(x) {
      var logTime = "";
      if (x.data_hora) {
        try {
          var tParts = x.data_hora.split('T');
          if (tParts.length === 2) {
            var dateParts = tParts[0].split('-');
            var timeParts = tParts[1].split('.')[0].split(':');
            
            var year = Number(dateParts[0]);
            var month = Number(dateParts[1]) - 1;
            var day = Number(dateParts[2]);
            var hours = Number(timeParts[0]);
            var minutes = Number(timeParts[1]);
            var seconds = Number(timeParts[2]);
            
            var utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
            logTime = formatDateSP(utcDate);
          }
        } catch (err) {
          // Fallback se ocorrer qualquer erro na conversão de fuso horário
          logTime = ymdToDmy(x.data_hora.split('T')[0]) + " " + x.data_hora.split('T')[1].split('.')[0];
        }
      }
      return {
        data: logTime,
        timestamp: logTime,
        usuario: x.usuario,
        acao: x.acao
      };
    });
    
    // 3. Vendas (Formatando o JSONB detalhes com os metadados externos; projeção enxuta LGPD para perfil Representante)
    var vendas = needMedicosComissaoOnly
      ? vendasRaw.reduce(function(acc, v) {
          var det = v.detalhes || {};
          var mCrm = det.medicoCrm || '';
          var mNome = det.medicoNome || '';
          if ((mCrm && mCrm.trim() !== '') || (mNome && mNome.trim() !== '')) {
            acc.push({
              osVenda: v.os_venda,
              data: ymdToDmy(v.data),
              loja: v.loja,
              totalVenda: Number(v.total_venda) || 0,
              medicoCrm: mCrm,
              medicoNome: mNome,
              medicoComissao: det.medicoComissao || 'S'
            });
          }
          return acc;
        }, [])
      : vendasRaw.map(function(v) {
          var details = v.detalhes || {};
          details.osVenda = v.os_venda;
          details.data = ymdToDmy(v.data);
          details.loja = v.loja;
          details.vendedor = v.vendedor;
          details.clienteNome = v.cliente_nome;
          details.totalVenda = Number(v.total_venda);
          return details;
        });

    // 4. Conferências / Lançamentos Lab (Formatando JSONB)
    var conferencias = confsRaw.map(function(c) {
      var details = c.detalhes || {};
      var dateStr = ymdToDmy(c.data);
      details.Data = dateStr;
      details.data = dateStr;
      details.Loja = c.loja;
      details.loja = c.loja;
      details.OSLoja = c.os;
      details.osLoja = c.os;
      details.LabPedido = c.laboratorio;
      details.labPedido = c.laboratorio;
      return details;
    });
    
    // 4.5 Ocorrências (Formatando JSONB)
    var ocorrencias = (ocorrenciasRaw || []).map(function(o) {
      var details = {};
      if (o.detalhes) {
        try {
          details = typeof o.detalhes === 'string' ? JSON.parse(o.detalhes) : o.detalhes;
        } catch(e) {}
      }
      return {
        id: o.id,
        os: o.os,
        loja: o.loja,
        vendedor: o.vendedor,
        clienteNome: o.cliente_nome,
        cliente_nome: o.cliente_nome,
        data: ymdToDmy(o.data),
        motivo: o.motivo,
        custoAdicional: Number(o.custo_adicional) || 0.00,
        custo_adicional: Number(o.custo_adicional) || 0.00,
        detalhes: details
      };
    });
    
    // 5. Configurações de Parâmetros
    var configs = {
      sessionTimeout: '2',
      logoUrl: '',
      comissaoMedicoPerc: '15',
      comissaoRepPercAbaixo: '1',
      comissaoRepPercAcima: '6',
      comissaoRepMeta: '200000',
      comissaoVendedorPerc: '2',
      comissaoGerentePerc: '1',
      comissaoLojaPerc: '10'
    };
    var medicos = [];
    var clinicas = [];
    var assistencias = [];
    var tecnicos = [];
    var vendedores = [];
    var captadores = [];
    var motivosPerda = ["Preço alto", "Prazo longo", "Falta do produto", "Garantia/Insatisfação", "Outro motivo"];
    var motivosOcorrencia = ["Erro de Digitação", "Atraso no Lab", "Quebra na Montagem", "Outro motivo"];
    var formasPagamento = ["Dinheiro", "Pix", "Cartão de Crédito", "Crediário", "Depósito/Transferência"];
    var orcamentos = [];
    var visitas = [];
    var assuntosVisita = ["Apresentação de Linha", "Feedback de Adaptação", "Lançamento de Lentes", "Visita de Relacionamento"];
    var assistTemplates = {
      tecnico: "Olá {tecnico}, a loja {loja} solicitou assistência para a OS {os} no dia {data} às {hora}.\n\nCliente: {cliente}\nMotivo: {motivo}\nLentes: {lente}.",
      clientePendente: "Olá {cliente}! Recebemos a sua solicitação de assistência técnica para os seus óculos (OS {os}). Reservamos o dia {data} às {hora}.\n\nNosso técnico está confirmando a agenda e, assim que aprovado, você receberá a confirmação aqui no WhatsApp!",
      clienteConfirmado: "Olá {cliente}! Seu atendimento de assistência técnica foi CONFIRMADO por nosso técnico para o dia {data} às {hora}. Esperamos você!"
    };

    var hasCustomVendedores = false;

    configsList.forEach(function(c) {
      if (c.key === 'sessionTimeout') configs.sessionTimeout = c.value;
      if (c.key === 'logoUrl') configs.logoUrl = c.value;
      if (c.key === 'comissaoMedicoPerc') configs.comissaoMedicoPerc = c.value;
      if (c.key === 'comissaoRepPercAbaixo') configs.comissaoRepPercAbaixo = c.value;
      if (c.key === 'comissaoRepMeta') configs.comissaoRepMeta = c.value;
      if (c.key === 'comissaoVendedorPerc') configs.comissaoVendedorPerc = c.value;
      if (c.key === 'comissaoGerentePerc') configs.comissaoGerentePerc = c.value;
      if (c.key === 'comissaoLojaPerc') configs.comissaoLojaPerc = c.value;
      if (c.key === 'medicos') {
        try { medicos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'clinicas') {
        try { clinicas = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assistencias') {
        try { assistencias = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'visitas' && (!visitasRaw || visitasRaw.length === 0)) {
        try { visitas = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assuntosVisita') {
        try { assuntosVisita = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'tecnicos') {
        try { tecnicos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'vendedores') {
        try { vendedores = JSON.parse(c.value); hasCustomVendedores = true; } catch(e) {}
      }
      if (c.key === 'captadores') {
        try { captadores = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'formasPagamento' || c.key === 'formas_pagamento') {
        try { formasPagamento = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'motivosPerda' || c.key === 'motivos_perda') {
        try { motivosPerda = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'motivosOcorrencia' || c.key === 'motivos_ocorrencia') {
        try { motivosOcorrencia = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'orcamentos') {
        try { orcamentos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assistTemplateTecnico') assistTemplates.tecnico = c.value;
      if (c.key === 'assistTemplateClientePendente') assistTemplates.clientePendente = c.value;
      if (c.key === 'assistTemplateClienteConfirmado') assistTemplates.clienteConfirmado = c.value;
    });

    // Fase 3: Preferência pelas tabelas relacionais dedicadas com fallback automático sem perda
    if (Array.isArray(relMedicos) && relMedicos.length > 0) {
      medicos = relMedicos.map(formatMedicoFromRow);
    }
    if (Array.isArray(relClinicas) && relClinicas.length > 0) {
      clinicas = relClinicas.map(formatClinicaFromRow);
    }
    if (Array.isArray(relOrcamentos) && relOrcamentos.length > 0) {
      orcamentos = relOrcamentos.map(formatOrcamentoFromRow);
    }
    if (Array.isArray(relAssistencias) && relAssistencias.length > 0) {
      assistencias = relAssistencias.map(formatAssistenciaFromRow);
    }

    if (visitasRaw && visitasRaw.length > 0) {
      visitas = visitasRaw.map(formatVisitaFromRow);
    }

    if (!hasCustomVendedores) {
      var legacyVendedores = vendedoresRaw || [];
      vendedores = legacyVendedores.map(function(x) {
        return { nome: x.nome, loja: "Todos" };
      });
    }

    var campanhas = (campsRaw || []).map(function(c) {
      return {
        id: c.id,
        nome: c.nome,
        status: c.status || 'ATIVO',
        data_inicio: c.data_inicio ? (c.data_inicio.indexOf('-') !== -1 ? c.data_inicio : ymdToDmy(c.data_inicio)) : '',
        data_fim: c.data_fim ? (c.data_fim.indexOf('-') !== -1 ? c.data_fim : ymdToDmy(c.data_fim)) : '',
        lojas: c.lojas || 'Todas',
        loja: c.lojas || 'Todas',
        aro: c.aro || '',
        lente: c.lente || '',
        preco_alvo: Number(c.preco_alvo) || 0
      };
    });

    var leads = (leadsRaw || []).map(function(l) {
        var data_visita = "";
        var hora_visita = "";
        if (l.dia_horario) {
          try {
            var dt = new Date(l.dia_horario);
            if (!isNaN(dt.getTime())) {
              var year = dt.getFullYear();
              var month = ("0" + (dt.getMonth() + 1)).slice(-2);
              var day = ("0" + dt.getDate()).slice(-2);
              data_visita = year + "-" + month + "-" + day;
              
              var hh = ("0" + dt.getHours()).slice(-2);
              var mm = ("0" + dt.getMinutes()).slice(-2);
              hora_visita = hh + ":" + mm;
            }
          } catch(err) {}
        }
        var det = {};
        if (l.detalhes) {
          try {
            det = typeof l.detalhes === 'string' ? JSON.parse(l.detalhes) : l.detalhes;
          } catch(err) {}
        }
        return {
          id: l.id,
          nome: l.nome,
          whatsapp: l.telefone || '',
          telefone: l.telefone || '',
          loja: l.loja_destino || '',
          loja_destino: l.loja_destino || '',
          data_visita: data_visita,
          hora_visita: hora_visita,
          dia_horario: l.dia_horario,
          campanha_id: l.campanha_id,
          status: l.status || 'entrante',
          vendedor: l.vendedor || '',
          produtos_vendidos: l.produtos_vendidos || '',
          valor_vendido: Number(l.valor_vendido) || 0,
          forma_pagamento: l.forma_pagamento || '',
          motivo_perda: l.motivo_perda || '',
          venda_os: l.venda_os || '',
          obs: det.obs || '',
          detalhes: det,
          criado_em: l.created_at || '',
          atualizado_em: l.atualizado_em || l.created_at || ''
        };
      });

    return {
      success: true,
      lojas: lojas,
      labs: labs,
      vendedores: vendedores,
      produtos: produtos,
      representantes: representantes,
      contatosResumo: contatos,
      logs: logs,
      vendas: vendas,
      lancamentos: conferencias,
      configs: configs,
      medicos: medicos,
      clinicas: clinicas,
      assistencias: assistencias,
      tecnicos: tecnicos,
      assistTemplates: assistTemplates,
      captadores: captadores,
      motivosPerda: motivosPerda,
      motivosOcorrencia: motivosOcorrencia,
      formasPagamento: formasPagamento,
      orcamentos: orcamentos,
      visitas: visitas,
      visitasWindowStart: fullHistory ? '1970-01-01' : windowCutoffDate,
      assuntosVisita: assuntosVisita,
      campanhas: campanhas,
      leads: leads,
      ocorrencias: ocorrencias
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function getHistoricalVisitas(startDate, endDate, loggedUser) {
  var username = getUserUsername(loggedUser);
  if (!username) {
    return { success: false, error: 'UNAUTHORIZED' };
  }
  var hasPerm = await validateUserAnyPermission(loggedUser, ['visitaMedica', 'medicos', 'dashboard', 'configuracoes']);
  if (!hasPerm) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var filters = [];
    if (startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      filters.push("data=gte." + encodeURIComponent(startDate));
    }
    if (endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      filters.push("data=lte." + encodeURIComponent(endDate));
    }
    filters.push("order=data.desc,hora.desc");
    var path = "/visitas_medicas?" + filters.join("&");
    var raw = await supabaseFetchPaginated(path);
    return {
      success: true,
      visitas: (raw || []).map(formatVisitaFromRow),
      visitasWindowStart: startDate || '1970-01-01'
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// SALVAR E EXCLUIR VENDAS (FASE 1: UPSERT ATÔMICO EM VIAGEM ÚNICA)
// ==========================================

async function addVenda(saleData, loggedUserUsername) {
  try {
    var os = saleData.osVenda;
    if (!os) throw new Error("OS da Venda é obrigatório.");
    
    var metadata = {
      os_venda: os,
      data: dmyToYmd(saleData.data),
      loja: saleData.loja,
      vendedor: saleData.vendedor,
      cliente_nome: saleData.clienteNome,
      total_venda: Number(saleData.totalVenda) || 0
    };
    
    var payload = Object.assign({}, saleData);
    delete payload.osVenda;
    delete payload.data;
    delete payload.loja;
    delete payload.vendedor;
    delete payload.clienteNome;
    delete payload.totalVenda;
    
    metadata.detalhes = payload;

    await Promise.all([
      supabaseUpsertSingleTrip("vendas", "os_venda", "os_venda=eq." + encodeURIComponent(os), metadata),
      logAction(loggedUserUsername, "Gravou venda OS: " + os)
    ]);
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function validateDeletionAuthority(authUser, authPass, requiredPermission) {
  if (!authUser || !authPass) {
    throw new Error("Credenciais de autorização de exclusão não fornecidas.");
  }
  var normalizedAuthUser = authUser.trim().toLowerCase();
  var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(normalizedAuthUser));
  if (users.length === 0) {
    throw new Error("Usuário autorizador não encontrado.");
  }
  var user = users[0];
  if (user.senha !== authPass) {
    throw new Error("Senha do autorizador incorreta.");
  }
  if (user.status !== 'ATIVO') {
    throw new Error("O usuário autorizador está inativo.");
  }
  
  if (normalizedAuthUser === 'admin') {
    return user;
  }
  
  var hasConfig = user.configuracoes === 'ATIVO';
  var hasSpecific = false;
  if (requiredPermission) {
    var permissionCol = requiredPermission;
    if (requiredPermission === 'logVendas') permissionCol = 'log_vendas';
    if (requiredPermission === 'resumoVendas') permissionCol = 'resumo_vendas';
    hasSpecific = user[permissionCol] === 'ATIVO';
  }
  
  if (!hasConfig && !hasSpecific) {
    throw new Error("O usuário autorizador não possui permissão para autorizar esta exclusão.");
  }
  return user;
}

async function deleteVendas(osList, loggedUserUsername) {
  try {
    if (!osList || osList.length === 0) return { success: true };
    var username = getUserUsername(loggedUserUsername);
    if (!username) return { success: false, error: "Acesso não autorizado." };
    
    var user = await getCachedUser(username);
    var userLoja = user ? (user.loja || 'Todos') : 'Todos';

    if (userLoja !== 'Todos') {
      for (var i = 0; i < osList.length; i++) {
        var os = osList[i];
        var existing = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
        if (existing && existing.length > 0 && existing[0].loja !== userLoja) {
          return { success: false, error: "Permissão negada: não é permitido excluir vendas de outra filial." };
        }
      }
    }

    await Promise.all(osList.map(function(os) {
      return supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os), {
        method: "DELETE"
      });
    }));

    await logAction(loggedUserUsername, "Excluiu vendas OS: " + osList.join(', '));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// SALVAR E EXCLUIR CONFERÊNCIAS (LAB - FASE 1: UPSERT EM VIAGEM ÚNICA)
// ==========================================

async function addConferencia(confData, loggedUserUsername) {
  try {
    var os = confData.OSLoja !== undefined ? confData.OSLoja : confData.osLoja;
    if (!os) throw new Error("OS do Lançamento é obrigatória.");
    
    var rawData = confData.Data !== undefined ? confData.Data : confData.data;
    var rawLoja = confData.Loja !== undefined ? confData.Loja : confData.loja;
    var rawLab = confData.LabPedido !== undefined ? confData.LabPedido : confData.labPedido;
    
    var metadata = {
      os: os.toString(),
      data: dmyToYmd(rawData),
      loja: rawLoja,
      laboratorio: rawLab
    };
    
    var payload = Object.assign({}, confData);
    delete payload.OSLoja;
    delete payload.osLoja;
    delete payload.Data;
    delete payload.data;
    delete payload.Loja;
    delete payload.loja;
    delete payload.LabPedido;
    delete payload.labPedido;
    
    metadata.detalhes = payload;
    
    await Promise.all([
      supabaseUpsertSingleTrip("conferencias", "os", "os=eq." + encodeURIComponent(os.toString()), metadata),
      logAction(loggedUserUsername, "Gravou conferência OS: " + os)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteConferencia(os, dataStr, loggedUserUsername) {
  try {
    var query = "/conferencias?os=eq." + encodeURIComponent(os);
    if (dataStr) {
      query += "&data=eq." + encodeURIComponent(dmyToYmd(dataStr));
    }
    await Promise.all([
      supabaseFetch(query, {
        method: "DELETE",
        headers: { "Prefer": "return=minimal" }
      }),
      logAction(loggedUserUsername, "Excluiu conferência OS: " + os)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteConferenciaGroup(items, loggedUserUsername) {
  try {
    if (!items || items.length === 0) return { success: true };
    await Promise.all(items.map(function(item) {
      var os = item.os || item.osLoja;
      var dataStr = item.dataStr || item.data;
      var query = "/conferencias?os=eq." + encodeURIComponent(os);
      if (dataStr) {
        query += "&data=eq." + encodeURIComponent(dmyToYmd(dataStr));
      }
      return supabaseFetch(query, {
        method: "DELETE",
        headers: { "Prefer": "return=minimal" }
      });
    }).concat([
      logAction(loggedUserUsername, "Excluiu grupo de conferências (" + items.length + " itens)")
    ]));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// OPERAÇÕES DE CONFIGURAÇÃO (CRUD TABELAS APOIO COM INVALIDAÇÃO DE CACHE)
// ==========================================

// 1. Lojas
async function addLoja(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await Promise.all([
      supabaseFetch("/lojas", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: name })
      }),
      logAction(loggedUserUsername, "Cadastrou loja: " + name)
    ]);
    invalidateCatalogCache('lojas');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLoja(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } }),
      logAction(loggedUserUsername, "Excluiu loja: " + name)
    ]);
    invalidateCatalogCache('lojas');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function renameLoja(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/lojas?nome=eq." + encodeURIComponent(oldName), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: newName })
      }),
      logAction(loggedUserUsername, "Renomeou loja de '" + oldName + "' para '" + newName + "'")
    ]);
    invalidateCatalogCache('lojas');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 2. Laboratórios
async function addLab(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await Promise.all([
      supabaseFetch("/laboratorios", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: name })
      }),
      logAction(loggedUserUsername, "Cadastrou laboratório: " + name)
    ]);
    invalidateCatalogCache('laboratorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLab(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } }),
      logAction(loggedUserUsername, "Excluiu laboratório: " + name)
    ]);
    invalidateCatalogCache('laboratorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function renameLab(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(oldName), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: newName })
      }),
      logAction(loggedUserUsername, "Renomeou laboratório de '" + oldName + "' para '" + newName + "'")
    ]);
    invalidateCatalogCache('laboratorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 3. Vendedores
async function addVendedor(name, loggedUserUsername) {
  try {
    var exists = await supabaseFetch("/vendedores?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await Promise.all([
      supabaseFetch("/vendedores", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: name })
      }),
      logAction(loggedUserUsername, "Cadastrou vendedor: " + name)
    ]);
    invalidateCatalogCache('vendedores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteVendedor(name, loggedUserUsername) {
  try {
    await Promise.all([
      supabaseFetch("/vendedores?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } }),
      logAction(loggedUserUsername, "Excluiu vendedor: " + name)
    ]);
    invalidateCatalogCache('vendedores');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 4. Representantes
async function getRepresentanteAuthInfo(repName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    if (!repName) return { success: false, error: "Nome não informado" };
    var users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(repName.trim()));
    if (users && users.length > 0) {
      return {
        success: true,
        exists: true,
        usuario: users[0].usuario,
        status: users[0].status,
        hasPassword: !!(users[0].senha && String(users[0].senha).trim() !== "")
      };
    }
    return {
      success: true,
      exists: false,
      hasPassword: false
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveRepresentanteWithPassword(oldName, newName, password, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    oldName = (oldName || "").trim();
    newName = (newName || "").trim();
    password = (password || "").trim();

    if (!newName && !oldName) {
      return { success: false, error: "Nome do representante é obrigatório." };
    }

    var finalName = newName || oldName;

    // 1. Processo de renomeação ou criação do representante
    if (oldName) {
      if (newName && newName !== oldName) {
        var existingNew = await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(newName));
        if (existingNew && existingNew.length > 0) {
          return { success: false, error: "Já existe outro representante com o nome '" + newName + "'." };
        }

        await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(oldName), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ nome: newName })
        });

        // Atualizar vínculos em tabelas relacionadas para manter histórico consistente
        try {
          await supabaseFetch("/visitas_medicas?representante=eq." + encodeURIComponent(oldName), {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({ representante: newName })
          });
          await supabaseFetch("/medicos?representante=eq." + encodeURIComponent(oldName), {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({ representante: newName })
          });
          await supabaseFetch("/clinicas?representante=eq." + encodeURIComponent(oldName), {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({ representante: newName })
          });
        } catch (linkErr) {
          console.warn("Aviso ao atualizar vínculos de representante:", linkErr);
        }

        var oldUsers = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(oldName));
        if (oldUsers && oldUsers.length > 0) {
          await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(oldUsers[0].usuario), {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({ usuario: newName, nome: newName })
          });
          invalidateUserCache(oldUsers[0].usuario);
          invalidateUserCache(newName);
        }
        await logAction(loggedUserUsername, "Renomeou representante de '" + oldName + "' para '" + newName + "'");
      }
    } else {
      var exists = await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(finalName));
      if (!exists || exists.length === 0) {
        await Promise.all([
          supabaseFetch("/representantes", {
            method: "POST",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({ nome: finalName })
          }),
          logAction(loggedUserUsername, "Cadastrou representante: " + finalName)
        ]);
      }
    }
    invalidateCatalogCache('representantes');

    // 2. Gerenciamento e Reset de Senha no Cadastro de Usuários
    if (password) {
      var users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(finalName));
      if (users && users.length > 0) {
        await Promise.all([
          supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(users[0].usuario), {
            method: "PATCH",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify({
              senha: password,
              status: 'ATIVO'
            })
          }),
          logAction(loggedUserUsername, "Resetou a senha de acesso do representante: " + finalName)
        ]);
        invalidateUserCache(users[0].usuario);
      } else {
        var newRepUser = {
          usuario: finalName,
          nome: finalName,
          senha: password,
          status: 'ATIVO',
          loja: 'Todos',
          conferencia: 'INATIVO',
          registros: 'INATIVO',
          dashboard: 'INATIVO',
          auditoria: 'INATIVO',
          configuracoes: 'INATIVO',
          logs: 'INATIVO',
          venda: 'ATIVO',
          log_vendas: 'INATIVO',
          resumo_vendas: 'INATIVO',
          medicos: 'med,vis'
        };
        await Promise.all([
          supabaseFetch("/usuarios", {
            method: "POST",
            headers: { "Prefer": "return=minimal" },
            payload: JSON.stringify(newRepUser)
          }),
          logAction(loggedUserUsername, "Criou conta de acesso com senha para o representante: " + finalName)
        ]);
        invalidateUserCache(finalName);
      }
    }

    return { success: true, name: finalName, passwordUpdated: !!password };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveRepresentante(name, loggedUserUsername, password) {
  return saveRepresentanteWithPassword("", name, password, loggedUserUsername);
}

async function renameRepresentante(oldName, newName, loggedUserUsername, password) {
  return saveRepresentanteWithPassword(oldName, newName, password, loggedUserUsername);
}

async function deleteRepresentante(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } });
    invalidateCatalogCache('representantes');
    try {
      var users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(name));
      if (users && users.length > 0) {
        await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(users[0].usuario), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ status: 'INATIVO' })
        });
        invalidateUserCache(users[0].usuario);
      }
    } catch (uErr) {
      console.warn("Aviso ao inativar login do representante excluído:", uErr);
    }
    await logAction(loggedUserUsername, "Excluiu representante: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 5. Contatos Resumo
async function addContatoResumo(name, phone, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      await Promise.all([
        supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ telefone: phone })
        }),
        logAction(loggedUserUsername, "Atualizou contato resumo: " + name)
      ]);
      invalidateCatalogCache('contatos_resumo');
      return { success: true };
    }
    await Promise.all([
      supabaseFetch("/contatos_resumo", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: name, telefone: phone })
      }),
      logAction(loggedUserUsername, "Cadastrou contato resumo: " + name)
    ]);
    invalidateCatalogCache('contatos_resumo');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteContatoResumo(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } }),
      logAction(loggedUserUsername, "Excluiu contato resumo: " + name)
    ]);
    invalidateCatalogCache('contatos_resumo');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 6. Produtos (Catálogo)
async function addProduto(record, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(record.nome));
    if (exists.length > 0) {
      await Promise.all([
        supabaseFetch("/produtos?nome=eq." + encodeURIComponent(record.nome), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({
            preco: Number(record.preco) || 0,
            laboratorio: record.laboratorio,
            tipo: record.tipo
          })
        }),
        logAction(loggedUserUsername, "Atualizou produto: " + record.nome)
      ]);
      invalidateCatalogCache('produtos');
      return { success: true };
    }
    await Promise.all([
      supabaseFetch("/produtos", {
        method: "POST",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({
          nome: record.nome,
          preco: Number(record.preco) || 0,
          laboratorio: record.laboratorio,
          tipo: record.tipo
        })
      }),
      logAction(loggedUserUsername, "Cadastrou produto: " + record.nome)
    ]);
    invalidateCatalogCache('produtos');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteProduto(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/produtos?nome=eq." + encodeURIComponent(name), { method: "DELETE", headers: { "Prefer": "return=minimal" } }),
      logAction(loggedUserUsername, "Excluiu produto: " + name)
    ]);
    invalidateCatalogCache('produtos');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}


// ==========================================
// SALVAR PARÂMETROS E CONFIGURAÇÕES
// ==========================================

async function saveConfigKey(key, value) {
  var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(key));
  if (exists.length > 0) {
    await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(key), {
      method: "PATCH",
      headers: { "Prefer": "return=minimal" },
      payload: JSON.stringify({ value: value.toString() })
    });
  } else {
    await supabaseFetch("/config_settings", {
      method: "POST",
      headers: { "Prefer": "return=minimal" },
      payload: JSON.stringify({ key: key, value: value.toString() })
    });
  }
  invalidateCatalogCache('config_settings');
}

async function saveLogoUrl(url, loggedUserUsername) {
  try {
    await Promise.all([
      saveConfigKey('logoUrl', url),
      logAction(loggedUserUsername, "Atualizou URL do logotipo")
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLogoUrl(loggedUserUsername) {
  try {
    await Promise.all([
      saveConfigKey('logoUrl', ''),
      logAction(loggedUserUsername, "Excluiu logotipo customizado")
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveSessionTimeoutSetting(value, loggedUserUsername) {
  try {
    await Promise.all([
      saveConfigKey('sessionTimeout', value),
      logAction(loggedUserUsername, "Alterou timeout da sessão para " + value + " horas")
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// GESTÃO DE USUÁRIOS
// ==========================================

function parseExtraPermissions(medicosColValue, user) {
  var extra = {
    medicos: 'ATIVO',
    orcamentos: 'INATIVO',
    garantias: 'INATIVO',
    devolucoes: 'INATIVO',
    assistencia: 'INATIVO',
    visitaMedica: 'INATIVO',
    vendaOSList: 'INATIVO',
    leadKanban: 'INATIVO',
    leadControle: 'INATIVO',
    ocorrencias: 'INATIVO',
    mustChangePassword: false
  };

  // Fallbacks para compatibilidade anterior se for um registro legado
  if (user) {
    var uName = (user.usuario || user.username || "").toLowerCase().trim();
    if (uName === 'admin') {
      extra.medicos = 'ATIVO';
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.devolucoes = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
      extra.leadKanban = 'ATIVO';
      extra.leadControle = 'ATIVO';
      extra.ocorrencias = 'ATIVO';
    }
    if (user.venda === 'ATIVO') {
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
    }
    if (user.conferencia === 'ATIVO') {
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
    }
    if (user.log_vendas === 'ATIVO' || user.log_venda === 'ATIVO') {
      extra.devolucoes = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
    }
  }

  if (medicosColValue !== null && medicosColValue !== undefined) {
    var str = medicosColValue.toString().trim();
    if (str.indexOf('{') === 0) {
      try {
        var parsed = JSON.parse(str);
        if (parsed.hasOwnProperty('medicos')) extra.medicos = parsed.medicos;
        if (parsed.hasOwnProperty('orcamentos')) extra.orcamentos = parsed.orcamentos;
        if (parsed.hasOwnProperty('garantias')) extra.garantias = parsed.garantias;
        if (parsed.hasOwnProperty('devolucoes')) extra.devolucoes = parsed.devolucoes;
        if (parsed.hasOwnProperty('assistencia')) extra.assistencia = parsed.assistencia;
        if (parsed.hasOwnProperty('visitaMedica')) extra.visitaMedica = parsed.visitaMedica;
        if (parsed.hasOwnProperty('vendaOSList')) extra.vendaOSList = parsed.vendaOSList;
        if (parsed.hasOwnProperty('leadKanban')) extra.leadKanban = parsed.leadKanban;
        if (parsed.hasOwnProperty('leadControle')) extra.leadControle = parsed.leadControle;
        if (parsed.hasOwnProperty('ocorrencias')) extra.ocorrencias = parsed.ocorrencias;
        if (parsed.hasOwnProperty('mustChangePassword')) extra.mustChangePassword = parsed.mustChangePassword;
      } catch (e) {}
    } else if (str === 'ATIVO' || str === 'INATIVO') {
      extra.medicos = str;
      if (extra.medicos === 'ATIVO') {
        extra.visitaMedica = 'ATIVO';
      }
    } else {
      // Formato compactado: lista separada por vírgula dos códigos de permissões ativas
      if (str !== "") {
        var parts = str.split(',');
        extra.medicos = parts.indexOf('med') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.orcamentos = parts.indexOf('orc') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.garantias = parts.indexOf('gar') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.devolucoes = parts.indexOf('dev') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.assistencia = parts.indexOf('ast') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.visitaMedica = parts.indexOf('vis') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.vendaOSList = parts.indexOf('osl') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.leadKanban = parts.indexOf('lkn') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.leadControle = parts.indexOf('lct') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.ocorrencias = parts.indexOf('oco') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.mustChangePassword = parts.indexOf('pw') !== -1;
      }
    }
  }

  // Se for admin, força para garantir acesso irrestrito a todas as permissões
  if (user) {
    var uName = (user.usuario || user.username || "").toLowerCase().trim();
    if (uName === 'admin') {
      extra.medicos = 'ATIVO';
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.devolucoes = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
      extra.leadKanban = 'ATIVO';
      extra.leadControle = 'ATIVO';
      extra.ocorrencias = 'ATIVO';
    }
  }

  return extra;
}

async function getUsersList(loggedUser) {
  var username = getUserUsername(loggedUser);
  if (username !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    var rawList = await supabaseFetch("/usuarios?order=usuario.asc");
    var formattedList = rawList.map(function(u) {
      var extra = parseExtraPermissions(u.medicos, u);
      return {
        username: u.usuario,
        senha: '••••••••',
        nome: u.nome,
        status: u.status,
        loja: u.loja || 'Todos',
        permissions: {
          conferencia: u.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: u.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: u.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: u.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: u.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: u.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: u.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: u.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: u.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          medicos: extra.medicos,
          orcamentos: extra.orcamentos,
          garantias: extra.garantias,
          devolucoes: extra.devolucoes,
          assistencia: extra.assistencia,
          visitaMedica: extra.visitaMedica,
          vendaOSList: extra.vendaOSList,
          leadKanban: extra.leadKanban,
          leadControle: extra.leadControle,
          ocorrencias: extra.ocorrencias,
          forcePasswordChange: extra.mustChangePassword ? 'ATIVO' : 'INATIVO'
        }
      };
    });
    return { success: true, users: formattedList };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveUser(userData, loggedUserUsername) {
  var username = getUserUsername(loggedUserUsername);
  if (username !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    var permissions = userData.permissions || {};
    var exists = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(userData.username));
    
    var passwordValue = userData.senha !== undefined ? userData.senha : userData.password;

    var payload = {
      usuario: userData.username,
      nome: userData.nome,
      status: userData.status,
      loja: userData.loja || 'Todos',
      conferencia: permissions.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      registros: permissions.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      dashboard: permissions.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      auditoria: permissions.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      configuracoes: permissions.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      logs: permissions.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      venda: permissions.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      log_vendas: permissions.logVendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      resumo_vendas: permissions.resumoVendas === 'ATIVO' ? 'ATIVO' : 'INATIVO'
    };

    var schemaSample = exists.length > 0 ? exists[0] : (await supabaseFetch("/usuarios?limit=1")[0] || {});
    if (schemaSample.hasOwnProperty('medicos') || schemaSample.medicos !== undefined) {
      // Criar formato compactado para caber no limite varchar(50) do banco de dados
      var arr = [];
      if (permissions.medicos === 'ATIVO') arr.push('med');
      if (permissions.orcamentos === 'ATIVO') arr.push('orc');
      if (permissions.garantias === 'ATIVO') arr.push('gar');
      if (permissions.devolucoes === 'ATIVO') arr.push('dev');
      if (permissions.assistencia === 'ATIVO') arr.push('ast');
      if (permissions.visitaMedica === 'ATIVO') arr.push('vis');
      if (permissions.vendaOSList === 'ATIVO') arr.push('osl');
      if (permissions.leadKanban === 'ATIVO') arr.push('lkn');
      if (permissions.leadControle === 'ATIVO') arr.push('lct');
      if (permissions.ocorrencias === 'ATIVO') arr.push('oco');
      if (permissions.forcePasswordChange === 'ATIVO') arr.push('pw');
      payload.medicos = arr.join(',');
    }
    
    if (exists.length > 0) {
      if (passwordValue && passwordValue.trim() !== "") {
        payload.senha = passwordValue;
      }
      
      await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(userData.username), {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou permissões do usuário: " + userData.username);
    } else {
      payload.senha = passwordValue || "";
      
      await supabaseFetch("/usuarios", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou novo usuário: " + userData.username);
    }
    
    invalidateUserCache(userData.username);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function changeOwnPassword(newPassword, loggedUserUsername, currentPassword) {
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
    }
    
    // Atualizar a senha e remover o 'pw' da coluna medicos
    var extra = parseExtraPermissions(user.medicos, user);
    
    var arr = [];
    if (extra.medicos === 'ATIVO') arr.push('med');
    if (extra.orcamentos === 'ATIVO') arr.push('orc');
    if (extra.garantias === 'ATIVO') arr.push('gar');
    if (extra.devolucoes === 'ATIVO') arr.push('dev');
    if (extra.assistencia === 'ATIVO') arr.push('ast');
    if (extra.visitaMedica === 'ATIVO') arr.push('vis');
    if (extra.vendaOSList === 'ATIVO') arr.push('osl');
    if (extra.leadKanban === 'ATIVO') arr.push('lkn');
    if (extra.leadControle === 'ATIVO') arr.push('lct');
    // omitimos 'pw' aqui para remover a exigência de alteração
    
    var payload = {
      senha: newPassword,
      medicos: arr.join(',')
    };
    
    await Promise.all([
      supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username), {
        method: "PATCH",
        payload: JSON.stringify(payload)
      }),
      logAction(username, "Alterou a própria senha (limpou exigência de primeiro login)")
    ]);
    
    invalidateUserCache(username);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteUser(username, loggedUserUsername) {
  var reqUser = getUserUsername(loggedUserUsername);
  if (reqUser !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    if (username === 'admin') {
      throw new Error("O usuário administrador padrão 'admin' não pode ser excluído.");
    }
    await Promise.all([
      supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username), {
        method: "DELETE"
      }),
      logAction(loggedUserUsername, "Excluiu usuário: " + username)
    ]);
    invalidateUserCache(username);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// EMISSÃO DE PDF DE FECHAMENTO DIÁRIO
// ==========================================

async function getOrCreateAppFolder() {
  try {
    var folderName = "planilha_controle_lentes_V2_Assets";
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next();
    }
    return DriveApp.createFolder(folderName);
  } catch (e) {
    Logger.log("Erro em getOrCreateAppFolder: " + e.toString());
    return null;
  }
}

async function generateDailySummaryPDF(dateStr, loggedUser) {
  if (!await validateUserSession(loggedUser, 'logVendas') && 
      !await validateUserSession(loggedUser, 'venda') && 
      !await validateUserSession(loggedUser, 'vendaOSList') &&
      !await validateUserSession(loggedUser, 'conferencia')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    // 1. Carregar as vendas da data informada no Supabase
    var salesRaw = await supabaseFetch("/vendas?data=eq." + encodeURIComponent(dateStr));
    
    var sales = [];
    for (var i = 0; i < salesRaw.length; i++) {
      var row = salesRaw[i];
      var details = row.detalhes || {};
      
      // Montar exibição amigável de formas de pagamento
      var fpDisplay = details.Forma_Pagamento_1 || details.Forma_Pagamento || 'Não Informado';
      var parts = [];
      if (Number(details.Valor_Pagamento_1) > 0) {
        parts.push(fpDisplay + ' (R$ ' + Number(details.Valor_Pagamento_1).toFixed(2) + ')');
      }
      if (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum' && Number(details.Valor_Pagamento_2) > 0) {
        parts.push(details.Forma_Pagamento_2 + ' (R$ ' + Number(details.Valor_Pagamento_2).toFixed(2) + ')');
      }
      if (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum' && Number(details.Valor_Pagamento_3) > 0) {
        parts.push(details.Forma_Pagamento_3 + ' (R$ ' + Number(details.Valor_Pagamento_3).toFixed(2) + ')');
      }
      if (parts.length > 0) {
        fpDisplay = parts.join(' + ');
      }

      sales.push({
        os: row.os_venda,
        loja: row.loja,
        vendedor: row.vendedor,
        cliente: row.cliente_nome,
        total: Number(row.total_venda) || 0,
        pago: Number(details.Valor_Pago) || (Number(details.Valor_Pagamento_1 || 0) + Number(details.Valor_Pagamento_2 || 0) + Number(details.Valor_Pagamento_3 || 0)) || 0,
        residual: Number(details.Valor_Residual) || 0,
        formaPag: fpDisplay,
        formaPag1: details.Forma_Pagamento_1 || details.Forma_Pagamento || '',
        valorPag1: Number(details.Valor_Pagamento_1) || 0,
        formaPag2: (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum') ? details.Forma_Pagamento_2 : '',
        valorPag2: Number(details.Valor_Pagamento_2) || 0,
        formaPag3: (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum') ? details.Forma_Pagamento_3 : '',
        valorPag3: Number(details.Valor_Pagamento_3) || 0
      });
    }

    if (sales.length === 0) {
      var displayDateSplit = dateStr.split('-');
      throw new Error("Nenhuma venda registrada na data: " + displayDateSplit[2] + "/" + displayDateSplit[1] + "/" + displayDateSplit[0]);
    }

    var summaryLoja = {};
    var summaryFormaPag = {};
    var summaryVendedor = {};
    var grandTotal = 0;
    var grandPago = 0;
    var grandResidual = 0;

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      grandTotal += s.total;
      grandPago += s.pago;
      grandResidual += s.residual;

      if (!summaryLoja[s.loja]) summaryLoja[s.loja] = { total: 0, pago: 0, residual: 0, count: 0 };
      summaryLoja[s.loja].total += s.total;
      summaryLoja[s.loja].pago += s.pago;
      summaryLoja[s.loja].residual += s.residual;
      summaryLoja[s.loja].count++;

      var f1 = s.formaPag1 || '';
      var v1 = s.valorPag1 || 0;
      var f2 = s.formaPag2 || '';
      var v2 = s.valorPag2 || 0;
      var f3 = s.formaPag3 || '';
      var v3 = s.valorPag3 || 0;

      // Fallback para vendas antigas
      if (!v1 && !v2 && !v3) {
        f1 = s.formaPag || 'Não Informado';
        v1 = s.pago || s.total || 0;
      }

      var totalPag = v1 + v2 + v3;
      if (totalPag > 0) {
        if (v1 > 0 && f1) {
          var prop1 = v1 / totalPag;
          var fat1 = s.total * prop1;
          if (!summaryFormaPag[f1]) summaryFormaPag[f1] = { total: 0, count: 0 };
          summaryFormaPag[f1].total += fat1;
          summaryFormaPag[f1].count++;
        }
        if (v2 > 0 && f2) {
          var prop2 = v2 / totalPag;
          var fat2 = s.total * prop2;
          if (!summaryFormaPag[f2]) summaryFormaPag[f2] = { total: 0, count: 0 };
          summaryFormaPag[f2].total += fat2;
          summaryFormaPag[f2].count++;
        }
        if (v3 > 0 && f3) {
          var prop3 = v3 / totalPag;
          var fat3 = s.total * prop3;
          if (!summaryFormaPag[f3]) summaryFormaPag[f3] = { total: 0, count: 0 };
          summaryFormaPag[f3].total += fat3;
          summaryFormaPag[f3].count++;
        }
      } else {
        var fFallback = f1 || 'Não Informado';
        if (!summaryFormaPag[fFallback]) summaryFormaPag[fFallback] = { total: 0, count: 0 };
        summaryFormaPag[fFallback].total += s.total;
        summaryFormaPag[fFallback].count++;
      }

      var vName = s.vendedor || 'Não Identificado';
      if (!summaryVendedor[vName]) summaryVendedor[vName] = { total: 0, count: 0 };
      summaryVendedor[vName].total += s.total;
      summaryVendedor[vName].count++;
    }

    var dateParts = dateStr.split('-');
    var displayDate = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fechamento de Vendas do Dia ' + displayDate + '</title>' +
      '<style>' +
      'body { font-family: sans-serif; color: #333; padding: 20px; line-height: 1.4; }' +
      '.header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-bottom: 20px; }' +
      '.title { font-size: 24px; font-weight: bold; color: #10b981; }' +
      '.section { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }' +
      '.section-title { font-weight: bold; color: #1e293b; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; font-size: 14px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; }' +
      'th, td { border: 1px solid #ddd; padding: 6px; }' +
      'th { background-color: #f1f5f9; text-align: left; }' +
      '.text-right { text-align: right; }' +
      '.text-center { text-align: center; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      '<div class="header"><div class="title">RESUMO DE VENDAS DIÁRIO</div><div>Data: ' + displayDate + ' | Relatório consolidado</div></div>' +
      
      '<div class="section"><div class="section-title">CONSOLIDADO POR FILIAL / LOJA</div>' +
      '<table><thead><tr><th>Loja/Filial</th><th class="text-center">Vendas</th><th class="text-right">Faturamento (R$)</th><th class="text-right">Recebido (R$)</th><th class="text-right">Residual (R$)</th></tr></thead><tbody>';

    var lojas = Object.keys(summaryLoja);
    for (var i = 0; i < lojas.length; i++) {
      var lj = lojas[i];
      var dataLj = summaryLoja[lj];
      html += '<tr><td><strong>' + lj + '</strong></td><td class="text-center">' + dataLj.count + '</td><td class="text-right">R$ ' + dataLj.total.toFixed(2) + '</td><td class="text-right">R$ ' + dataLj.pago.toFixed(2) + '</td><td class="text-right">R$ ' + dataLj.residual.toFixed(2) + '</td></tr>';
    }
    html += '<tr class="bold" style="background-color:#f8fafc;"><td>TOTAL CONSOLIDADO</td><td class="text-center">' + sales.length + '</td><td class="text-right">R$ ' + grandTotal.toFixed(2) + '</td><td class="text-right">R$ ' + grandPago.toFixed(2) + '</td><td class="text-right">R$ ' + grandResidual.toFixed(2) + '</td></tr>';
    html += '</tbody></table></div>' +

      '<div class="section"><div class="section-title">CONSOLIDADO POR VENDEDOR</div>' +
      '<table><thead><tr><th>Vendedor</th><th class="text-center">Vendas</th><th class="text-right">Faturamento (R$)</th></tr></thead><tbody>';
    var vendsList = Object.keys(summaryVendedor);
    for (var i = 0; i < vendsList.length; i++) {
      var v = vendsList[i];
      var dataV = summaryVendedor[v];
      html += '<tr><td><strong>' + v + '</strong></td><td class="text-center">' + dataV.count + '</td><td class="text-right">R$ ' + dataV.total.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">RESUMO POR FORMA DE PAGAMENTO</div>' +
      '<table><thead><tr><th>Forma de Pagamento</th><th class="text-center">Operações</th><th class="text-right">Faturamento (R$)</th></tr></thead><tbody>';

    var formas = Object.keys(summaryFormaPag);
    for (var i = 0; i < formas.length; i++) {
      var fp = formas[i];
      var dataFp = summaryFormaPag[fp];
      html += '<tr><td><strong>' + fp + '</strong></td><td class="text-center">' + dataFp.count + '</td><td class="text-right">R$ ' + dataFp.total.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">DETALHE DAS TRANSAÇÕES (OS)</div>' +
      '<table><thead><tr><th>OS</th><th>Cliente</th><th>Loja</th><th>Vendedor</th><th>Forma Pag.</th><th class="text-right">Total</th><th class="text-right">Pago</th><th class="text-right">Residual</th></tr></thead><tbody>';

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      html += '<tr><td><strong>' + s.os + '</strong></td><td>' + s.cliente + '</td><td>' + s.loja + '</td><td>' + (s.vendedor || '') + '</td><td>' + s.formaPag + '</td><td class="text-right">R$ ' + s.total.toFixed(2) + '</td><td class="text-right">R$ ' + s.pago.toFixed(2) + '</td><td class="text-right">R$ ' + s.residual.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div style="text-align:center; font-size:10px; color:#999; margin-top:30px;">Gerado automaticamente por Óticas Gestão Integrada</div>' +
      '</body></html>';

    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    var username = getUserUsername(loggedUser);
    await logAction(username || "admin", "Gerou resumo de vendas PDF do dia: " + displayDate);
    
    return { success: true, url: downloadUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================================
// FUNÇÕES DE COMPATIBILIDADE DE ROTAS E MÉTODOS ADICIONAIS
// ==========================================================

async function saveVenda(record, loggedUserUsername) {
  return addVenda(record, loggedUserUsername);
}

async function saveLancamento(record, loggedUserUsername) {
  return addConferencia(record, loggedUserUsername);
}

async function deleteVenda(os, loggedUserUsername) {
  return deleteVendas([os], loggedUserUsername);
}

async function deleteVendasBulk(osList, loggedUserUsername) {
  return deleteVendas(osList, loggedUserUsername);
}

async function deleteLancamento(os, dataStr, loggedUserUsername) {
  return deleteConferencia(os, dataStr, loggedUserUsername);
}

async function deleteLancamentosBulk(items, loggedUserUsername) {
  return deleteConferenciaGroup(items, loggedUserUsername);
}

async function saveConfigParam(key, val, loggedUserUsername) {
  if (key === 'assistencias' || key === 'visitas') {
    if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia'])) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'orcamentos', 'configuracoes'])) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'medicos' || key === 'clinicas') {
    if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'medicos', 'configuracoes', 'visitaMedica'])) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  if (key === 'motivosPerda' || key === 'motivos_perda') {
    try {
      await supabaseFetch("/config_settings?key=eq.motivos_perda", { method: "DELETE", headers: { "Prefer": "return=minimal" } });
    } catch (e) {}
    key = 'motivosPerda';
  }

  if (key === 'motivosOcorrencia' || key === 'motivos_ocorrencia') {
    try {
      await supabaseFetch("/config_settings?key=eq.motivos_ocorrencia", { method: "DELETE", headers: { "Prefer": "return=minimal" } });
    } catch (e) {}
    key = 'motivosOcorrencia';
  }

  try {
    var queryKey = key;
    var serializedVal = typeof val === 'string' ? val : JSON.stringify(val);
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    var logVal = serializedVal.length > 150 ? serializedVal.substring(0, 150) + "... (dados compactados)" : serializedVal;

    if (exists.length > 0) {
      await Promise.all([
        supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ value: serializedVal })
        }),
        logAction(loggedUserUsername, "Alterou parâmetro " + queryKey + " para " + logVal)
      ]);
    } else {
      await Promise.all([
        supabaseFetch("/config_settings", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ key: queryKey, value: serializedVal })
        }),
        logAction(loggedUserUsername, "Alterou parâmetro " + queryKey + " para " + logVal)
      ]);
    }
    invalidateCatalogCache('config_settings');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function normalizeCrm(val) {
  if (!val) return "";
  return val.toString().replace(/[^a-zA-Z0-9]/g, "").toLowerCase().trim();
}

// ==========================================================
// FASE 3: OPERAÇÕES ATÔMICAS DE LINHA ÚNICA (ZERO RACE CONDITION)
// Tabelas relacionais dedicadas com fallback transparente para config_settings
// ==========================================================

async function upsertMedico(med, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'medicos', 'visitaMedica', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  if (!med || !med.nome || !med.crm) {
    return { success: false, error: 'Nome e CRM do médico são obrigatórios.' };
  }
  try {
    var medId = med.idMedico || med.id || ('MED-' + Date.now());
    var row = {
      id: medId,
      crm: String(med.crm).trim(),
      nome: String(med.nome).trim(),
      representante: med.representante || '',
      detalhes: Object.assign({}, med, { idMedico: medId })
    };

    var relCheck = await fetchRelationalTableSafe('medicos', '?crm=eq.' + encodeURIComponent(row.crm) + '&limit=5');
    if (relCheck !== null) {
      var existing = relCheck.find(function(x) { return normalizeCrm(x.crm) === normalizeCrm(row.crm); });
      if (existing && !med.allowOverwrite && existing.id !== medId) {
        row.id = existing.id;
      }
      await Promise.all([
        supabaseFetch('/medicos?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          payload: JSON.stringify(row)
        }),
        logAction(loggedUserUsername, "Gravou médico (atômico): " + row.nome + " CRM: " + row.crm)
      ]);
      return { success: true, record: formatMedicoFromRow(row) };
    }

    var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
    var medicos = [];
    if (medicosRaw.length > 0) {
      try { medicos = JSON.parse(medicosRaw[0].value) || []; } catch (e) {}
    }
    var idx = medicos.findIndex(function(m) {
      return (m.idMedico && m.idMedico === medId) || normalizeCrm(m.crm) === normalizeCrm(row.crm);
    });
    var formatted = formatMedicoFromRow(row);
    if (idx !== -1) {
      medicos[idx] = formatted;
    } else {
      medicos.push(formatted);
    }
    await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    return { success: true, record: formatted };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteMedicoRecord(idOrCrm, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['configuracoes', 'visitaMedica'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('medicos', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/medicos?or=(id.eq.' + encodeURIComponent(idOrCrm) + ',crm.eq.' + encodeURIComponent(idOrCrm) + ')', {
          method: 'DELETE',
          headers: { 'Prefer': 'return=minimal' }
        }),
        logAction(loggedUserUsername, "Removeu médico (atômico): " + idOrCrm)
      ]);
      return { success: true };
    }

    var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
    var medicos = medicosRaw.length > 0 ? (JSON.parse(medicosRaw[0].value) || []) : [];
    var filtered = medicos.filter(function(m) {
      return m.idMedico !== idOrCrm && m.id !== idOrCrm && normalizeCrm(m.crm) !== normalizeCrm(idOrCrm);
    });
    await saveConfigParam('medicos', JSON.stringify(filtered), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function bulkUpdateMedicosRepresentante(crmsList, representante, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  if (!Array.isArray(crmsList) || crmsList.length === 0) {
    return { success: true };
  }
  try {
    var repVal = representante || '';
    var relCheck = await fetchRelationalTableSafe('medicos', '?limit=1');
    if (relCheck !== null) {
      var inList = crmsList.map(function(c) { return '"' + String(c).replace(/"/g, '') + '"'; }).join(',');
      await Promise.all([
        supabaseFetch('/medicos?crm=in.(' + encodeURIComponent(inList) + ')', {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          payload: JSON.stringify({ representante: repVal })
        }),
        logAction(loggedUserUsername, (repVal ? "Vinculou " : "Desvinculou ") + crmsList.length + " médicos (" + (repVal || 'Sem Rep') + ")")
      ]);
      return { success: true };
    }

    var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
    var medicos = medicosRaw.length > 0 ? (JSON.parse(medicosRaw[0].value) || []) : [];
    var crmSet = new Set(crmsList.map(normalizeCrm));
    medicos.forEach(function(m) {
      if (crmSet.has(normalizeCrm(m.crm))) {
        m.representante = repVal;
      }
    });
    await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function addMedico(med, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'visitaMedica', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('medicos', '?crm=eq.' + encodeURIComponent(med.crm || '') + '&limit=5');
    if (relCheck !== null) {
      if (relCheck.some(function(x) { return normalizeCrm(x.crm) === normalizeCrm(med.crm); })) {
        return { success: false, error: 'Médico com este CRM já cadastrado.' };
      }
      return await upsertMedico(med, loggedUserUsername);
    }

    var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
    var medicos = [];
    if (medicosRaw.length > 0) {
      try { medicos = JSON.parse(medicosRaw[0].value); } catch(e) {}
    }
    for (var i = 0; i < medicos.length; i++) {
      if (normalizeCrm(medicos[i].crm) === normalizeCrm(med.crm)) {
        return { success: false, error: 'Médico com este CRM já cadastrado.' };
      }
    }
    medicos.push(med);
    await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function upsertClinica(clin, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'visitaMedica', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  if (!clin || !clin.nome) {
    return { success: false, error: 'Nome da clínica é obrigatório.' };
  }
  try {
    var clinId = clin.id || ('CLIN-' + Date.now());
    var row = {
      id: clinId,
      nome: String(clin.nome).trim(),
      cidade: clin.cidade || '',
      representante: clin.representante || '',
      detalhes: Object.assign({}, clin, { id: clinId })
    };

    var relCheck = await fetchRelationalTableSafe('clinicas', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/clinicas?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          payload: JSON.stringify(row)
        }),
        logAction(loggedUserUsername, "Gravou clínica (atômico): " + row.nome)
      ]);
      return { success: true, record: formatClinicaFromRow(row) };
    }

    var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
    var clinicas = clinicasRaw.length > 0 ? (JSON.parse(clinicasRaw[0].value) || []) : [];
    var idx = clinicas.findIndex(function(c) {
      return (c.id && c.id === clinId) || (c.nome && c.nome.toLowerCase().trim() === row.nome.toLowerCase());
    });
    var formatted = formatClinicaFromRow(row);
    if (idx !== -1) {
      clinicas[idx] = formatted;
    } else {
      clinicas.push(formatted);
    }
    await saveConfigParam('clinicas', JSON.stringify(clinicas), loggedUserUsername);
    return { success: true, record: formatted };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteClinicaRecord(idOrNome, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['configuracoes', 'visitaMedica'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('clinicas', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/clinicas?or=(id.eq.' + encodeURIComponent(idOrNome) + ',nome.eq.' + encodeURIComponent(idOrNome) + ')', {
          method: 'DELETE',
          headers: { 'Prefer': 'return=minimal' }
        }),
        logAction(loggedUserUsername, "Removeu clínica (atômico): " + idOrNome)
      ]);
      return { success: true };
    }

    var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
    var clinicas = clinicasRaw.length > 0 ? (JSON.parse(clinicasRaw[0].value) || []) : [];
    var filtered = clinicas.filter(function(c) {
      return c.id !== idOrNome && (c.nome || '').toLowerCase().trim() !== String(idOrNome).toLowerCase().trim();
    });
    await saveConfigParam('clinicas', JSON.stringify(filtered), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function addClinica(clin, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'visitaMedica', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('clinicas', '?nome=ilike.' + encodeURIComponent((clin.nome || '').trim()) + '&limit=5');
    if (relCheck !== null) {
      if (relCheck.some(function(c) { return (c.nome || '').toLowerCase().trim() === (clin.nome || '').toLowerCase().trim(); })) {
        return { success: false, error: 'Clínica com este nome já cadastrada.' };
      }
      return await upsertClinica(clin, loggedUserUsername);
    }

    var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
    var clinicas = [];
    if (clinicasRaw.length > 0) {
      try { clinicas = JSON.parse(clinicasRaw[0].value); } catch(e) {}
    }
    for (var i = 0; i < clinicas.length; i++) {
      if (clinicas[i].nome.toLowerCase().trim() === clin.nome.toLowerCase().trim()) {
        return { success: false, error: 'Clínica com este nome já cadastrada.' };
      }
    }
    clinicas.push(clin);
    await saveConfigParam('clinicas', JSON.stringify(clinicas), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function upsertOrcamento(orc, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'orcamentos', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  if (!orc) {
    return { success: false, error: 'Dados do orçamento não informados.' };
  }
  try {
    var orcId = orc.id || crypto.randomUUID();
    var row = {
      id: orcId,
      data: orc.data || new Date().toISOString().split('T')[0],
      loja: orc.loja || '',
      vendedor: orc.vendedor || '',
      valor_estimado: Number(orc.valorEstimado) || 0,
      cliente_nome: orc.clienteNome || '',
      cliente_whatsapp: orc.clienteWhatsApp || '',
      cliente_email: orc.clienteEmail || '',
      motivo_perda: orc.motivoPerda || '',
      detalhes: orc.detalhes || '',
      extra: Object.assign({}, orc, { id: orcId })
    };

    var relCheck = await fetchRelationalTableSafe('orcamentos', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/orcamentos?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          payload: JSON.stringify(row)
        }),
        logAction(loggedUserUsername, "Registrou orçamento perdido (atômico): " + row.cliente_nome)
      ]);
      return { success: true, record: formatOrcamentoFromRow(row) };
    }

    return await addConfigRecord('orcamentos', Object.assign({}, orc, { id: orcId }), loggedUserUsername);
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteOrcamentoRecord(idOrUniqueStr, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'orcamentos', 'configuracoes'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('orcamentos', '?limit=1');
    if (relCheck !== null) {
      if (idOrUniqueStr && idOrUniqueStr.indexOf('|') === -1) {
        await Promise.all([
          supabaseFetch('/orcamentos?id=eq.' + encodeURIComponent(idOrUniqueStr), {
            method: 'DELETE',
            headers: { 'Prefer': 'return=minimal' }
          }),
          logAction(loggedUserUsername, "Removeu orçamento ID: " + idOrUniqueStr)
        ]);
        return { success: true };
      }
      var parts = String(idOrUniqueStr || '').split('|');
      var q = '/orcamentos?data=eq.' + encodeURIComponent(parts[0] || '') +
              '&loja=eq.' + encodeURIComponent(parts[1] || '') +
              '&cliente_nome=eq.' + encodeURIComponent(parts[3] || '');
      await Promise.all([
        supabaseFetch(q, { method: 'DELETE', headers: { 'Prefer': 'return=minimal' } }),
        logAction(loggedUserUsername, "Removeu orçamento: " + (parts[3] || idOrUniqueStr))
      ]);
      return { success: true };
    }

    var raw = await supabaseFetch("/config_settings?key=eq.orcamentos");
    var list = raw.length > 0 ? (JSON.parse(raw[0].value) || []) : [];
    var partsFb = String(idOrUniqueStr || '').split('|');
    var updated = list.filter(function(o) {
      if (o.id && o.id === idOrUniqueStr) return false;
      if (partsFb.length >= 5) {
        var matches = o.data === partsFb[0] &&
                      o.loja === partsFb[1] &&
                      o.vendedor === partsFb[2] &&
                      o.clienteNome === partsFb[3] &&
                      Number(o.valorEstimado).toFixed(2) === Number(partsFb[4]).toFixed(2);
        return !matches;
      }
      return true;
    });
    await saveConfigParam('orcamentos', JSON.stringify(updated), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function upsertAssistencia(assist, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  if (!assist) {
    return { success: false, error: 'Dados da assistência não informados.' };
  }
  try {
    var astId = assist.id || crypto.randomUUID();
    var row = {
      id: astId,
      os_loja: String(assist.osLoja || ''),
      loja: assist.loja || '',
      cliente_nome: assist.clienteNome || '',
      cliente_telefone: assist.clienteTelefone || '',
      cliente_email: assist.clienteEmail || '',
      lente_original: assist.lenteOriginal || '',
      motivo_queixa: assist.motivoQueixa || '',
      detalhes_queixa: assist.detalhesQueixa || '',
      tecnico_nome: assist.tecnicoNome || '',
      tecnico_whatsapp: assist.tecnicoWhatsApp || '',
      tecnico_calendly: assist.tecnicoCalendly || '',
      data_agendamento: assist.dataAgendamento || '',
      status: assist.status || 'PENDENTE_ACEITE',
      detalhes: Object.assign({}, assist, { id: astId })
    };

    var relCheck = await fetchRelationalTableSafe('assistencias', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/assistencias?on_conflict=id', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          payload: JSON.stringify(row)
        }),
        logAction(loggedUserUsername, "Registrou assistência técnica OS " + row.os_loja + " (atômico)")
      ]);
      return { success: true, record: formatAssistenciaFromRow(row) };
    }

    return await addConfigRecord('assistencias', Object.assign({}, assist, { id: astId }), loggedUserUsername);
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function updateAssistenciaStatus(assistId, newStatus, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('assistencias', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/assistencias?id=eq.' + encodeURIComponent(assistId), {
          method: 'PATCH',
          headers: { 'Prefer': 'return=minimal' },
          payload: JSON.stringify({ status: newStatus })
        }),
        logAction(loggedUserUsername, "Atualizou status da assistência " + assistId + " para " + newStatus)
      ]);
      return { success: true };
    }

    var raw = await supabaseFetch("/config_settings?key=eq.assistencias");
    var list = raw.length > 0 ? (JSON.parse(raw[0].value) || []) : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === assistId) {
        list[i].status = newStatus;
        break;
      }
    }
    await saveConfigParam('assistencias', JSON.stringify(list), loggedUserUsername);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteAssistenciaRecord(assistId, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var relCheck = await fetchRelationalTableSafe('assistencias', '?limit=1');
    if (relCheck !== null) {
      await Promise.all([
        supabaseFetch('/assistencias?id=eq.' + encodeURIComponent(assistId), {
          method: 'DELETE',
          headers: { 'Prefer': 'return=minimal' }
        }),
        logAction(loggedUserUsername, "Excluiu assistência técnica ID: " + assistId)
      ]);
      return { success: true };
    }

    return await deleteConfigRecord('assistencias', assistId, loggedUserUsername);
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function addVisitaMedica(visitaData, loggedUserUsername) {
  if (typeof loggedUserUsername === 'object' && loggedUserUsername) {
    loggedUserUsername = loggedUserUsername.username;
  }
  var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia']);
  if (!hasPerm) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  if (!visitaData) {
    return { success: false, error: "Dados da visita não informados." };
  }

  try {
    var id = visitaData.id || crypto.randomUUID();
    var row = {
      id: id,
      data: visitaData.data || new Date().toISOString().split('T')[0],
      hora: visitaData.hora || '12:00',
      representante: visitaData.representante || 'Geral',
      medico_nome: visitaData.medicoNome || visitaData.medico_nome || 'Desconhecido',
      medico_crm: visitaData.medicoCrm || visitaData.medico_crm || '',
      assunto: visitaData.assunto || 'Visita',
      status: visitaData.status || 'EFETIVADA',
      relato: visitaData.relato || '',
      lat: (visitaData.lat !== null && visitaData.lat !== undefined && !isNaN(visitaData.lat)) ? Number(visitaData.lat) : null,
      lng: (visitaData.lng !== null && visitaData.lng !== undefined && !isNaN(visitaData.lng)) ? Number(visitaData.lng) : null
    };

    await Promise.all([
      supabaseFetch("/visitas_medicas?on_conflict=id", {
        method: "POST",
        headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
        payload: JSON.stringify(row)
      }),
      logAction(loggedUserUsername, "Registrou visita médica: " + row.medico_nome + " (" + row.representante + ")")
    ]);

    var formattedRecord = formatVisitaFromRow(row);
    return { success: true, data: formattedRecord, record: formattedRecord };
  } catch (err) {
    console.error("Erro ao registrar visita médica em public.visitas_medicas:", err);
    return { success: false, error: err.toString() };
  }
}

async function deleteVisitaMedica(visitaId, loggedUserUsername) {
  if (typeof loggedUserUsername === 'object' && loggedUserUsername) {
    loggedUserUsername = loggedUserUsername.username;
  }
  var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia']);
  if (!hasPerm) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  if (!visitaId) {
    return { success: false, error: "ID da visita não informado." };
  }

  try {
    await Promise.all([
      supabaseFetch("/visitas_medicas?id=eq." + encodeURIComponent(visitaId), {
        method: "DELETE",
        headers: { "Prefer": "return=minimal" }
      }),
      logAction(loggedUserUsername, "Removeu registro de visita médica ID: " + visitaId)
    ]);
    return { success: true, deletedId: visitaId };
  } catch (err) {
    console.error("Erro ao excluir visita médica:", err);
    return { success: false, error: err.toString() };
  }
}

async function addConfigRecord(key, record, loggedUserUsername) {
  if (key === 'visitas') {
    return await addVisitaMedica(record, loggedUserUsername);
  }
  if (key === 'assistencias') {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'configuracoes']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  try {
    var queryKey = key;
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    var currentArray = [];
    if (exists.length > 0) {
      try { currentArray = JSON.parse(exists[0].value) || []; } catch(e) {}
    }

    currentArray.unshift(record);
    var val = JSON.stringify(currentArray);

    if (exists.length > 0) {
      await Promise.all([
        supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ value: val })
        }),
        logAction(loggedUserUsername, "Adicionou registro no parâmetro " + queryKey)
      ]);
    } else {
      await Promise.all([
        supabaseFetch("/config_settings", {
          method: "POST",
          headers: { "Prefer": "return=minimal" },
          payload: JSON.stringify({ key: queryKey, value: val })
        }),
        logAction(loggedUserUsername, "Adicionou registro no parâmetro " + queryKey)
      ]);
    }
    invalidateCatalogCache('config_settings');
    return { success: true, data: currentArray };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteConfigRecord(key, recordId, loggedUserUsername) {
  if (key === 'visitas') {
    return await deleteVisitaMedica(recordId, loggedUserUsername);
  }
  if (key === 'assistencias') {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['venda', 'configuracoes']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  try {
    var queryKey = key;
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    var currentArray = [];
    if (exists.length > 0) {
      try { currentArray = JSON.parse(exists[0].value) || []; } catch(e) {}
    } else {
      return { success: false, error: "Parâmetro não encontrado." };
    }

    var initialLength = currentArray.length;
    currentArray = currentArray.filter(function(v) {
      return v.id !== recordId;
    });

    if (currentArray.length === initialLength) {
      return { success: false, error: "Registro não encontrado para exclusão." };
    }

    var val = JSON.stringify(currentArray);
    await Promise.all([
      supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ value: val })
      }),
      logAction(loggedUserUsername, "Removeu registro no parâmetro " + queryKey + " ID: " + recordId)
    ]);
    invalidateCatalogCache('config_settings');
    return { success: true, data: currentArray };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}


async function importBulkCadastros(dataObj, overwrite, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    // 1. Importar Lojas
    if (dataObj.lojas && dataObj.lojas.length > 0) {
      if (overwrite) {
        await supabaseFetch("/lojas?id=gt.0", { method: "DELETE" });
      }
      for (const lj of (dataObj.lojas || [])) {
        var name = typeof lj === 'string' ? lj : lj.nome;
        if (!name) continue;
        var exists = await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name));
        if (exists.length === 0) {
          await supabaseFetch("/lojas", { method: "POST", payload: JSON.stringify({ nome: name }) });
        }
      }
    }

    // 2. Importar Laboratórios
    if (dataObj.laboratorios && dataObj.laboratorios.length > 0) {
      if (overwrite) {
        await supabaseFetch("/laboratorios?id=gt.0", { method: "DELETE" });
      }
      for (const lb of (dataObj.laboratorios || [])) {
        var name = typeof lb === 'string' ? lb : lb.nome;
        if (!name) continue;
        var exists = await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name));
        if (exists.length === 0) {
          await supabaseFetch("/laboratorios", { method: "POST", payload: JSON.stringify({ nome: name }) });
        }
      }
    }

    // 3. Importar Produtos
    if (dataObj.produtos && dataObj.produtos.length > 0) {
      if (overwrite) {
        await supabaseFetch("/produtos?id=gt.0", { method: "DELETE" });
      }
      for (const p of (dataObj.produtos || [])) {
        var exists = await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(p.nome));
        if (exists.length === 0) {
          await supabaseFetch("/produtos", {
            method: "POST",
            payload: JSON.stringify({
              nome: p.nome,
              preco: Number(p.preco) || 0,
              laboratorio: p.laboratorio || '',
              tipo: p.tipo || ''
            })
          });
        }
      }
    }

    // 4. Importar Médicos (Salvo em config_settings)
    if (dataObj.medicos && dataObj.medicos.length > 0) {
      var medicos = [];
      if (!overwrite) {
        var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
        if (medicosRaw.length > 0) {
          try { medicos = JSON.parse(medicosRaw[0].value); } catch(e) {}
        }
      }
      dataObj.medicos.forEach(function(newMed) {
        var dup = false;
        for (var i = 0; i < medicos.length; i++) {
          if (medicos[i].crm === newMed.crm) { dup = true; break; }
        }
        if (!dup) {
          medicos.push(newMed);
        }
      });
      await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    }

    // 5. Importar Clínicas (Salvo em config_settings)
    if (dataObj.clinicas && dataObj.clinicas.length > 0) {
      var clinicas = [];
      if (!overwrite) {
        var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
        if (clinicasRaw.length > 0) {
          try { clinicas = JSON.parse(clinicasRaw[0].value); } catch(e) {}
        }
      }
      dataObj.clinicas.forEach(function(newClin) {
        var dup = false;
        for (var i = 0; i < clinicas.length; i++) {
          if (clinicas[i].nome.toLowerCase().trim() === newClin.nome.toLowerCase().trim()) { dup = true; break; }
        }
        if (!dup) {
          clinicas.push({
            nome: newClin.nome,
            representante: newClin.representante || ''
          });
        }
      });
      await saveConfigParam('clinicas', JSON.stringify(clinicas), loggedUserUsername);
    }

    await logAction(loggedUserUsername, "Efetuou importação em lote de cadastros");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function generateSalePDF(os, loggedUser) {
  if (!await validateUserSession(loggedUser, 'logVendas')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var salesRaw = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
    if (salesRaw.length === 0) {
      throw new Error("Venda não encontrada com a OS: " + os);
    }
    
    var v = salesRaw[0];
    var details = v.detalhes || {};
    var displayDate = ymdToDmy(v.data);
    
    var logoHtml = "";
    var configsList = await supabaseFetch("/config_settings?key=eq.logoUrl");
    if (configsList.length > 0 && configsList[0].value) {
      logoHtml = '<div style="text-align:center; margin-bottom:15px;"><img src="' + configsList[0].value + '" style="max-height:50px;"></div>';
    }
    
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante de Venda OS ' + os + '</title>' +
      '<style>' +
      'body { font-family: sans-serif; color: #333; padding: 20px; line-height: 1.4; font-size: 12px; }' +
      '.header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; }' +
      '.title { font-size: 20px; font-weight: bold; color: #3b82f6; }' +
      '.section { margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px; padding: 10px; }' +
      '.section-title { font-weight: bold; color: #1e293b; border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 6px; font-size: 13px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 5px; }' +
      'th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }' +
      'th { background-color: #f1f5f9; }' +
      '.text-right { text-align: right; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      logoHtml +
      '<div class="header"><div class="title">RECIBO DE VENDA</div><div>OS: ' + os + (details.nfce ? ' | NFC-e: ' + details.nfce : '') + ' | Data: ' + displayDate + '</div></div>' +
      
      '<div class="section"><div class="section-title">DADOS DO CLIENTE</div>' +
      '<table>' +
      '<tr><td class="bold" style="width:25%;">Nome:</td><td>' + (v.cliente_nome || '') + '</td></tr>' +
      '<tr><td class="bold">CPF:</td><td>' + (details.Cliente_CPF || '') + '</td></tr>' +
      '<tr><td class="bold">WhatsApp:</td><td>' + (details.Cliente_WhatsApp || '') + '</td></tr>' +
      '</table></div>' +
      
      '<div class="section"><div class="section-title">DETALHES DA COMPRA</div>' +
      '<table><thead><tr><th>Item / Lente</th><th class="text-right">Valor (R$)</th></tr></thead><tbody>';
      
    var totalItens = 0;
    if (details.Aro1_Lente) {
      var precoLente = Number(details.Aro1_PrecoLente) || 0;
      html += '<tr><td>Lente: ' + details.Aro1_Lente + '</td><td class="text-right">R$ ' + precoLente.toFixed(2) + '</td></tr>';
      totalItens += precoLente;
    }
    if (details.Aro1_Tratamento) {
      var precoTrat = Number(details.Aro1_PrecoTratamento) || 0;
      html += '<tr><td>Tratamento: ' + details.Aro1_Tratamento + '</td><td class="text-right">R$ ' + precoTrat.toFixed(2) + '</td></tr>';
      totalItens += precoTrat;
    }
    if (details.Aro1_Modelo) {
      var precoAro = Number(details.Aro1_PrecoAro) || 0;
      html += '<tr><td>Armação: ' + details.Aro1_Modelo + ' (' + (details.Aro1_Codigo || '') + ')</td><td class="text-right">R$ ' + precoAro.toFixed(2) + '</td></tr>';
      totalItens += precoAro;
    }
    
    if (details.Aro2_Ativo === 'SIM') {
      if (details.Aro2_Lente) {
        var pL2 = Number(details.Aro2_PrecoLente) || 0;
        html += '<tr><td>Lente 2: ' + details.Aro2_Lente + '</td><td class="text-right">R$ ' + pL2.toFixed(2) + '</td></tr>';
        totalItens += pL2;
      }
      if (details.Aro2_Tratamento) {
        var pT2 = Number(details.Aro2_PrecoTratamento) || 0;
        html += '<tr><td>Tratamento 2: ' + details.Aro2_Tratamento + '</td><td class="text-right">R$ ' + pT2.toFixed(2) + '</td></tr>';
        totalItens += pT2;
      }
      if (details.Aro2_Modelo) {
        var pA2 = Number(details.Aro2_PrecoAro) || 0;
        html += '<tr><td>Armação 2: ' + details.Aro2_Modelo + ' (' + (details.Aro2_Codigo || '') + ')</td><td class="text-right">R$ ' + pA2.toFixed(2) + '</td></tr>';
        totalItens += pA2;
      }
    }
    
    html += '<tr class="bold" style="background-color:#f1f5f9;"><td>TOTAL DA VENDA</td><td class="text-right">R$ ' + Number(v.total_venda).toFixed(2) + '</td></tr>';
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">DIOPTRIAS / RECEITA (Aro 1)</div>' +
      '<table>' +
      '<thead><tr><th>Olho</th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>Altura</th><th>DNP</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="bold">OD</td><td>' + (details.Aro1_OD_Esf || '0.00') + '</td><td>' + (details.Aro1_OD_Cil || '0.00') + '</td><td>' + (details.Aro1_OD_Eixo || '0') + '</td><td>' + (details.Aro1_OD_Alt || '') + '</td><td>' + (details.Aro1_OD_DNP || '') + '</td></tr>' +
      '<tr><td class="bold">OE</td><td>' + (details.Aro1_OE_Esf || '0.00') + '</td><td>' + (details.Aro1_OE_Cil || '0.00') + '</td><td>' + (details.Aro1_OE_Eixo || '0') + '</td><td>' + (details.Aro1_OE_Alt || '') + '</td><td>' + (details.Aro1_OE_DNP || '') + '</td></tr>' +
      '</tbody></table>' +
      (details.Aro1_Adicao ? '<div style="margin-top:5px;"><strong>Adição:</strong> ' + details.Aro1_Adicao + '</div>' : '') +
      '</div>';
      
    var fpDisplay = details.Forma_Pagamento_1 || details.Forma_Pagamento || "";
    var parts = [];
    if (Number(details.Valor_Pagamento_1) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_1 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_1 || 1) + 'x, Auto: ' + (details.Auto_1 || '-') + ')';
      }
      parts.push((details.Forma_Pagamento_1 || details.Forma_Pagamento) + ': R$ ' + Number(details.Valor_Pagamento_1).toFixed(2) + cardDetail);
    } else {
      // Fallback for older sales
      parts.push(fpDisplay + ': R$ ' + (Number(details.Valor_Pago) || Number(v.total_venda) || 0).toFixed(2));
    }
    if (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum' && Number(details.Valor_Pagamento_2) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_2 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_2 || 1) + 'x, Auto: ' + (details.Auto_2 || '-') + ')';
      }
      parts.push(details.Forma_Pagamento_2 + ': R$ ' + Number(details.Valor_Pagamento_2).toFixed(2) + cardDetail);
    }
    if (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum' && Number(details.Valor_Pagamento_3) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_3 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_3 || 1) + 'x, Auto: ' + (details.Auto_3 || '-') + ')';
      }
      parts.push(details.Forma_Pagamento_3 + ': R$ ' + Number(details.Valor_Pagamento_3).toFixed(2) + cardDetail);
    }
    var fpText = parts.length > 0 ? parts.join('<br>') : fpDisplay;

    var financeiroHtml = '<div class="section"><div class="section-title">FINANCEIRO</div>' +
      '<table>' +
      '<tr><td class="bold" style="width:25%;">Forma de Pagamento:</td><td>' + fpText + ' (' + (details.Tipo_Pagamento || details.tipoPagamento || 'Integral') + ')</td></tr>' +
      '<tr><td class="bold">Valor Pago (Sinal):</td><td>R$ ' + (Number(details.Valor_Pago) || (Number(details.Valor_Pagamento_1 || 0) + Number(details.Valor_Pagamento_2 || 0) + Number(details.Valor_Pagamento_3 || 0)) || 0).toFixed(2) + '</td></tr>' +
      '<tr><td class="bold">Valor Residual (A Pagar):</td><td>R$ ' + (Number(details.Valor_Residual) || 0).toFixed(2) + '</td></tr>' +
      '</table></div>';

    html += financeiroHtml;
      
      '<div style="text-align:center; font-size:10px; color:#999; margin-top:30px;">Comprovante emitido eletronicamente</div>' +
      '</body></html>';
      
    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    var username = getUserUsername(loggedUser);
    await logAction(username || "admin", "Gerou PDF da OS: " + os);
    
    return { success: true, url: downloadUrl };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

async function addRepresentante(name, loggedUserUsername) {
  return saveRepresentante(name, loggedUserUsername);
}

async function generateTableReportPDF(title, headers, rows, isLandscape, loggedUserUsername) {
  if (loggedUserUsername && !await validateUserSession(loggedUserUsername)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var sizeRule = isLandscape ? "A4 landscape" : "A4 portrait";
    var username = getUserUsername(loggedUserUsername) || loggedUserUsername || 'sistema';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>' +
      '@page { size: ' + sizeRule + '; margin: 8mm; }' +
      'body { font-family: sans-serif; color: #1e293b; font-size: 8px; margin: 0; padding: 0; }' +
      '.header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 12px; }' +
      '.title { font-size: 13px; font-weight: bold; color: #3b82f6; text-transform: uppercase; }' +
      '.meta { font-size: 8px; color: #64748b; margin-top: 2px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8px; table-layout: auto; }' +
      'th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }' +
      'th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; color: #334155; }' +
      'tr:nth-child(even) { background-color: #f8fafc; }' +
      '.text-right { text-align: right; }' +
      '.text-center { text-align: center; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      '<div class="header">' +
        '<div class="title">' + title + '</div>' +
        '<div class="meta">Gerado em: ' + formatDateSP(new Date()) + ' | Solicitado por: ' + username + '</div>' +
      '</div>' +
      '<table><thead><tr>';
      
    for (var i = 0; i < headers.length; i++) {
      html += '<th>' + headers[i] + '</th>';
    }
    
    html += '</tr></thead><tbody>';
    
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var val = row[c] === null || row[c] === undefined ? "" : row[c];
        html += '<td>' + val + '</td>';
      }
      html += '</tr>';
    }
    
    html += '</tbody></table>' +
      '<div style="text-align:center; font-size:7px; color:#94a3b8; margin-top:15px;">Óticas Gestão Integrada - Relatório PDF Automático</div>' +
      '</body></html>';

    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    await logAction(username, "Gerou relatório PDF: " + title);
    
    return { success: true, url: downloadUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function reverseGeocode(lat, lon) {
  try {
    var response = Maps.newGeocoder().reverseGeocode(lat, lon);
    if (response.status === 'OK' && response.results.length > 0) {
      var result = response.results[0];
      var bairro = "";
      var cidade = "";
      for (var i = 0; i < result.address_components.length; i++) {
        var comp = result.address_components[i];
        if (comp.types.indexOf('sublocality_level_1') !== -1 || comp.types.indexOf('neighborhood') !== -1) {
          bairro = comp.long_name;
        }
        if (comp.types.indexOf('locality') !== -1) {
          cidade = comp.long_name;
        }
      }
      return { success: true, bairro: bairro, cidade: cidade };
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  return { success: false, error: "Localização não encontrada" };
}

async function editLoja(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/lojas?nome=eq." + encodeURIComponent(oldName), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: newName })
      }),
      logAction(loggedUserUsername, "Editou loja: " + oldName + " para: " + newName)
    ]);
    invalidateCatalogCache('lojas');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function editLab(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(oldName), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({ nome: newName })
      }),
      logAction(loggedUserUsername, "Editou laboratório: " + oldName + " para: " + newName)
    ]);
    invalidateCatalogCache('laboratorios');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function editProduto(oldNome, record, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/produtos?nome=eq." + encodeURIComponent(oldNome), {
        method: "PATCH",
        headers: { "Prefer": "return=minimal" },
        payload: JSON.stringify({
          nome: record.nome,
          preco: Number(record.preco) || 0,
          laboratorio: record.laboratorio,
          tipo: record.tipo
        })
      }),
      logAction(loggedUserUsername, "Editou produto: " + oldNome + " para: " + record.nome)
    ]);
    invalidateCatalogCache('produtos');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveCampaign(camp, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var dateInicio = camp.data_inicio;
    var dateFim = camp.data_fim;
    if (dateInicio && dateInicio.indexOf('/') !== -1) dateInicio = dmyToYmd(dateInicio);
    if (dateFim && dateFim.indexOf('/') !== -1) dateFim = dmyToYmd(dateFim);

    var payload = {
      nome: camp.nome,
      status: camp.status || 'Ativa',
      data_inicio: dateInicio,
      data_fim: dateFim,
      lojas: camp.loja || camp.lojas || 'Todas',
      aro: camp.aro || '',
      lente: camp.lente || '',
      preco_alvo: camp.preco_alvo ? Number(camp.preco_alvo) : 0
    };

    if (camp.id) {
      await supabaseFetch("/campanhas?id=eq." + camp.id, {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou campanha ID " + camp.id + ": " + camp.nome);
    } else {
      await supabaseFetch("/campanhas", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou nova campanha: " + camp.nome);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteCampaign(campId, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/campanhas?id=eq." + campId, {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu campanha ID: " + campId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveLead(lead, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['leadControle', 'leadKanban'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var diaHorario = lead.dia_horario || (lead.data_visita + 'T' + (lead.hora_visita || '00:00') + ':00');
    var detailsObj = typeof lead.detalhes === 'object' ? lead.detalhes : {};
    if (lead.obs) detailsObj.obs = lead.obs;

    var payload = {
      nome: lead.nome,
      telefone: lead.whatsapp || lead.telefone,
      loja_destino: lead.loja || lead.loja_destino,
      dia_horario: diaHorario,
      campanha_id: lead.campanha_id ? Number(lead.campanha_id) : null,
      status: lead.status || 'entrante',
      vendedor: lead.vendedor || null,
      produtos_vendidos: lead.produtos_vendidos || null,
      valor_vendido: lead.valor_vendido ? Number(lead.valor_vendido) : 0,
      forma_pagamento: lead.forma_pagamento || null,
      motivo_perda: lead.motivo_perda || null,
      venda_os: lead.venda_os || null,
      detalhes: JSON.stringify(detailsObj)
    };

    if (lead.id) {
      await Promise.all([
        supabaseFetch("/leads?id=eq." + lead.id, {
          method: "PATCH",
          payload: JSON.stringify(payload)
        }),
        logAction(loggedUserUsername, "Atualizou lead ID " + lead.id + ": " + lead.nome)
      ]);
    } else {
      await Promise.all([
        supabaseFetch("/leads", {
          method: "POST",
          payload: JSON.stringify(payload)
        }),
        logAction(loggedUserUsername, "Cadastrou novo lead: " + lead.nome)
      ]);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLead(leadId, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await Promise.all([
      supabaseFetch("/leads?id=eq." + leadId, {
        method: "DELETE"
      }),
      logAction(loggedUserUsername, "Excluiu lead ID: " + leadId)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function updateLeadStatus(leadId, status, conversionData, loggedUserUsername) {
  if (!await validateUserAnyPermission(loggedUserUsername, ['leadKanban', 'leadControle', 'venda'])) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var payload = {
      status: status,
      atualizado_em: new Date().toISOString()
    };
    if (conversionData) {
      if (conversionData.vendedor) payload.vendedor = conversionData.vendedor;
      if (conversionData.produtos_vendidos) payload.produtos_vendidos = conversionData.produtos_vendidos;
      if (conversionData.valor_vendido) payload.valor_vendido = Number(conversionData.valor_vendido);
      if (conversionData.forma_pagamento) payload.forma_pagamento = conversionData.forma_pagamento;
      if (conversionData.motivo_perda) payload.motivo_perda = conversionData.motivo_perda;
      if (conversionData.venda_os) payload.venda_os = conversionData.venda_os;
      if (conversionData.detalhes) {
        payload.detalhes = typeof conversionData.detalhes === 'object' ? JSON.stringify(conversionData.detalhes) : conversionData.detalhes;
      }
    }

    await Promise.all([
      supabaseFetch("/leads?id=eq." + leadId, {
        method: "PATCH",
        payload: JSON.stringify(payload)
      }),
      logAction(loggedUserUsername, "Alterou status do lead ID " + leadId + " para: " + status)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveOcorrencia(record, loggedUserUsername) {
  try {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['ocorrencias', 'configuracoes']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    var id = record.id;
    
    var payload = {
      os: record.os || "",
      loja: record.loja || "",
      vendedor: record.vendedor || "",
      cliente_nome: record.clienteNome !== undefined ? record.clienteNome : (record.cliente_nome || ""),
      data: dmyToYmd(record.data),
      motivo: record.motivo || "",
      custo_adicional: Number(record.custoAdicional) || 0.00,
      detalhes: typeof record.detalhes === 'object' ? JSON.stringify(record.detalhes) : (record.detalhes || "{}")
    };
    
    if (id) {
      // Editar ocorrência existente
      await Promise.all([
        supabaseFetch("/ocorrencias?id=eq." + id, {
          method: "PATCH",
          payload: JSON.stringify(payload)
        }),
        logAction(loggedUserUsername, "Atualizou ocorrência ID: " + id + " (OS: " + record.os + ")")
      ]);
    } else {
      // Criar nova ocorrência
      await Promise.all([
        supabaseFetch("/ocorrencias", {
          method: "POST",
          payload: JSON.stringify(payload)
        }),
        logAction(loggedUserUsername, "Cadastrou nova ocorrência OS: " + record.os)
      ]);
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteOcorrencia(id, loggedUserUsername) {
  try {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['ocorrencias', 'configuracoes']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    await Promise.all([
      supabaseFetch("/ocorrencias?id=eq." + id, {
        method: "DELETE"
      }),
      logAction(loggedUserUsername, "Excluiu ocorrência ID: " + id)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteOcorrenciasBulk(ids, loggedUserUsername) {
  try {
    var hasPerm = await validateUserAnyPermission(loggedUserUsername, ['ocorrencias', 'configuracoes']);
    if (!hasPerm) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { success: true };
    }
    
    var idsStr = ids.join(",");
    await Promise.all([
      supabaseFetch("/ocorrencias?id=in.(" + idsStr + ")", {
        method: "DELETE"
      }),
      logAction(loggedUserUsername, "Excluiu ocorrências em lote IDs: " + idsStr)
    ]);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Processa requisições de Webhook originadas pelo TikTok Ads.
 */
async function handleTikTokWebhook(e) {
  try {
    var rawContents = e.postData.contents;
    if (!rawContents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Nenhum conteúdo recebido" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var payload = JSON.parse(rawContents);
    
    // Log do payload bruto na tabela de auditoria para auditoria e mapeamento
    await logAction("webhook_tiktok", "Payload bruto recebido: " + rawContents);
    
    // 1. Resposta de Handshake / Verificação (TikTok Ads exige isso para validar a URL do Webhook)
    if (payload.event === "handshake" || payload.challenge) {
      var challengeVal = payload.challenge || "";
      return ContentService.createTextOutput(JSON.stringify({ challenge: challengeVal }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Extração de informações de Lead (Nome, Telefone, Email)
    var name = "";
    var phone = "";
    var email = "";
    
    // Varre a estrutura 'lead_details' caso enviada no formato padrão array
    if (payload.lead_details && Array.isArray(payload.lead_details)) {
      payload.lead_details.forEach(function(item) {
        var key = (item.field_key || item.field_name || "").toLowerCase().trim();
        var val = (item.field_value || "").toString().trim();
        if (!val) return;
        
        if (key.indexOf("name") !== -1 || key.indexOf("nome") !== -1) {
          name = val;
        } else if (key.indexOf("phone") !== -1 || key.indexOf("tel") !== -1 || key.indexOf("whatsapp") !== -1 || key.indexOf("celular") !== -1) {
          phone = val;
        } else if (key.indexOf("email") !== -1 || key.indexOf("mail") !== -1) {
          email = val;
        }
      });
    }
    
    // Varredura recursiva de fallback caso o payload utilize outra estrutura aninhada
    if (!name || !phone) {
      var traverse = function(obj) {
        for (var k in obj) {
          if (obj.hasOwnProperty(k)) {
            var keyLower = k.toLowerCase();
            var val = obj[k];
            if (typeof val === 'string' || typeof val === 'number') {
              var valStr = val.toString().trim();
              if (!name && (keyLower.indexOf("name") !== -1 || keyLower.indexOf("nome") !== -1)) {
                name = valStr;
              }
              if (!phone && (keyLower.indexOf("phone") !== -1 || keyLower.indexOf("tel") !== -1 || keyLower.indexOf("whatsapp") !== -1 || keyLower.indexOf("celular") !== -1)) {
                phone = valStr;
              }
              if (!email && (keyLower.indexOf("email") !== -1 || keyLower.indexOf("mail") !== -1)) {
                email = valStr;
              }
            } else if (val && typeof val === 'object') {
              traverse(val);
            }
          }
        }
      };
      traverse(payload);
    }
    
    // 3. Cadastra o Lead como "Lead Entrante" no Supabase
    var leadData = {
      nome: name || "Lead TikTok",
      telefone: phone || "",
      loja_destino: "", // Fica vazio para ser atribuído no Kanban/Controle de Leads
      dia_horario: new Date().toISOString(),
      campanha_id: null,
      status: "entrante",
      vendedor: "",
      produtos_vendidos: "",
      valor_vendido: 0,
      forma_pagamento: "",
      motivo_perda: "",
      venda_os: "",
      detalhes: JSON.stringify({
        origem: "TikTok Ads",
        email: email,
        tiktok_campaign_id: payload.campaign_id || payload.campaign_name || "",
        tiktok_ad_id: payload.ad_id || "",
        tiktok_form_id: payload.form_id || "",
        tiktok_lead_id: payload.lead_id || "",
        raw_payload: payload
      })
    };
    
    await supabaseFetch("/leads", {
      method: "POST",
      payload: JSON.stringify(leadData)
    });
    
    await logAction("webhook_tiktok", "Lead TikTok inserido com sucesso: " + (name || "Sem Nome") + " (" + (phone || "Sem Tel") + ")");
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Lead cadastrado com sucesso" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    await logAction("webhook_tiktok_error", "Erro ao processar lead TikTok: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

async function buscarDadosOS(os) {
  if (!os) return { success: false, error: "OS não informada." };
  try {
    var osClean = os.toString().trim();
    
    // Busca em conferências (tentativa exata, depois ilike)
    var confs = await supabaseFetch("/conferencias?os=eq." + encodeURIComponent(osClean));
    if (!confs || confs.length === 0) {
      confs = await supabaseFetch("/conferencias?os=ilike." + encodeURIComponent(osClean));
    }
    if (!confs || confs.length === 0) {
      confs = await supabaseFetch("/conferencias?os=ilike." + encodeURIComponent("%" + osClean + "%"));
    }
    
    // Busca em vendas (tentativa exata, depois ilike)
    var vendas = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(osClean));
    if (!vendas || vendas.length === 0) {
      vendas = await supabaseFetch("/vendas?os_venda=ilike." + encodeURIComponent(osClean));
    }
    if (!vendas || vendas.length === 0) {
      vendas = await supabaseFetch("/vendas?os_venda=ilike." + encodeURIComponent("%" + osClean + "%"));
    }
    
    var conf = (confs && confs.length > 0) ? confs[0] : null;
    var venda = (vendas && vendas.length > 0) ? vendas[0] : null;
    
    if (!conf && !venda) {
      return { success: false, error: "OS não encontrada no histórico do banco de dados." };
    }
    
    var confObj = null;
    if (conf) {
      confObj = conf.detalhes || {};
      var dateStr = ymdToDmy(conf.data);
      confObj.Data = dateStr;
      confObj.data = dateStr;
      confObj.Loja = conf.loja;
      confObj.loja = conf.loja;
      confObj.OSLoja = conf.os;
      confObj.osLoja = conf.os;
      confObj.LabPedido = conf.laboratorio;
      confObj.labPedido = conf.laboratorio;
    }
    
    var vendaObj = null;
    if (venda) {
      vendaObj = venda.detalhes || {};
      vendaObj.osVenda = venda.os_venda;
      vendaObj.data = ymdToDmy(venda.data);
      vendaObj.loja = venda.loja;
      vendaObj.vendedor = venda.vendedor;
      vendaObj.clienteNome = venda.cliente_nome;
      vendaObj.totalVenda = Number(venda.total_venda);
    }
    
    return {
      success: true,
      conf: confObj,
      venda: vendaObj
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ==========================================
// A.T.L.A.S. LENSAUDIT — RECURSOS DE CONFERÊNCIA & AUDITORIA AVANÇADA
// ==========================================

async function authenticateByPin(pin) {
  try {
    if (!pin) {
      return { success: false, error: "PIN não informado." };
    }
    const cleanPin = String(pin).trim();
    if (cleanPin.length !== 4) {
      return { success: false, error: "O PIN deve conter exatamente 4 dígitos numéricos." };
    }

    // 1. Busca mapa customizado de PINs em config_settings
    let userPins = {};
    try {
      const cfg = await supabaseFetch("/config_settings?key=eq.user_pins");
      if (cfg && cfg.length > 0 && cfg[0].value) {
        userPins = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      }
    } catch (e) {
      console.warn("Falha ao ler user_pins de config_settings:", e);
    }

    // PINs de fábrica de alta confiabilidade
    const defaultPins = {
      "1234": "Tati - Lab",     // Conferente Lab Central (Tatiane CasaGrande)
      "5678": "Mario",          // Auditor / Gerente
      "9999": "admin",          // Administrador Master
      "1804": "admin",          // Admin alternativo
      "2026": "Thelma",         // Auditoria Fiscal
      "1111": "MN Barao",       // Loja Barão
      "2222": "CESAR",          // Loja Cesar
      "3333": "Demetrius",
      "4444": "Monica",
      "5555": "Andreza",
      "6666": "Flavia",
      "7777": "Fabiano",
      "8888": "Paloma",
      "1611": "Silvia"
    };

    const targetUsername = userPins[cleanPin] || defaultPins[cleanPin];
    let matchedUser = null;

    if (targetUsername) {
      const users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(targetUsername));
      if (users && users.length > 0) {
        matchedUser = users[0];
      }
    }

    // Fallback: se não estiver no mapa, confere se algum usuário tem a senha igual ao PIN ou iniciando com ele
    if (!matchedUser) {
      const allUsers = await supabaseFetch("/usuarios");
      if (Array.isArray(allUsers)) {
        matchedUser = allUsers.find(u => u.senha === cleanPin || (u.senha && u.senha.substring(0, 4) === cleanPin));
      }
    }

    if (!matchedUser) {
      return { success: false, error: "PIN incorreto ou usuário não cadastrado para este PIN." };
    }

    if (matchedUser.status !== 'ATIVO') {
      return { success: false, error: "Este usuário está inativo no sistema." };
    }

    await logAction(matchedUser.usuario, "Login efetuado via PIN Diamante (A.T.L.A.S. LensAudit)");

    const isFinancialAuditor = (matchedUser.auditoria === 'ATIVO' || matchedUser.configuracoes === 'ATIVO');
    const isConferenteOnly = (matchedUser.conferencia === 'ATIVO' && !isFinancialAuditor);

    const token = generateToken({
      username: matchedUser.usuario,
      nome: matchedUser.nome,
      loja: matchedUser.loja || 'Todos',
      scope: isFinancialAuditor ? 'admin' : (isConferenteOnly ? 'conferente' : 'loja'),
      role: isFinancialAuditor ? 'auditor' : (isConferenteOnly ? 'conferente' : 'loja')
    });

    const extra = parseExtraPermissions(matchedUser.medicos, matchedUser);

    return {
      success: true,
      token: token,
      user: {
        username: matchedUser.usuario,
        nome: matchedUser.nome,
        loja: matchedUser.loja || 'Todos',
        role: isFinancialAuditor ? 'auditor' : (isConferenteOnly ? 'conferente' : 'loja'),
        costBlind: isConferenteOnly,
        permissions: {
          conferencia: matchedUser.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: matchedUser.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: matchedUser.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: matchedUser.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: matchedUser.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: matchedUser.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: matchedUser.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: matchedUser.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: matchedUser.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO'
        }
      }
    };
  } catch (e) {
    console.error("Erro em authenticateByPin:", e);
    return { success: false, error: e.toString() };
  }
}

async function getUserPins(loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    const cfg = await supabaseFetch("/config_settings?key=eq.user_pins");
    let map = {
      "1234": "Tati - Lab",
      "5678": "Mario",
      "9999": "admin",
      "1804": "admin",
      "2026": "Thelma",
      "1111": "MN Barao",
      "2222": "CESAR",
      "3333": "Demetrius",
      "4444": "Monica",
      "5555": "Andreza",
      "6666": "Flavia",
      "7777": "Fabiano",
      "8888": "Paloma",
      "1611": "Silvia"
    };
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const saved = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      map = { ...map, ...saved };
    }
    return { success: true, data: map };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveUserPin(username, pin, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    const cleanPin = String(pin).trim();
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      return { success: false, error: 'O PIN deve conter exatamente 4 dígitos numéricos.' };
    }
    const current = await getUserPins(loggedUser);
    let map = current.success ? current.data : {};
    
    // Remove PIN anterior do mesmo usuário caso existisse
    Object.keys(map).forEach(k => {
      if (map[k] === username) delete map[k];
    });

    map[cleanPin] = username;
    await saveConfigParam('user_pins', map, getUserUsername(loggedUser));
    return { success: true, pin: cleanPin, username: username };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function getFornecedoresDePara(loggedUser) {
  try {
    try {
      const data = await supabaseFetch("/fornecedores_depara?order=laboratorio.asc,loja.asc");
      if (Array.isArray(data) && data.length > 0) return { success: true, data };
    } catch (tblErr) {}
    
    const cfg = await supabaseFetch("/config_settings?key=eq.fornecedores_depara");
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const list = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      return { success: true, data: Array.isArray(list) ? list : [] };
    }
    return { success: true, data: [] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveFornecedorDePara(aliasData, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    let savedInTable = false;
    try {
      if (aliasData.id && typeof aliasData.id === 'number' && aliasData.id < 1000000000) {
        await supabaseFetch(`/fornecedores_depara?id=eq.${aliasData.id}`, { method: 'PATCH', payload: JSON.stringify(aliasData) });
      } else {
        await supabaseFetch('/fornecedores_depara', { method: 'POST', payload: JSON.stringify(aliasData) });
      }
      savedInTable = true;
    } catch (e) {}

    const res = await getFornecedoresDePara(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    if (aliasData.id) {
      list = list.map(item => item.id == aliasData.id ? { ...item, ...aliasData } : item);
    } else {
      aliasData.id = Date.now();
      aliasData.created_at = new Date().toISOString();
      list.push(aliasData);
    }
    await saveConfigParam('fornecedores_depara', list, getUserUsername(loggedUser));
    return { success: true, data: aliasData };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteFornecedorDePara(aliasId, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      await supabaseFetch(`/fornecedores_depara?id=eq.${aliasId}`, { method: 'DELETE' });
    } catch (e) {}
    const res = await getFornecedoresDePara(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    list = list.filter(item => item.id != aliasId);
    await saveConfigParam('fornecedores_depara', list, getUserUsername(loggedUser));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function getAuditoriaFechamentos(loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      const data = await supabaseFetch("/auditoria_fechamentos?order=created_at.desc");
      if (Array.isArray(data) && data.length > 0) return { success: true, data };
    } catch (tblErr) {}
    
    const cfg = await supabaseFetch("/config_settings?key=eq.auditoria_fechamentos");
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const list = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      return { success: true, data: Array.isArray(list) ? list : [] };
    }
    return { success: true, data: [] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveAuditoriaFechamento(fechamentoData, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      await supabaseFetch('/auditoria_fechamentos', { method: 'POST', payload: JSON.stringify(fechamentoData) });
    } catch (e) {}

    const res = await getAuditoriaFechamentos(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    if (!fechamentoData.id) fechamentoData.id = Date.now();
    fechamentoData.created_at = new Date().toISOString();
    fechamentoData.auditor = getUserUsername(loggedUser);
    list.unshift(fechamentoData);
    await saveConfigParam('auditoria_fechamentos', list.slice(0, 100), getUserUsername(loggedUser));
    return { success: true, data: fechamentoData };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function processarReconciliacao3Way(params, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    const { laboratorio, mesReferencia, itensFatura, condicaoPagamento } = params || {};
    if (!Array.isArray(itensFatura) || itensFatura.length === 0) {
      return { success: false, error: 'Nenhum item da fatura enviado para reconciliação.' };
    }

    // Busca todas as conferências recentes e vendas para cruzamento
    const conferencias = await supabaseFetch("/conferencias?order=id.desc&limit=2000");
    const vendas = await supabaseFetch("/vendas?order=id.desc&limit=2000");

    let totalFaturado = 0;
    let totalGlosas = 0;
    let totalAprovado = 0;

    const itensProcessados = itensFatura.map((item, idx) => {
      const valorItem = Number(item.valor) || 0;
      totalFaturado += valorItem;

      const cfop = String(item.cfop || '').trim();
      const os = String(item.os || '').trim().replace(/^0+/, '');

      // 1. Regra de Glosa por CFOP (Bonificações e Trocas/Garantias)
      const cfopsIsentos = ['5910', '6910', '5.910', '6.910', '5949', '6949', '5.949', '6.949'];
      const isentoCfop = cfopsIsentos.includes(cfop);

      // 2. Busca OS na loja (vendas)
      const vendaMatch = Array.isArray(vendas) ? vendas.find(v => {
        const vOs = String(v.os_venda || '').trim().replace(/^0+/, '');
        return vOs && vOs === os;
      }) : null;

      // 3. Busca Conferência física do romaneio
      const confMatch = Array.isArray(conferencias) ? conferencias.find(c => {
        const cOs = String(c.os || '').trim().replace(/^0+/, '');
        return cOs && cOs === os;
      }) : null;

      let status = 'CONCILIADO_OK';
      let motivoGlosa = '';
      let valorGlosa = 0;

      if (isentoCfop) {
        status = 'GLOSA_CFOP';
        motivoGlosa = `CFOP ${cfop} (Bonificação/Garantia isenta de cobrança)`;
        valorGlosa = valorItem;
      } else if (!vendaMatch && !confMatch) {
        status = 'ITEM_FANTASMA';
        motivoGlosa = 'Item faturado sem registro de OS na loja nem romaneio físico conferido no laboratório.';
        valorGlosa = valorItem;
      } else if (!confMatch) {
        status = 'SEM_ROMANEIO';
        motivoGlosa = 'OS consta na loja, mas não foi localizado comprovante fotográfico de conferência de romaneio.';
        valorGlosa = valorItem;
      } else if (item.valorEsperado && Number(item.valorEsperado) < valorItem) {
        status = 'DIVERGENCIA_VALOR';
        valorGlosa = valorItem - Number(item.valorEsperado);
        motivoGlosa = `Valor cobrado (R$ ${valorItem.toFixed(2)}) superior ao acordado (R$ ${Number(item.valorEsperado).toFixed(2)}).`;
      }

      totalGlosas += valorGlosa;
      const valorLiquido = valorItem - valorGlosa;
      totalAprovado += valorLiquido;

      return {
        id: item.id || (idx + 1),
        os: item.os,
        loja: item.loja || (vendaMatch ? vendaMatch.loja : (confMatch ? confMatch.loja : 'Desconhecida')),
        descricao: item.descricao || 'Lente / Tratamento',
        cfop: item.cfop || '-',
        valorCobrado: valorItem,
        valorGlosa: valorGlosa,
        valorAprovado: valorLiquido,
        status: status,
        motivoGlosa: motivoGlosa,
        possuiOSLoja: !!vendaMatch,
        possuiRomaneioFoto: !!confMatch,
        fotoRomaneioUrl: confMatch ? (confMatch.detalhes ? (confMatch.detalhes.fotoUrl || confMatch.detalhes.FotoDriveUrl) : null) : null
      };
    });

    // 4. Rateio de Parcelas / Fluxo de Caixa (Split Cashflow)
    let parcelas = [];
    const dias = condicaoPagamento === '15_30' ? [15, 30] : [30];
    const valorParcela = totalAprovado / dias.length;
    const hoje = new Date();
    dias.forEach((d, i) => {
      const dataVenc = new Date(hoje.getTime() + d * 24 * 60 * 60 * 1000);
      parcelas.push({
        parcela: `${i + 1}/${dias.length}`,
        dias: d,
        vencimento: dataVenc.toLocaleDateString('pt-BR'),
        valor: Number(valorParcela.toFixed(2))
      });
    });

    return {
      success: true,
      resumo: {
        laboratorio: laboratorio || 'Não especificado',
        mesReferencia: mesReferencia || 'Atual',
        totalItens: itensFatura.length,
        totalFaturado: Number(totalFaturado.toFixed(2)),
        totalGlosas: Number(totalGlosas.toFixed(2)),
        totalAprovado: Number(totalAprovado.toFixed(2)),
        itensComGlosa: itensProcessados.filter(i => i.valorGlosa > 0).length,
        itensAprovados: itensProcessados.filter(i => i.status === 'CONCILIADO_OK').length,
        parcelas: parcelas
      },
      itens: itensProcessados
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// VERCEL SERVERLESS FUNCTION HANDLER
// ==========================================

const backendFunctions = {
  getAppData, getHistoricalVisitas, authenticateUser, authenticateByPin, validateUserSession,
  saveVenda, addVenda, deleteVenda, deleteVendas, deleteVendasBulk,
  saveLancamento, addConferencia, deleteLancamento, deleteConferencia, deleteLancamentosBulk, deleteConferenciaGroup,
  addLoja, deleteLoja, renameLoja, editLoja,
  addLab, deleteLab, renameLab, editLab,
  addVendedor, deleteVendedor,
  addRepresentante, saveRepresentante, deleteRepresentante, renameRepresentante,
  saveRepresentanteWithPassword, getRepresentanteAuthInfo,
  addContatoResumo, deleteContatoResumo,
  addProduto, deleteProduto, editProduto,
  addMedico, upsertMedico, deleteMedicoRecord, bulkUpdateMedicosRepresentante,
  addClinica, upsertClinica, deleteClinicaRecord,
  upsertOrcamento, deleteOrcamentoRecord,
  upsertAssistencia, updateAssistenciaStatus, deleteAssistenciaRecord,
  saveUser, deleteUser, getUsersList, changeOwnPassword,
  saveConfigParam, saveSessionTimeoutSetting, saveLogoUrl, deleteLogoUrl,
  generateSalePDF, generateDailySummaryPDF, importBulkCadastros, generateTableReportPDF,
  addConfigRecord, deleteConfigRecord,
  addVisitaMedica, deleteVisitaMedica,
  saveCampaign, deleteCampaign, saveLead, deleteLead, updateLeadStatus,
  saveOcorrencia, deleteOcorrencia, deleteOcorrenciasBulk,
  buscarDadosOS,
  getFornecedoresDePara, saveFornecedorDePara, deleteFornecedorDePara,
  getAuditoriaFechamentos, saveAuditoriaFechamento, processarReconciliacao3Way,
  getUserPins, saveUserPin
};

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // TikTok Webhook Handler
  if (req.query && req.query.source === 'tiktok') {
    try {
      const result = await handleTikTokWebhook({
        postData: { contents: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) }
      });
      res.status(200).json(result || { success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.toString() });
    }
    return;
  }

  // Healthcheck / Diagnostic GET
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'online',
      service: 'controle-lentes-serverless-api',
      timestamp: new Date().toISOString(),
      status_detail: "Operando sob o Protocolo de Segurança A.T.L.A.S."
    });
    return;
  }

  // RPC POST Handler
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        // body could be raw text
      }
    }
    body = body || {};

    const functionName = body.functionName;
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
    if (functionName !== 'authenticateUser' && functionName !== 'authenticateByPin') {
      const reqHeaders = req.headers || {};
      const authHeader = reqHeaders.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.token || null);
      const verified = verifyToken(token);
      
      // Fallback para usuário de sessão já validado nos argumentos (excluindo chaves reservadas)
      const candidateUser = args.slice().reverse().find(a => {
        if (typeof a === 'string' && a.length > 0 && a.length < 50) {
          const reserved = ['visitas', 'medicos', 'clinicas', 'assistencias', 'orcamentos', 'produtos', 'vendas', 'conferencias', 'lojas', 'laboratorios', 'campanhas', 'leads', 'ocorrencias'];
          return !reserved.includes(a.toLowerCase());
        }
        if (typeof a === 'object' && a && a.username) {
          return true;
        }
        return false;
      });
      const usernameToCheck = (typeof candidateUser === 'object' && candidateUser) ? candidateUser.username : candidateUser;
      if (!verified && (!usernameToCheck || !await validateUserSession(usernameToCheck))) {
        res.status(401).json({ success: false, error: "UNAUTHORIZED: Token de segurança ausente ou sessão expirada." });
        return;
      }
    }

    const result = await backendFunctions[functionName].apply(null, args);
    res.status(200).json(result !== undefined ? result : { success: true });
  } catch (err) {
    console.error("Erro na execução da API Serverless:", err);
    res.status(500).json({ success: false, error: err.toString() });
  }
};

// Export individual functions for test suites
module.exports.backendFunctions = backendFunctions;
module.exports.supabaseFetch = supabaseFetch;
module.exports.userSessionCache = userSessionCache;
module.exports.invalidateUserCache = invalidateUserCache;
module.exports.validateUserAnyPermission = validateUserAnyPermission;
module.exports.staticCatalogCache = staticCatalogCache;
module.exports.invalidateCatalogCache = invalidateCatalogCache;
