const ExcelJS = require('exceljs');
const path = require('path');

async function createSpreadsheet() {
  const workbook = new ExcelJS.Workbook();

  // Estilos comuns para cabeçalhos
  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' } // Slate Escuro
  };
  const headerFont = {
    name: 'Segoe UI',
    color: { argb: 'FFFFFFFF' },
    bold: true,
    size: 11
  };
  const centerAlignment = { vertical: 'middle', horizontal: 'center' };
  const leftAlignment = { vertical: 'middle', horizontal: 'left' };
  const rightAlignment = { vertical: 'middle', horizontal: 'right' };
  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };
  const currencyFormat = '"R$ " #,##0.00;("R$ " #,##0.00);"-"';

  // -------------------------------------------------------------
  // ABA 1: Lancamentos
  // -------------------------------------------------------------
  const sheetLancamentos = workbook.addWorksheet('Lancamentos', { views: [{ showGridLines: true }] });
  sheetLancamentos.columns = [
    { header: 'Data', key: 'data', width: 15 },
    { header: 'Loja', key: 'loja', width: 25 },
    { header: 'OSLoja', key: 'osLoja', width: 12 },
    { header: 'IDLab', key: 'idLab', width: 15 },
    { header: 'LabPedido', key: 'labPedido', width: 20 },
    { header: 'Lente', key: 'lente', width: 30 },
    { header: 'R$ Lente', key: 'precoLente', width: 18 },
    { header: 'Tratamento', key: 'tratamento', width: 32 },
    { header: 'R$ Tratamento', key: 'precoTratamento', width: 18 },
    { header: 'LenteEfetiva', key: 'lenteEfetiva', width: 30 },
    { header: 'R$ LenteEfetiva', key: 'precoLenteEfetiva', width: 18 },
    { header: 'Trat.Efetivo', key: 'tratEfetivo', width: 32 },
    { header: 'R$ Trat.Efetivo', key: 'precoTratEfetivo', width: 18 }
  ];

  sheetLancamentos.getRow(1).height = 28;
  sheetLancamentos.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = centerAlignment;
  });

  const dataLancamentos = [
    [new Date(2026, 5, 1), 'MN Nova Campinas', '1010', 'L-9988', 'Hoya', 'Hoya MiYOSMART BlueControl', 1250, 'Antirreflexo Hoya BlueControl', 220, 'Hoya MiYOSMART BlueControl', 1250, 'Antirreflexo Hoya BlueControl', 220],
    [new Date(2026, 5, 2), 'MN DPedro', '1015', 'L-4455', 'Essilor', 'Essilor Eyezen Crizal Sapphire', 450, 'Antirreflexo Crizal Sapphire', 180, 'Essilor Eyezen Crizal Sapphire', 450, 'Antirreflexo Crizal Easy', 120],
    [new Date(2026, 5, 2), 'Di Capri', '2045', 'L-1122', 'Zeiss', 'Zeiss SmartLife Superb', 1450, 'Antirreflexo Zeiss DuraVision Platinum', 250, 'Zeiss Single Vision Duravision', 580, 'Antirreflexo Zeiss DuraVision Platinum', 250]
  ];

  dataLancamentos.forEach((rowVal, idx) => {
    const row = sheetLancamentos.addRow(rowVal);
    row.height = 20;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10 };
      
      if ([1, 3, 4].includes(colNumber)) {
        cell.alignment = centerAlignment;
      } else if ([7, 9, 11, 13].includes(colNumber)) {
        cell.alignment = rightAlignment;
        cell.numFmt = currencyFormat;
      } else {
        cell.alignment = leftAlignment;
      }

      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // -------------------------------------------------------------
  // ABA 2: Cadastros_Lojas
  // -------------------------------------------------------------
  const sheetLojas = workbook.addWorksheet('Cadastros_Lojas', { views: [{ showGridLines: true }] });
  sheetLojas.columns = [{ header: 'Loja', key: 'loja', width: 30 }];
  sheetLojas.getRow(1).height = 24;
  sheetLojas.getRow(1).getCell(1).fill = headerFill;
  sheetLojas.getRow(1).getCell(1).font = headerFont;
  sheetLojas.getRow(1).getCell(1).alignment = centerAlignment;

  const lojasList = [
    'MN Nova Campinas',
    'MN DPedro',
    'Qualy Vsion (Conceição)',
    'Di Capri',
    'Conceição (Matriz)',
    'MN (Barão)',
    'MN Satoráto',
    'MN S.Park'
  ];
  lojasList.forEach(loja => {
    const row = sheetLojas.addRow([loja]);
    row.getCell(1).border = thinBorder;
    row.getCell(1).font = { name: 'Segoe UI', size: 10 };
  });

  // -------------------------------------------------------------
  // ABA 3: Cadastros_Labs
  // -------------------------------------------------------------
  const sheetLabs = workbook.addWorksheet('Cadastros_Labs', { views: [{ showGridLines: true }] });
  sheetLabs.columns = [{ header: 'Laboratorio', key: 'laboratorio', width: 25 }];
  sheetLabs.getRow(1).height = 24;
  sheetLabs.getRow(1).getCell(1).fill = headerFill;
  sheetLabs.getRow(1).getCell(1).font = headerFont;
  sheetLabs.getRow(1).getCell(1).alignment = centerAlignment;

  const labsList = ['Essilor', 'Hoya', 'Zeiss', 'Rodestock'];
  labsList.forEach(lab => {
    const row = sheetLabs.addRow([lab]);
    row.getCell(1).border = thinBorder;
    row.getCell(1).font = { name: 'Segoe UI', size: 10 };
  });

  // -------------------------------------------------------------
  // ABA 4: Cadastros_Produtos
  // -------------------------------------------------------------
  const sheetProdutos = workbook.addWorksheet('Cadastros_Produtos', { views: [{ showGridLines: true }] });
  sheetProdutos.columns = [
    { header: 'Nome', key: 'nome', width: 35 },
    { header: 'Preco', key: 'preco', width: 15 },
    { header: 'Laboratorio', key: 'laboratorio', width: 18 },
    { header: 'Tipo', key: 'tipo', width: 15 }
  ];

  sheetProdutos.getRow(1).height = 24;
  sheetProdutos.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = centerAlignment;
  });

  const produtosCatalogo = [
    { nome: 'Essilor Eyezen Crizal Sapphire', preco: 450, lab: 'Essilor', tipo: 'Lente' },
    { nome: 'Varilux Comfort Max Crizal Easy', preco: 1100, lab: 'Essilor', tipo: 'Lente' },
    { nome: 'Antirreflexo Crizal Sapphire', preco: 180, lab: 'Essilor', tipo: 'Tratamento' },
    { nome: 'Antirreflexo Crizal Easy', preco: 120, lab: 'Essilor', tipo: 'Tratamento' },
    { nome: 'Hoya MiYOSMART BlueControl', preco: 1250, lab: 'Hoya', tipo: 'Lente' },
    { nome: 'Hoya Nulux Active BlueControl', preco: 520, lab: 'Hoya', tipo: 'Lente' },
    { nome: 'Antirreflexo Hoya BlueControl', preco: 220, lab: 'Hoya', tipo: 'Tratamento' },
    { nome: 'Antirreflexo Hoya CleanExtra', preco: 140, lab: 'Hoya', tipo: 'Tratamento' },
    { nome: 'Zeiss Single Vision Duravision', preco: 580, lab: 'Zeiss', tipo: 'Lente' },
    { nome: 'Zeiss SmartLife Superb', preco: 1450, lab: 'Zeiss', tipo: 'Lente' },
    { nome: 'Antirreflexo Zeiss DuraVision Platinum', preco: 250, lab: 'Zeiss', tipo: 'Tratamento' },
    { nome: 'Antirreflexo Zeiss LotuTec', preco: 150, lab: 'Zeiss', tipo: 'Tratamento' },
    { nome: 'Rodestock Cosmolit Solitaire', preco: 480, lab: 'Rodestock', tipo: 'Lente' },
    { nome: 'Antirreflexo Rodestock Solitaire 2', preco: 190, lab: 'Rodestock', tipo: 'Tratamento' },
    { nome: 'Coloração Cinza 75%', preco: 70, lab: 'Todos', tipo: 'Tratamento' },
    { nome: 'Coloração G-15 (Verde)', preco: 70, lab: 'Todos', tipo: 'Tratamento' },
    { nome: 'Tratamento Transitions', preco: 420, lab: 'Todos', tipo: 'Tratamento' },
    { nome: 'Sem Tratamento / Incolor', preco: 0, lab: 'Todos', tipo: 'Tratamento' }
  ];

  produtosCatalogo.forEach((prod, idx) => {
    const row = sheetProdutos.addRow([prod.nome, prod.preco, prod.lab, prod.tipo]);
    row.height = 18;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10 };
      if (colNumber === 2) {
        cell.alignment = rightAlignment;
        cell.numFmt = currencyFormat;
      } else {
        cell.alignment = leftAlignment;
      }
      if (idx % 2 === 1) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
    });
  });

  // -------------------------------------------------------------
  // ABA 5: Cadastros_Usuarios (NOVA)
  // -------------------------------------------------------------
  const sheetUsuarios = workbook.addWorksheet('Cadastros_Usuarios', { views: [{ showGridLines: true }] });
  sheetUsuarios.columns = [
    { header: 'Usuario', key: 'usuario', width: 20 },
    { header: 'Senha', key: 'senha', width: 20 },
    { header: 'Nome', key: 'nome', width: 25 },
    { header: 'Status', key: 'status', width: 15 },
    { header: 'Conferencia', key: 'conferencia', width: 15 },
    { header: 'Registros', key: 'registros', width: 15 },
    { header: 'Dashboard', key: 'dashboard', width: 15 },
    { header: 'Auditoria', key: 'auditoria', width: 15 },
    { header: 'Configuracoes', key: 'configuracoes', width: 15 },
    { header: 'Logs', key: 'logs', width: 15 },
    { header: 'Venda', key: 'venda', width: 15 },
    { header: 'LogVendas', key: 'logVendas', width: 15 },
    { header: 'ResumoVendas', key: 'resumoVendas', width: 15 }
  ];
  sheetUsuarios.getRow(1).height = 24;
  sheetUsuarios.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = centerAlignment;
  });
  
  // Cadastro inicial admin / admin123 com permissões completas
  const rowUser = sheetUsuarios.addRow(['admin', 'admin123', 'Administrador', 'Ativo', 'SIM', 'SIM', 'SIM', 'SIM', 'SIM', 'SIM', 'SIM', 'SIM', 'SIM']);
  rowUser.height = 18;
  rowUser.eachCell(cell => {
    cell.border = thinBorder;
    cell.font = { name: 'Segoe UI', size: 10 };
  });

  // -------------------------------------------------------------
  // ABA 6: Registro_Logs (NOVA)
  // -------------------------------------------------------------
  const sheetLogs = workbook.addWorksheet('Registro_Logs', { views: [{ showGridLines: true }] });
  sheetLogs.columns = [
    { header: 'Data_Hora', key: 'dataHora', width: 22 },
    { header: 'Usuario', key: 'usuario', width: 18 },
    { header: 'Acao', key: 'acao', width: 60 }
  ];
  sheetLogs.getRow(1).height = 24;
  sheetLogs.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = centerAlignment;
  });

  const rowLog = sheetLogs.addRow([new Date(), 'sistema', 'Inicialização do banco de dados e cadastros padrão']);
  rowLog.height = 18;
  rowLog.eachCell((cell, colNum) => {
    cell.border = thinBorder;
    cell.font = { name: 'Segoe UI', size: 10 };
    if (colNum === 1) {
      cell.alignment = centerAlignment;
    } else {
      cell.alignment = leftAlignment;
    }
  });

  // -------------------------------------------------------------
  // ABA 7: Cadastros_Vendedores (NOVA)
  // -------------------------------------------------------------
  const sheetVendedores = workbook.addWorksheet('Cadastros_Vendedores', { views: [{ showGridLines: true }] });
  sheetVendedores.columns = [{ header: 'Vendedor', key: 'vendedor', width: 25 }];
  sheetVendedores.getRow(1).height = 24;
  sheetVendedores.getRow(1).getCell(1).fill = headerFill;
  sheetVendedores.getRow(1).getCell(1).font = headerFont;
  sheetVendedores.getRow(1).getCell(1).alignment = centerAlignment;

  const vendedoresList = ['Ana Silva', 'Bruno Costa', 'Carlos Souza'];
  vendedoresList.forEach(v => {
    const row = sheetVendedores.addRow([v]);
    row.getCell(1).border = thinBorder;
    row.getCell(1).font = { name: 'Segoe UI', size: 10 };
  });

  // -------------------------------------------------------------
  // ABA 8: Vendas (NOVA)
  // -------------------------------------------------------------
  const sheetVendas = workbook.addWorksheet('Vendas', { views: [{ showGridLines: true }] });
  sheetVendas.columns = [
    { header: 'OS_Venda', key: 'osVenda', width: 15 },
    { header: 'Data', key: 'data', width: 15 },
    { header: 'Loja', key: 'loja', width: 20 },
    { header: 'Vendedor', key: 'vendedor', width: 20 },
    { header: 'Cliente_ID', key: 'clienteId', width: 15 },
    { header: 'Cliente_Nome', key: 'clienteNome', width: 25 },
    { header: 'Cliente_DataNasc', key: 'clienteDataNasc', width: 15 },
    { header: 'Cliente_CPF', key: 'clienteCpf', width: 15 },
    { header: 'Cliente_WhatsApp', key: 'clienteWhatsApp', width: 18 },
    { header: 'Cliente_Telefone', key: 'clienteTelefone', width: 18 },
    { header: 'Cliente_Email', key: 'clienteEmail', width: 25 },
    { header: 'Cliente_CEP', key: 'clienteCep', width: 12 },
    { header: 'Cliente_Rua', key: 'clienteRua', width: 25 },
    { header: 'Cliente_Numero', key: 'clienteNumero', width: 10 },
    { header: 'Cliente_Complemento', key: 'clienteComplemento', width: 20 },
    { header: 'Cliente_Bairro', key: 'clienteBairro', width: 20 },
    { header: 'Cliente_Cidade', key: 'clienteCidade', width: 20 },
    { header: 'Cliente_UF', key: 'clienteUf', width: 8 },
    { header: 'Aro1_Codigo', key: 'aro1Codigo', width: 15 },
    { header: 'Aro1_Modelo', key: 'aro1Modelo', width: 20 },
    { header: 'Aro1_Lente', key: 'aro1Lente', width: 25 },
    { header: 'Aro1_PrecoLente', key: 'aro1PrecoLente', width: 15 },
    { header: 'Aro1_Tratamento', key: 'aro1Tratamento', width: 25 },
    { header: 'Aro1_PrecoTratamento', key: 'aro1PrecoTratamento', width: 15 },
    { header: 'Aro1_PrecoAro', key: 'aro1PrecoAro', width: 15 },
    { header: 'Aro1_OD_Esf', key: 'aro1OdEsf', width: 10 },
    { header: 'Aro1_OD_Cil', key: 'aro1OdCil', width: 10 },
    { header: 'Aro1_OD_Eixo', key: 'aro1OdEixo', width: 10 },
    { header: 'Aro1_OD_Alt', key: 'aro1OdAlt', width: 10 },
    { header: 'Aro1_OD_DNP', key: 'aro1OdDnp', width: 10 },
    { header: 'Aro1_OE_Esf', key: 'aro1OeEsf', width: 10 },
    { header: 'Aro1_OE_Cil', key: 'aro1OeCil', width: 10 },
    { header: 'Aro1_OE_Eixo', key: 'aro1OeEixo', width: 10 },
    { header: 'Aro1_OE_Alt', key: 'aro1OeAlt', width: 10 },
    { header: 'Aro1_OE_DNP', key: 'aro1OeDnp', width: 10 },
    { header: 'Aro1_Adicao', key: 'aro1Adicao', width: 10 },
    { header: 'Aro2_Ativo', key: 'aro2Ativo', width: 12 },
    { header: 'Aro2_Codigo', key: 'aro2Codigo', width: 15 },
    { header: 'Aro2_Modelo', key: 'aro2Modelo', width: 20 },
    { header: 'Aro2_Lente', key: 'aro2Lente', width: 25 },
    { header: 'Aro2_PrecoLente', key: 'aro2PrecoLente', width: 15 },
    { header: 'Aro2_Tratamento', key: 'aro2Tratamento', width: 25 },
    { header: 'Aro2_PrecoTratamento', key: 'aro2PrecoTratamento', width: 15 },
    { header: 'Aro2_PrecoAro', key: 'aro2PrecoAro', width: 15 },
    { header: 'Aro2_OD_Esf', key: 'aro2OdEsf', width: 10 },
    { header: 'Aro2_OD_Cil', key: 'aro2OdCil', width: 10 },
    { header: 'Aro2_OD_Eixo', key: 'aro2OdEixo', width: 10 },
    { header: 'Aro2_OD_Alt', key: 'aro2OdAlt', width: 10 },
    { header: 'Aro2_OD_DNP', key: 'aro2OdDnp', width: 10 },
    { header: 'Aro2_OE_Esf', key: 'aro2OeEsf', width: 10 },
    { header: 'Aro2_OE_Cil', key: 'aro2OeCil', width: 10 },
    { header: 'Aro2_OE_Eixo', key: 'aro2OeEixo', width: 10 },
    { header: 'Aro2_OE_Alt', key: 'aro2OeAlt', width: 10 },
    { header: 'Aro2_OE_DNP', key: 'aro2OeDnp', width: 10 },
    { header: 'Aro2_Adicao', key: 'aro2Adicao', width: 10 },
    { header: 'Forma_Pagamento', key: 'formaPagamento', width: 18 },
    { header: 'Parcelas', key: 'parcelas', width: 10 },
    { header: 'Tipo_Pagamento', key: 'tipoPagamento', width: 15 },
    { header: 'Total_Venda', key: 'totalVenda', width: 15 },
    { header: 'Valor_Pago', key: 'valorPago', width: 15 },
    { header: 'Valor_Residual', key: 'valorResidual', width: 15 }
  ];

  sheetVendas.getRow(1).height = 28;
  sheetVendas.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = centerAlignment;
  });

  const demoVenda = [
    'OS-9901', new Date(2026, 5, 2), 'MN Nova Campinas', 'Ana Silva', 'CLI-554432', 'Mariana Alencar', 
    '15/08/1990', '444.333.222-11', '(19) 98877-6655', '(19) 98877-6655', 'mariana@example.com', 
    '13092-150', 'Rua dos Alecrins', '450', 'Apto 12', 'Cambuí', 'Campinas', 'SP', 
    'AR-1002', 'Ray-Ban Round Metal', 'Essilor Eyezen Crizal Sapphire', 450, 'Antirreflexo Crizal Sapphire', 180, 490, 
    '-1.50', '-0.75', '90°', '22', '31', '-1.50', '-0.75', '90°', '22', '31', '+2.00', 
    'SIM', 'AR-2005', 'Vogue CatEye', 'Essilor Comfort Easy', 300, 'Antirreflexo Crizal Easy', 120, 290, 
    '0.00', '-0.50', '180°', '20', '32', '0.00', '-0.50', '180°', '20', '32', '+1.50', 
    'Cartão de Crédito', 3, 'Sinal', 1830, 800, 1030
  ];

  const rowV = sheetVendas.addRow(demoVenda);
  rowV.height = 20;
  rowV.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    cell.border = thinBorder;
    cell.font = { name: 'Segoe UI', size: 10 };
    if ([22, 24, 25, 41, 43, 44, 59, 60, 61].includes(colNumber)) {
      cell.alignment = rightAlignment;
      cell.numFmt = currencyFormat;
    } else if ([1, 2, 5, 7, 8, 12, 18, 19, 37, 38, 57].includes(colNumber)) {
      cell.alignment = centerAlignment;
    } else {
      cell.alignment = leftAlignment;
    }
  });

  const filename = 'planilha_controle_lentes_V2.xlsx';
  const outputPath = path.join(__dirname, filename);
  await workbook.xlsx.writeFile(outputPath);
  console.log(`Planilha de Banco de Dados com Usuários e Logs criada em: ${outputPath}`);
}

createSpreadsheet().catch(err => {
  console.error('Erro ao gerar planilha do Web App:', err);
  process.exit(1);
});
