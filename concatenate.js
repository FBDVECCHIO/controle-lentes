const ExcelJS = require('exceljs');
const fs = require('fs');

async function run() {
  const filePath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX.xlsx';
  const backupPath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX_Backup.xlsx';
  
  // Create backup if it does not exist
  if (!fs.existsSync(backupPath)) {
    fs.copyFileSync(filePath, backupPath);
    console.log('Created backup of the original file at:', backupPath);
  } else {
    console.log('Using existing backup file at:', backupPath);
  }
  
  // Always load from the backup (which contains original un-concatenated data)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(backupPath);
  const sheet = workbook.worksheets[0];
  
  console.log('Processing sheet:', sheet.name);
  console.log('Total rows:', sheet.rowCount);
  
  let updatedCount = 0;
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    
    // Check if the row has any content in columns A to F
    let hasContent = false;
    for (let col = 1; col <= 6; col++) {
      const val = row.getCell(col).value;
      if (val !== null && val !== undefined && val !== '') {
        hasContent = true;
        break;
      }
    }
    
    if (!hasContent) {
      console.log(`Row ${i} is empty, skipping.`);
      continue;
    }
    
    // Read original cells
    const cellA = row.getCell(1).value;
    const cellB = row.getCell(2).value;
    const cellC = row.getCell(3).value;
    const cellD = row.getCell(4).value;
    
    const parts = [];
    [cellA, cellB, cellC, cellD].forEach(val => {
      if (val !== null && val !== undefined) {
        let str = '';
        if (typeof val === 'object' && val.richText) {
          str = val.richText.map(rt => rt.text).join('');
        } else {
          str = String(val);
        }
        str = str.trim();
        if (str.length > 0) {
          parts.push(str);
        }
      }
    });
    
    const concatenated = parts.join(' ');
    row.getCell(1).value = concatenated;
    updatedCount++;
    console.log(`Row ${i}: [A="${cellA}", B="${cellB}", C="${cellC}", D="${cellD}"] -> Concatenated: "${concatenated}"`);
  }
  
  // Save to the original filePath
  await workbook.xlsx.writeFile(filePath);
  console.log(`Successfully updated and saved ${updatedCount} rows to:`, filePath);
}

run().catch(err => console.error(err));
