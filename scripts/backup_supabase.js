/**
 * PROTOCOLO A.T.L.A.S. - Sistema de Backup Automatizado do Supabase
 * Exporta todas as 14 tabelas para arquivos JSON e SQL com integridade referencial.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mngwfearwjkpisararbe.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3dmZWFyd2prcGlzYXJhcmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTc5MzksImV4cCI6MjA5NjE3MzkzOX0.vk9Ol41NU2RI72-ZZKIcm7hzccYBjzPPptb6rZv_mKs";

const TABLES = [
  "usuarios",
  "lojas",
  "laboratorios",
  "vendedores",
  "representantes",
  "contatos_resumo",
  "produtos",
  "auditoria_logs",
  "vendas",
  "conferencias",
  "config_settings",
  "campanhas",
  "leads",
  "ocorrencias"
];

async function fetchTableAll(tableName) {
  let allRows = [];
  let page = 0;
  const pageSize = 1000;
  let hasMore = true;

  while (hasMore) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const url = `${SUPABASE_URL}/rest/v1/${tableName}?select=*`;
    
    const res = await fetch(url, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Range': `${from}-${to}`
      }
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Erro ao baixar tabela ${tableName}: [${res.status}] ${errText}`);
    }

    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      hasMore = false;
    } else {
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) {
        hasMore = false;
      } else {
        page++;
      }
    }
  }

  return allRows;
}

function escapeSqlVal(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return val.toString();
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (typeof val === 'object') {
    return "'" + JSON.stringify(val).replace(/'/g, "''") + "'::jsonb";
  }
  return "'" + val.toString().replace(/'/g, "''") + "'";
}

function generateSqlInserts(tableName, rows) {
  if (!rows || rows.length === 0) return `-- Tabela ${tableName}: 0 registros\n`;
  let sql = `-- Dados da tabela: ${tableName} (${rows.length} registros)\n`;
  const cols = Object.keys(rows[0]);
  const colList = cols.map(c => `"${c}"`).join(', ');

  // Agrupar em batches de 50
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const valueLines = chunk.map(row => {
      const vals = cols.map(c => escapeSqlVal(row[c])).join(', ');
      return `  (${vals})`;
    }).join(',\n');
    sql += `INSERT INTO public."${tableName}" (${colList}) VALUES\n${valueLines}\nON CONFLICT DO NOTHING;\n`;
  }
  return sql + '\n';
}

async function runBackup() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`[A.T.L.A.S.] Iniciando backup completo em: ${now.toLocaleString('pt-BR')}`);
  const backupData = {
    metadata: {
      generatedAt: now.toISOString(),
      supabaseUrl: SUPABASE_URL,
      version: "1.0.0"
    },
    tables: {}
  };

  let sqlDump = `-- BACKUP SUPABASE AUTOMATIZADO (A.T.L.A.S.)\n-- Data: ${now.toISOString()}\n\n`;

  for (const table of TABLES) {
    process.stdout.write(`Exportando ${table}... `);
    try {
      const rows = await fetchTableAll(table);
      backupData.tables[table] = rows;
      sqlDump += generateSqlInserts(table, rows);
      console.log(`✓ ${rows.length} registros`);
    } catch (err) {
      console.log(`✗ ERRO: ${err.message}`);
      backupData.tables[table] = { error: err.message };
    }
  }

  const jsonFile = path.join(backupDir, `backup_${timestamp}.json`);
  const sqlFile = path.join(backupDir, `backup_${timestamp}.sql`);
  const latestJson = path.join(backupDir, `backup_latest.json`);

  fs.writeFileSync(jsonFile, JSON.stringify(backupData, null, 2), 'utf8');
  fs.writeFileSync(latestJson, JSON.stringify(backupData, null, 2), 'utf8');
  fs.writeFileSync(sqlFile, sqlDump, 'utf8');

  console.log(`\n[A.T.L.A.S.] Backup finalizado com sucesso!`);
  console.log(`- Arquivo JSON: ${jsonFile}`);
  console.log(`- Arquivo SQL:  ${sqlFile}`);
}

runBackup().catch(err => {
  console.error("Falha crítica no backup:", err);
  process.exit(1);
});
