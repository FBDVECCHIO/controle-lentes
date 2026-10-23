/**
 * PROTOCOLO A.T.L.A.S. - Script de Restauração Supabase
 * Restaura dados a partir de um arquivo de backup JSON gerado pelo backup_supabase.js.
 * Uso: node scripts/restore_supabase.js [caminho_do_arquivo.json]
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mngwfearwjkpisararbe.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3dmZWFyd2prcGlzYXJhcmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTc5MzksImV4cCI6MjA5NjE3MzkzOX0.vk9Ol41NU2RI72-ZZKIcm7hzccYBjzPPptb6rZv_mKs";

async function restoreTable(tableName, rows) {
  if (!rows || rows.length === 0) return;
  console.log(`Restaurando ${tableName} (${rows.length} registros)...`);

  const batchSize = 100;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${tableName}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(chunk)
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  Aviso ao inserir lote em ${tableName}: [${res.status}] ${errText}`);
    }
  }
}

async function runRestore() {
  const backupDir = path.join(__dirname, '..', 'backups');
  let targetFile = process.argv[2];

  if (!targetFile) {
    targetFile = path.join(backupDir, 'backup_latest.json');
  }

  if (!fs.existsSync(targetFile)) {
    throw new Error(`Arquivo de backup não encontrado: ${targetFile}`);
  }

  console.log(`[A.T.L.A.S.] Iniciando restauração do arquivo: ${targetFile}`);
  const rawData = fs.readFileSync(targetFile, 'utf8');
  const backupData = JSON.parse(rawData);

  if (!backupData.tables) {
    throw new Error("Formato de backup inválido: chave 'tables' ausente.");
  }

  const tablesOrder = [
    "lojas", "laboratorios", "vendedores", "representantes", "contatos_resumo",
    "produtos", "usuarios", "config_settings", "campanhas", "leads",
    "ocorrencias", "vendas", "conferencias", "auditoria_logs"
  ];

  for (const table of tablesOrder) {
    if (backupData.tables[table] && Array.isArray(backupData.tables[table])) {
      await restoreTable(table, backupData.tables[table]);
    }
  }

  console.log(`[A.T.L.A.S.] Restauração concluída com sucesso!`);
}

runRestore().catch(err => {
  console.error("Erro na restauração:", err);
  process.exit(1);
});
