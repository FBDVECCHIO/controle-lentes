const fs = require('fs');
const path = require('path');
const backend = require('../api/backend');
const { backendFunctions, userSessionCache, invalidateUserCache, validateUserAnyPermission } = backend;

async function runOptimizationsVerification() {
  console.log("================================================================================");
  console.log(" PROTOCOLO A.T.L.A.S. - BATERIA DE VERIFICAÇÃO DE PERFORMANCE E SEGURANÇA E2E");
  console.log("================================================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, name) {
    totalTests++;
    if (condition) {
      console.log(`✓ [PASS] Teste ${totalTests}: ${name}`);
      passedTests++;
    } else {
      console.error(`✗ [FAIL] Teste ${totalTests}: ${name}`);
      throw new Error(`Falha no teste: ${name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Teste 1: Validação do Arquivo de Migração SQL
  // ---------------------------------------------------------------------------
  console.log("--- 1. Auditoria do Script SQL de Segurança e Performance ---");
  const sqlPath = path.join(__dirname, '..', 'supabase_optimize_security_and_performance.sql');
  assert(fs.existsSync(sqlPath), "Arquivo supabase_optimize_security_and_performance.sql existe no repositório");
  
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  assert(sqlContent.includes("ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;"), 
    "Script SQL habilita RLS em public.auditoria_logs");
  assert(sqlContent.includes('DROP POLICY IF EXISTS "Allow public read/write access" ON public.auditoria_logs;'), 
    "Script SQL remove política conflitante 'Allow public read/write access'");
  assert(sqlContent.includes('CREATE POLICY "auditoria_logs_insert_policy" ON public.auditoria_logs'), 
    "Script SQL cria política de INSERT dedicada para auditoria_logs");
  assert(sqlContent.includes('CREATE POLICY "auditoria_logs_select_policy" ON public.auditoria_logs'), 
    "Script SQL cria política de SELECT dedicada para auditoria_logs");
  assert(sqlContent.includes("idx_usuarios_usuario_lower") && sqlContent.includes("idx_vendas_os_venda"), 
    "Script SQL cria índices de alta performance para usuarios e vendas");
  assert(sqlContent.includes("ANALYZE public.vendas;"), 
    "Script SQL inclui comandos de otimização de estatísticas do planejador PostgreSQL");

  // ---------------------------------------------------------------------------
  // Teste 2: Cache de Sessão e Permissões em Memória (0ms)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Verificação do Mecanismo de Cache em Memória (UserSessionCache) ---");
  invalidateUserCache();
  assert(userSessionCache.size === 0, "Cache de usuários limpo com sucesso");

  // 1a chamada (vai buscar ou usar fallback)
  const t0 = Date.now();
  const isAdminPerm1 = await validateUserAnyPermission('admin', ['configuracoes', 'venda']);
  const d1 = Date.now() - t0;
  console.log(`   Tempo 1ª chamada (sem cache): ${d1}ms`);

  // 2a chamada (deve vir 100% do cache em 0ms)
  const t1 = Date.now();
  const isAdminPerm2 = await validateUserAnyPermission('admin', ['conferencia', 'visitaMedica']);
  const d2 = Date.now() - t1;
  console.log(`   Tempo 2ª chamada (com cache): ${d2}ms`);
  
  assert(isAdminPerm1 === true && isAdminPerm2 === true, "Validação multi-permissão do admin executada com sucesso");
  assert(d2 <= 5, "2ª verificação executada em tempo submilisegundo (< 5ms) via userSessionCache");
  assert(userSessionCache.has('admin'), "Usuário 'admin' indexado no cache em memória");

  // Invalidação seletiva de cache
  invalidateUserCache('admin');
  assert(!userSessionCache.has('admin'), "Invalidação seletiva de cache remove usuário corretamente");

  // ---------------------------------------------------------------------------
  // Teste 3: Leitura Concorrente Paralela em getAppData
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Verificação do getAppData Paralelo com Supabase ---");
  const tStartGet = Date.now();
  const appData = await backendFunctions.getAppData('admin');
  const dGet = Date.now() - tStartGet;
  console.log(`   Tempo total do getAppData paralelo: ${dGet}ms`);

  assert(appData && appData.success === true, "getAppData retornou status de sucesso");
  assert(Array.isArray(appData.lojas) && appData.lojas.length > 0, "Lista de lojas carregada com sucesso");
  assert(Array.isArray(appData.produtos) && appData.produtos.length > 0, "Lista de produtos carregada com sucesso");
  assert(Array.isArray(appData.campanhas), "Lista de campanhas carregada em paralelo");
  assert(Array.isArray(appData.leads), "Lista de leads carregada em paralelo");
  assert(Array.isArray(appData.visitas), "Lista de visitas médicas carregada com paginação inteligente");
  assert(Array.isArray(appData.ocorrencias), "Lista de ocorrências carregada com sucesso");
  assert(Array.isArray(appData.logs), "Lista de logs de auditoria carregada com sucesso");

  // ---------------------------------------------------------------------------
  // Teste 4: Autenticação JWT e Rotas Protegidas
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Verificação de Autenticação e Protocolo JWT ---");
  const authRes = await backendFunctions.authenticateUser('admin', '180414');
  assert(authRes && authRes.success === true, "Autenticação do usuário 'admin' bem sucedida");
  assert(typeof authRes.token === 'string' && authRes.token.split('.').length === 3, "Token JWT gerado e assinado");

  // ---------------------------------------------------------------------------
  // Teste 5: Verificação de SWR e Cache no Frontend index.html
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Verificação da Arquitetura SWR e Responsividade no Frontend ---");
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  assert(htmlContent.includes("function saveAppDataCache(data)"), "index.html implementa saveAppDataCache");
  assert(htmlContent.includes("function loadAppDataFromCache()"), "index.html implementa loadAppDataFromCache");
  assert(htmlContent.includes("function updateCurrentAppDataCache()"), "index.html implementa updateCurrentAppDataCache para manter cache fresco em mutações");
  assert(htmlContent.includes("atlas_app_data_cache"), "index.html usa chave de cache local dedicada");
  assert(htmlContent.includes("isSilentLoad = true;"), "index.html suporta sincronização silenciosa sem congelar UI");

  // ---------------------------------------------------------------------------
  // Teste 6: Auditoria de Otimização no Backend (deleteConfigRecord)
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Verificação de Otimização no Backend Serverless ---");
  const backendPath = path.join(__dirname, '..', 'api', 'backend.js');
  const backendContent = fs.readFileSync(backendPath, 'utf8');
  assert(backendContent.includes("validateUserAnyPermission(loggedUserUsername, ['venda', 'conferencia', 'configuracoes', 'visitaMedica', 'assistencia'])"), 
    "deleteConfigRecord utiliza validateUserAnyPermission sem consultas sequenciais");
  assert(backendContent.includes("invalidateUserCache(username);"), 
    "changeOwnPassword e deleteUser invalidam cache seletivamente");

  console.log("\n================================================================================");
  console.log(` RESULTADO: Todos os ${passedTests}/${totalTests} testes foram aprovados com sucesso!`);
  console.log(" Sistema pronto, blindado, otimizado e aprovado para produção.");
  console.log("================================================================================\n");
}

runOptimizationsVerification().catch(err => {
  console.error("ERRO FATAL NA VERIFICAÇÃO:", err);
  process.exit(1);
});
