const ExcelJS = require('exceljs');
const fs = require('fs');

async function run() {
  const sourcePath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX_Backup.xlsx';
  const targetPath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX.xlsx';
  const backupCleanPath = 'G:\\Meu Drive\\MACPRADO OK\\CLIENTES\\SRL\\MARIO NETO\\2026\\Tabelas e Comparativos\\LENTE PRONTAS ALEX_Original_Clean.xlsx';
  
  // Back up the user's clean version first
  if (!fs.existsSync(backupCleanPath)) {
    fs.copyFileSync(sourcePath, backupCleanPath);
    console.log('Backed up user\'s clean version to:', backupCleanPath);
  }
  
  // Load the workbook from the user's clean version (sourcePath)
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(sourcePath);
  const sheet = workbook.worksheets[0];
  
  console.log('Processing sheet:', sheet.name);
  console.log('Total rows:', sheet.rowCount);
  
  let updatedCount = 0;
  for (let i = 1; i <= sheet.rowCount; i++) {
    const row = sheet.getRow(i);
    
    // Check if the row has any content in columns A to E
    let hasContent = false;
    for (let col = 1; col <= 5; col++) {
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
    
    // Read the values of columns A, B, C, D (which are now LP, Material, Sphere, Cylinder)
    const cellA = row.getCell(1).value;
    const cellB = row.getCell(2).value;
    const cellC = row.getCell(3).value;
    const cellD = row.getCell(4).value;
    const cellE = row.getCell(5).value; // Price
    
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
    
    // Shift cells to the right to insert the concatenated column as the new Column A
    row.getCell(6).value = cellE; // Price goes to F
    row.getCell(5).value = cellD; // Cylinder goes to E
    row.getCell(4).value = cellC; // Sphere goes to D
    row.getCell(3).value = cellB; // Material goes to C
    row.getCell(2).value = cellA; // LP goes to B
    row.getCell(1).value = concatenated; // New Column A gets the concatenated description
    
    updatedCount++;
    console.log(`Row ${i} concatenated: "${concatenated}"`);
  }
  
  // Write the resulting spreadsheet to the main path (targetPath)
  await workbook.xlsx.writeFile(targetPath);
  console.log(`Successfully updated and saved ${updatedCount} rows to:`, targetPath);
}

run().catch(err => console.error(err));
