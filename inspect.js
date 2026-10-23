const ExcelJS = require('exceljs');

async function inspect() {
  const filePath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  
  const sheet = workbook.worksheets[0];
  console.log('Row count:', sheet.rowCount);
  
  for (let i = 1; i <= 10; i++) {
    const row = sheet.getRow(i);
    const rowValues = [];
    for (let c = 1; c <= 8; c++) {
      rowValues.push(row.getCell(c).value);
    }
    console.log(`Row ${i}:`, rowValues);
  }
}

inspect().catch(err => console.error(err));
