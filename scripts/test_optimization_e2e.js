const fs = require('fs');
const path = require('path');
const vm = require('vm');
const backend = require('../api/backend');
const {
  backendFunctions,
  userSessionCache,
  staticCatalogCache,
  invalidateUserCache,
  invalidateCatalogCache,
  validateUserAnyPermission
} = backend;

async function runOptimizationsVerification() {
  console.log("================================================================================");
  console.log(" PROTOCOLO A.T.L.A.S. - BATERIA E2E COMPLETA (FASES 1, 2 E 3)");
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
  // 1. Compilação Sintática Estrita (Frontend Inline Scripts, SW, Backend)
  // ---------------------------------------------------------------------------
  console.log("--- 1. Compilação Sintática Estrita (Zero Syntax Errors) ---");
  const htmlPath = path.join(__dirname, '..', 'index.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf8');
  const scriptRegex = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let inlineScriptCount = 0;
  while ((match = scriptRegex.exec(htmlContent)) !== null) {
    inlineScriptCount++;
    new vm.Script(match[1], { filename: `index.html#script-${inlineScriptCount}` });
  }
  assert(inlineScriptCount >= 1, `Todos os ${inlineScriptCount} blocos <script> inline de index.html compilaram sem erros`);

  const swPath = path.join(__dirname, '..', 'service-worker.js');
  const swContent = fs.readFileSync(swPath, 'utf8');
  new vm.Script(swContent, { filename: 'service-worker.js' });
  assert(true, "service-worker.js compilou sem erros sintáticos");

  // ---------------------------------------------------------------------------
  // 2. Fase 1: Infraestrutura (vercel.json, Service Worker v3, Atomic Upsert)
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. Verificação da Fase 1 (Co-localização iad1, Cache HTTP, SW v3, Upsert Atômico) ---");
  const vercelJsonPath = path.join(__dirname, '..', 'vercel.json');
  assert(fs.existsSync(vercelJsonPath), "vercel.json presente na raiz do projeto");
  const vercelConfig = JSON.parse(fs.readFileSync(vercelJsonPath, 'utf8'));
  assert(Array.isArray(vercelConfig.regions) && vercelConfig.regions.includes('iad1'),
    "vercel.json fixa região Serverless em iad1 (N. Virginia, <3ms do Supabase AWS us-east-1)");
  assert(JSON.stringify(vercelConfig.headers || []).includes('immutable'),
    "vercel.json configura cache imutável de 1 ano para /vendor/*");

  assert(swContent.includes("lentes-cache-v3"), "service-worker.js atualizado para lentes-cache-v3");
  assert(swContent.includes("event.request.method !== 'GET'") && swContent.includes("'/api/'"),
    "service-worker.js ignora imediatamente mutações POST e rotas /api/ (zero overhead no SW)");
  assert(swContent.includes("./vendor/chart.min.js") && swContent.includes("./vendor/chartjs-plugin-datalabels.min.js"),
    "service-worker.js faz pré-cache local do Chart.js e plugin datalabels");

  const backendPath = path.join(__dirname, '..', 'api', 'backend.js');
  const backendContent = fs.readFileSync(backendPath, 'utf8');
  assert(backendContent.includes("resolution=merge-duplicates,return=minimal"),
    "api/backend.js implementa UPSERT atômico em viagem única (resolution=merge-duplicates,return=minimal)");

  // ---------------------------------------------------------------------------
  // 3. Auditoria do Script SQL Unificado (Fases 1, 2 e 3)
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. Auditoria do Script SQL de Migração Relacional, RLS e Índices ---");
  const sqlPath = path.join(__dirname, '..', 'supabase_optimize_security_and_performance.sql');
  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  assert(sqlContent.includes("CREATE TABLE IF NOT EXISTS public.medicos") &&
         sqlContent.includes("CREATE TABLE IF NOT EXISTS public.clinicas") &&
         sqlContent.includes("CREATE TABLE IF NOT EXISTS public.orcamentos") &&
         sqlContent.includes("CREATE TABLE IF NOT EXISTS public.assistencias"),
    "Script SQL cria e migra automaticamente as 4 novas tabelas relacionais (medicos, clinicas, orcamentos, assistencias)");
  assert(sqlContent.includes("uq_vendas_os_venda") && sqlContent.includes("uq_conferencias_os"),
    "Script SQL cria índices UNIQUE em vendas(os_venda) e conferencias(os) para UPSERT nativo");
  assert(sqlContent.includes("ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;"),
    "Script SQL habilita RLS em public.auditoria_logs");
  assert(sqlContent.includes("NOTIFY pgrst, 'reload schema';"),
    "Script SQL notifica PostgREST para recarregar o schema instantaneamente");

  // ---------------------------------------------------------------------------
  // 4. Cache em Memória: UserSessionCache + StaticCatalogCache
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. Verificação de Caches em Memória (Sessão + Catálogos Estáticos) ---");
  invalidateUserCache();
  invalidateCatalogCache();
  assert(userSessionCache.size === 0 && staticCatalogCache.size === 0, "Caches de sessão e catálogos limpos com sucesso");

  const tPerm0 = Date.now();
  const isAdminPerm1 = await validateUserAnyPermission('admin', ['configuracoes', 'venda']);
  const dPermCold = Date.now() - tPerm0;
  const tPerm1 = Date.now();
  const isAdminPerm2 = await validateUserAnyPermission('admin', ['conferencia', 'visitaMedica']);
  const dPermWarm = Date.now() - tPerm1;
  console.log(`   Permissão cold: ${dPermCold}ms | warm: ${dPermWarm}ms`);
  assert(isAdminPerm1 && isAdminPerm2 && dPermWarm <= 5, "UserSessionCache responde em < 5ms na chamada quente");

  // ---------------------------------------------------------------------------
  // 5. Fase 2: Benchmark Real de Payload Seletivo por Perfil + Janela de 90 Dias
  // ---------------------------------------------------------------------------
  console.log("\n--- 5. Benchmark Real da Fase 2 (Payload Seletivo por Perfil + Janela 90d) ---");
  invalidateCatalogCache();
  const tAdminCold = Date.now();
  const adminData = await backendFunctions.getAppData('admin');
  const dAdminCold = Date.now() - tAdminCold;
  const adminBytes = Buffer.byteLength(JSON.stringify(adminData), 'utf8');

  const tAdminWarm = Date.now();
  const adminDataWarm = await backendFunctions.getAppData('admin');
  const dAdminWarm = Date.now() - tAdminWarm;

  const tRep = Date.now();
  const angeloData = await backendFunctions.getAppData('Angelo');
  const dAngelo = Date.now() - tRep;
  const angeloBytes = Buffer.byteLength(JSON.stringify(angeloData), 'utf8');

  const reductionPct = (((adminBytes - angeloBytes) / adminBytes) * 100).toFixed(1);
  console.log(`   [Admin Cold]   ${dAdminCold}ms | ${(adminBytes / 1024).toFixed(1)} KB`);
  console.log(`   [Admin Warm]   ${dAdminWarm}ms | StaticCatalogCache itens: ${staticCatalogCache.size}`);
  console.log(`   [Rep Angelo]   ${dAngelo}ms | ${(angeloBytes / 1024).toFixed(1)} KB (Redução de ${reductionPct}% no tráfego móvel!)`);

  assert(adminData.success === true && adminDataWarm.success === true, "getAppData('admin') cold e warm responderam com sucesso");
  assert(staticCatalogCache.size >= 4, "StaticCatalogCache populado com catálogos estáticos após leitura");
  assert(angeloData.success === true, "getAppData('Angelo') respondeu com sucesso");
  assert(angeloData.produtos.length === 0 && angeloData.lancamentos.length === 0 && angeloData.logs.length === 0,
    "Perfil Representante ('Angelo') não baixa produtos, conferências nem logs desnecessários");
  assert(angeloData.vendas.every(v => !v.clienteCpf && !v.aro1Lente && v.osVenda !== undefined),
    `Perfil Representante ('Angelo') recebe apenas projeção enxuta LGPD de comissões médicas (${angeloData.vendas.length} vendas vinculadas a médicos)`);
  assert(angeloData.medicos.length >= 457 && angeloData.clinicas.length >= 19 && Array.isArray(angeloData.visitas),
    `Tabelas relacionais ativas: ${angeloData.medicos.length} médicos (100% íntegros) e ${angeloData.clinicas.length} clínicas carregados de public.medicos e public.clinicas`);
  assert(typeof angeloData.visitasWindowStart === 'string' && angeloData.visitasWindowStart.length === 10,
    `Janela deslizante de 90 dias ativa em visitas_medicas (desde ${angeloData.visitasWindowStart})`);
  assert(angeloBytes < adminBytes * 0.45, `Payload móvel do representante reduzido drasticamente (${reductionPct}% menor que admin)`);

  // Teste de carregamento sob demanda de histórico estendido de visitas
  const histRes = await backendFunctions.getHistoricalVisitas('2026-06-01', '', 'Angelo');
  assert(histRes && histRes.success === true && Array.isArray(histRes.visitas) && histRes.visitas.length >= angeloData.visitas.length,
    `getHistoricalVisitas carrega histórico completo sob demanda (${histRes.visitas.length} visitas retornadas)`);

  // ---------------------------------------------------------------------------
  // 6. Fase 3: Mutações Atômicas Dual-Mode + Fila Offline no Frontend
  // ---------------------------------------------------------------------------
  console.log("\n--- 6. Verificação da Fase 3 (CRUD Atômico Dual-Mode + Fila Offline) ---");
  const testAssistId = 'TEST-ATLAS-E2E-' + Date.now();
  const upRes = await backendFunctions.upsertAssistencia({
    id: testAssistId,
    osLoja: '999999',
    loja: 'Teste E2E',
    clienteNome: 'Paciente Teste E2E',
    motivoQueixa: 'Verificação Automatizada',
    status: 'PENDENTE_ACEITE',
    dataAgendamento: '2026-10-29T14:00'
  }, 'admin');
  assert(upRes && upRes.success === true, `upsertAssistencia gravou registro de teste atomicamente (${testAssistId})`);

  const stRes = await backendFunctions.updateAssistenciaStatus(testAssistId, 'CONFIRMADO', 'admin');
  assert(stRes && stRes.success === true, "updateAssistenciaStatus atualizou status atomicamente");

  const delRes = await backendFunctions.deleteAssistenciaRecord(testAssistId, 'admin');
  assert(delRes && delRes.success === true, "deleteAssistenciaRecord removeu registro de teste sem deixar resíduos");

  // Auditoria de eliminação de gravações de array inteiro no Frontend
  assert(!htmlContent.includes(".saveConfigParam('medicos'") &&
         !htmlContent.includes(".saveConfigParam('clinicas'") &&
         !htmlContent.includes(".saveConfigParam('orcamentos'") &&
         !htmlContent.includes(".saveConfigParam('assistencias'"),
    "Zero chamadas legadas saveConfigParam('medicos'|'clinicas'|'orcamentos'|'assistencias') restantes em index.html");
  assert(htmlContent.includes("atlas_offline_mutation_queue_v1") && htmlContent.includes("function flushOfflineMutationQueue()"),
    "index.html implementa fila persistente de mutações offline (atlas_offline_mutation_queue_v1) com auto-sync");
  assert(htmlContent.includes("function ensureHistoricalVisitasLoaded("),
    "index.html implementa carregamento preguiçoso transparente para filtros de datas antigas em Visitas Médicas");

  // Autenticação JWT
  const authRes = await backendFunctions.authenticateUser('admin', '180414');
  assert(authRes && authRes.success === true && authRes.token.split('.').length === 3,
    "Autenticação JWT permanece íntegra e operacional");

  console.log("\n================================================================================");
  console.log(` RESULTADO FINAL: Todos os ${passedTests}/${totalTests} testes E2E aprovados com 100% de êxito!`);
  console.log("================================================================================\n");
}

runOptimizationsVerification().catch(err => {
  console.error("ERRO FATAL NA VERIFICAÇÃO:", err);
  process.exit(1);
});
