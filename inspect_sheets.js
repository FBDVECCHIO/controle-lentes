const ExcelJS = require('exceljs');

async function inspectExcel() {
  const workbook = new ExcelJS.Workbook();
  const filePath = 'planilha_controle_lentes_V2.xlsx';
  
  try {
    await workbook.xlsx.readFile(filePath);
    console.log('Worksheets found:', workbook.worksheets.map(w => w.name));
    
    workbook.worksheets.forEach(sheet => {
      console.log(`\nSheet: "${sheet.name}"`);
      console.log(`Number of rows: ${sheet.rowCount}`);
      if (sheet.rowCount > 0) {
        const firstRow = sheet.getRow(1).values;
        console.log('Headers:', firstRow);
      }
    });
  } catch (err) {
    console.error('Error reading excel file:', err);
  }
}

inspectExcel();
