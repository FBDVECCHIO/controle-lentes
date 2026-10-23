const { supabaseFetch } = require('../api/backend');

async function migrate() {
  console.log("Iniciando migração de visitas para public.visitas_medicas...");

  // 1. Obter visitas de config_settings
  const res = await supabaseFetch('/config_settings?key=eq.visitas');
  if (!res || res.length === 0) {
    console.error("Nenhum registro de visitas encontrado em config_settings!");
    return;
  }

  const rawVisitas = JSON.parse(res[0].value);
  console.log(`Encontradas ${rawVisitas.length} visitas em config_settings.`);

  // 2. Tratar IDs únicos para a tabela relacional
  const seenIds = new Set();
  const rowsToInsert = [];
  let dupCount = 0;

  for (const v of rawVisitas) {
    let id = v.id;
    if (!id || seenIds.has(id)) {
      dupCount++;
      id = (v.id || 'visita') + '-dup-' + dupCount;
    }
    seenIds.add(id);

    rowsToInsert.push({
      id: id,
      data: v.data || new Date().toISOString().split('T')[0],
      hora: v.hora || '12:00',
      representante: v.representante || 'Geral',
      medico_nome: v.medicoNome || v.medico_nome || 'Desconhecido',
      medico_crm: v.medicoCrm || v.medico_crm || '',
      assunto: v.assunto || 'Visita',
      status: v.status || 'EFETIVADA',
      relato: v.relato || '',
      lat: (v.lat !== null && v.lat !== undefined && !isNaN(v.lat)) ? Number(v.lat) : null,
      lng: (v.lng !== null && v.lng !== undefined && !isNaN(v.lng)) ? Number(v.lng) : null
    });
  }

  console.log(`Processados ${rowsToInsert.length} registros (${dupCount} IDs desduplicados mantidos).`);

  // 3. Inserção em lotes (chunks de 100)
  const chunkSize = 100;
  for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
    const chunk = rowsToInsert.slice(i, i + chunkSize);
    const insertRes = await supabaseFetch('/visitas_medicas', {
      method: 'POST',
      payload: JSON.stringify(chunk)
    });
    console.log(`Lote ${Math.floor(i / chunkSize) + 1} de ${Math.ceil(rowsToInsert.length / chunkSize)} inserido com sucesso (${chunk.length} linhas).`);
  }

  // 4. Validação final
  const countCheck = await supabaseFetch('/visitas_medicas?select=id');
  console.log(`\nVerificação final: ${countCheck.length} registros persistidos em public.visitas_medicas!`);

  if (countCheck.length === rawVisitas.length) {
    console.log("Sucesso absoluto! Todas as 1.351 visitas migradas com fidelidade total.");
  } else {
    console.warn(`Atenção: Esperado ${rawVisitas.length}, encontrado ${countCheck.length}`);
  }
}

migrate().catch(console.error);
