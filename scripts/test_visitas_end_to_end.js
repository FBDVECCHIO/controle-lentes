const { backendFunctions } = require('../api/backend');

async function testEndToEnd() {
  console.log("=== INICIANDO BATERIA DE TESTES DE FIDELIDADE DE VISITAS MÉDICAS ===");

  // 1. Validar getAppData
  console.log("\n1. Testando leitura de getAppData...");
  const appData = await backendFunctions.getAppData('admin');
  if (!appData.success) {
    throw new Error("Falha ao obter getAppData: " + appData.error);
  }
  console.log(`✓ getAppData executado com sucesso. Total de visitas: ${appData.visitas.length}`);
  if (appData.visitas.length < 1351) {
    throw new Error(`Inconsistência de registros! Esperado pelo menos 1351, obtido: ${appData.visitas.length}`);
  }

  // 2. Testar lançamento por Silvia
  console.log("\n2. Testando lançamento atômico por Silvia...");
  const vSilvia = {
    id: 'e2e-silvia-' + Date.now(),
    data: '2026-10-21',
    hora: '17:30',
    representante: 'Silvia',
    medicoNome: 'Dr. Teste Silvia E2E',
    medicoCrm: '111222',
    assunto: 'Relacionamento',
    status: 'EFETIVADA',
    relato: 'Teste automatizado de alta fidelidade - Silvia'
  };
  const resSilvia = await backendFunctions.addVisitaMedica(vSilvia, 'silvia');
  if (!resSilvia.success) {
    throw new Error("Erro ao lançar visita da Silvia: " + resSilvia.error);
  }
  console.log("✓ Visita da Silvia gravada com sucesso:", resSilvia.record.id);

  // 3. Testar lançamento por Angelo via addConfigRecord (retrocompatibilidade)
  console.log("\n3. Testando lançamento por Angelo via addConfigRecord...");
  const vAngelo = {
    id: 'e2e-angelo-' + Date.now(),
    data: '2026-10-21',
    hora: '17:31',
    representante: 'Angelo',
    medicoNome: 'Dr. Teste Angelo E2E',
    medicoCrm: '333444',
    assunto: 'Apresentação de Linha',
    status: 'EFETIVADA',
    relato: 'Teste automatizado via addConfigRecord - Angelo'
  };
  const resAngelo = await backendFunctions.addConfigRecord('visitas', vAngelo, 'angelo');
  if (!resAngelo.success) {
    throw new Error("Erro ao lançar visita do Angelo: " + resAngelo.error);
  }
  console.log("✓ Visita do Angelo gravada via compatibilidade:", resAngelo.record.id);

  // 4. Testar concorrência extrema: 5 lançamentos simultâneos alternados
  console.log("\n4. Testando rajada concorrente de 5 visitas simultâneas...");
  const concurrentVisits = [1, 2, 3, 4, 5].map(i => ({
    id: `e2e-burst-${i}-${Date.now()}`,
    data: '2026-10-21',
    hora: `17:4${i}`,
    representante: i % 2 === 0 ? 'Silvia' : 'Angelo',
    medicoNome: `Médico Concorrente ${i}`,
    medicoCrm: `90000${i}`,
    assunto: 'Visita Concorrente',
    status: 'EFETIVADA',
    relato: `Rajada concorrente teste ${i}`
  }));

  const burstResults = await Promise.all(
    concurrentVisits.map((v, idx) => 
      backendFunctions.addVisitaMedica(v, idx % 2 === 0 ? 'silvia' : 'angelo')
    )
  );

  const burstSuccess = burstResults.every(r => r.success);
  if (!burstSuccess) {
    throw new Error("Falha na gravação concorrente: " + JSON.stringify(burstResults));
  }
  console.log("✓ Todas as 5 visitas simultâneas gravadas sem nenhuma colisão!");

  // 5. Verificar se todas as 7 visitas de teste estão no getAppData
  console.log("\n5. Verificando presença de todas as visitas recém-gravadas no banco...");
  const checkData = await backendFunctions.getAppData('admin');
  const allIds = [vSilvia.id, vAngelo.id, ...concurrentVisits.map(v => v.id)];
  for (const id of allIds) {
    const found = checkData.visitas.some(v => v.id === id);
    if (!found) {
      throw new Error(`ERRO CRÍTICO: Visita ${id} desapareceu do banco de dados!`);
    }
  }
  console.log(`✓ Confirmação 100%: Todas as 7 visitas persistiram com fidelidade absoluta!`);

  // 6. Limpeza dos registros de teste
  console.log("\n6. Realizando limpeza controlada dos registros de teste...");
  for (const id of allIds) {
    const delRes = await backendFunctions.deleteVisitaMedica(id, 'admin');
    if (!delRes.success) {
      console.warn("Aviso na limpeza do ID " + id + ": " + delRes.error);
    }
  }
  console.log("✓ Limpeza de testes concluída.");

  console.log("\n=======================================================");
  console.log("TODOS OS TESTES DE FIDELIDADE E CONCORRÊNCIA FORAM APROVADOS!");
  console.log("=======================================================");
}

testEndToEnd().catch(err => {
  console.error("\n❌ FALHA NO TESTE:", err);
  process.exit(1);
});
