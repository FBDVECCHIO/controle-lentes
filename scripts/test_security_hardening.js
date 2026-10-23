const http = require('http');
const backendHandler = require('../api/backend');

function mockReqRes(method, bodyData, headers = {}) {
  return new Promise((resolve) => {
    const req = {
      method: method,
      headers: headers,
      body: bodyData,
      query: {}
    };

    let responseStatusCode = 200;
    let responseHeaders = {};
    let responseBody = '';

    const res = {
      status(code) {
        responseStatusCode = code;
        return this;
      },
      setHeader(k, v) {
        responseHeaders[k] = v;
      },
      end(data) {
        if (data) responseBody = data;
        resolve({
          status: responseStatusCode,
          headers: responseHeaders,
          body: responseBody
        });
      },
      json(data) {
        responseBody = data;
        resolve({
          status: responseStatusCode,
          headers: responseHeaders,
          body: responseBody
        });
      }
    };

    backendHandler(req, res);
  });
}

async function runTests() {
  console.log("=== PROTOCOLO A.T.L.A.S. - BATERIA DE TESTES DE SEGURANÇA ===");

  // Teste 1: GET Healthcheck não vaza funções
  console.log("\n[Teste 1] GET /api/backend (Ocultação de rotas internas)...");
  const res1 = await mockReqRes('GET', null);
  console.log("Status:", res1.status);
  console.log("AllowedFunctions presente?", res1.body.allowedFunctions !== undefined);
  if (res1.status === 200 && res1.body.allowedFunctions === undefined) {
    console.log("✓ PASS: Rotas internas não são vazadas no healthcheck.");
  } else {
    throw new Error("FAIL: Rotas vazadas no healthcheck.");
  }

  // Teste 2: Chamada não autenticada para getAppData é bloqueada
  console.log("\n[Teste 2] POST /api/backend getAppData sem autenticação...");
  const res2 = await mockReqRes('POST', {
    functionName: 'getAppData',
    arguments: [""]
  });
  console.log("Status:", res2.status, "Body:", res2.body);
  if (res2.status === 401 || (res2.body && res2.body.success === false && res2.body.error.includes("UNAUTHORIZED"))) {
    console.log("✓ PASS: Chamada não autenticada bloqueada com sucesso.");
  } else {
    throw new Error("FAIL: Chamada não autenticada conseguiu acessar dados.");
  }

  // Teste 3: Autenticação legítima gera token JWT
  console.log("\n[Teste 3] POST /api/backend authenticateUser com credenciais corretas...");
  const res3 = await mockReqRes('POST', {
    functionName: 'authenticateUser',
    arguments: ["admin", "180414"]
  });
  console.log("Status:", res3.status, "Success:", res3.body.success, "Token presente:", !!res3.body.token);
  if (res3.body.success && res3.body.token && res3.body.token.split('.').length === 3) {
    console.log("✓ PASS: Token JWT gerado e assinado com sucesso.");
  } else {
    throw new Error("FAIL: Falha ao gerar token de autenticação.");
  }

  const authToken = res3.body.token;

  // Teste 4: getAppData com Token JWT autenticado
  console.log("\n[Teste 4] POST /api/backend getAppData com Token JWT válido...");
  const res4 = await mockReqRes('POST', {
    functionName: 'getAppData',
    arguments: ["admin"],
    token: authToken
  }, {
    'authorization': 'Bearer ' + authToken
  });
  console.log("Status:", res4.status, "Success:", res4.body.success, "Lojas:", res4.body.lojas?.length);
  if (res4.body.success && res4.body.lojas?.length > 0) {
    console.log("✓ PASS: Sessão autenticada carregou dados com sucesso.");
  } else {
    throw new Error("FAIL: Sessão autenticada falhou ao carregar dados.");
  }

  // Teste 5: getUsersList com senhas ofuscadas
  console.log("\n[Teste 5] POST /api/backend getUsersList - Proteção contra vazamento de senhas...");
  const res5 = await mockReqRes('POST', {
    functionName: 'getUsersList',
    arguments: ["admin"],
    token: authToken
  }, {
    'authorization': 'Bearer ' + authToken
  });
  console.log("Status:", res5.status, "Total Usuários:", res5.body.users?.length);
  const sampleUser = res5.body.users ? res5.body.users[0] : null;
  console.log("Exemplo de usuário:", sampleUser?.username, "Senha:", sampleUser?.senha);
  if (sampleUser && sampleUser.senha === '••••••••') {
    console.log("✓ PASS: Senhas de usuários 100% blindadas e ofuscadas.");
  } else {
    throw new Error("FAIL: Senha de usuário em texto puro exposta: " + sampleUser?.senha);
  }

  console.log("\n==============================================================");
  console.log("RESULTADO FINAL: TODOS OS 5 TESTES DE SEGURANÇA APROVADOS (0 FALHAS)!");
  console.log("==============================================================");
}

runTests().catch(err => {
  console.error("ERRO NOS TESTES:", err);
  process.exit(1);
});
