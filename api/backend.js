/**
 * Web App de Gestão de Lentes e Vendas - Backend Serverless API (Vercel)
 * Conectado diretamente ao Supabase PostgreSQL na Nuvem (sem dependência de Apps Script/Sheets)
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mngwfearwjkpisararbe.supabase.co";

const crypto = require('crypto');
const JWT_SECRET = process.env.JWT_SECRET || "atlas-controle-lentes-security-secret-key-2026";

function generateToken(userPayload) {
  try {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const exp = Math.floor(Date.now() / 1000) + (24 * 60 * 60); // 24 horas
    const payload = Buffer.from(JSON.stringify({ ...userPayload, exp })).toString("base64url");
    const signature = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    return `${header}.${payload}.${signature}`;
  } catch (e) {
    return null;
  }
}

function verifyToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  try {
    const expectedSig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${payload}`).digest("base64url");
    if (expectedSig !== signature) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch (e) {
    return null;
  }
}

const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uZ3dmZWFyd2prcGlzYXJhcmJlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTc5MzksImV4cCI6MjA5NjE3MzkzOX0.vk9Ol41NU2RI72-ZZKIcm7hzccYBjzPPptb6rZv_mKs";

/**
 * Formata data no fuso de São Paulo (substitui Utilities.formatDate)
 */
function formatDateSP(date) {
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).format(date);
  } catch (e) {
    return date ? date.toISOString() : "";
  }
}

/**
 * Dispara requisições HTTP REST para a API do Supabase (Node.js nativo).
 */
async function supabaseFetch(path, options = {}) {
  if (!path || typeof path !== 'string' || path.indexOf('/') !== 0) {
    console.warn("Aviso: supabaseFetch chamado com caminho inválido: " + path);
    return [];
  }
  options.headers = options.headers || {};
  options.headers['apikey'] = SUPABASE_KEY;
  options.headers['Authorization'] = 'Bearer ' + SUPABASE_KEY;
  options.headers['Content-Type'] = 'application/json';
  options.headers['Prefer'] = options.headers['Prefer'] || 'return=representation';

  // Support payload as body
  if (options.payload && !options.body) {
    options.body = options.payload;
    delete options.payload;
  }
  delete options.muteHttpExceptions;

  const url = SUPABASE_URL + '/rest/v1' + path;
  const response = await fetch(url, options);
  const text = await response.text();

  if (!response.ok) {
    console.error("Erro API Supabase: " + text + " (URL: " + url + ")");
    throw new Error("Erro no banco de dados (" + response.status + "): " + text);
  }

  if (!text || text.trim() === "") return [];
  try {
    return JSON.parse(text);
  } catch (e) {
    return text;
  }
}

async function supabaseFetchAll(paths) {
  if (!paths || !Array.isArray(paths)) {
    console.warn("Aviso: supabaseFetchAll chamado com parâmetro inválido.");
    return [];
  }
  return Promise.all(paths.map(async (p) => await supabaseFetch(p)));
}

async function supabaseFetchPaginated(path, pageSize = 1000) {
  let allRows = [];
  let offset = 0;
  let keepGoing = true;
  while (keepGoing) {
    const separator = path.includes('?') ? '&' : '?';
    const pagePath = `${path}${separator}limit=${pageSize}&offset=${offset}`;
    const rows = await supabaseFetch(pagePath);
    if (Array.isArray(rows) && rows.length > 0) {
      allRows = allRows.concat(rows);
      if (rows.length < pageSize) {
        keepGoing = false;
      } else {
        offset += pageSize;
      }
    } else {
      keepGoing = false;
    }
  }
  return allRows;
}

// Conversores de Data (DD/MM/YYYY <=> YYYY-MM-DD)
function dmyToYmd(dmy) {
  if (!dmy) return null;
  var parts = dmy.split('/');
  if (parts.length !== 3) return dmy;
  return parts[2] + '-' + parts[1] + '-' + parts[0];
}

function ymdToDmy(ymd) {
  if (!ymd) return "";
  if (ymd.indexOf('T') !== -1) {
    ymd = ymd.split('T')[0];
  }
  var parts = ymd.split('-');
  if (parts.length !== 3) return ymd;
  return parts[2] + '/' + parts[1] + '/' + parts[0];
}

/**
 * Registra logs de auditoria no Supabase.
 */
async function logAction(username, action) {
  try {
    await supabaseFetch("/auditoria_logs", {
      method: "POST",
      payload: JSON.stringify({
        usuario: username || 'sistema',
        acao: action
      })
    });
  } catch (e) {
    Logger.log("Erro ao salvar log: " + e.toString());
  }
}

// ==========================================
// ROTAS DE ENTRADA WEB APP (API GATEWAY)
// ==========================================



// ==========================================
// MÉTODOS DE REGISTRO E AUTENTICAÇÃO
// ==========================================

async function authenticateUser(username, password) {
  try {
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    if (users.length === 0) {
      return { success: false, error: "Usuário não encontrado." };
    }
    
    var user = users[0];
    if (user.senha !== password) {
      return { success: false, error: "Senha incorreta." };
    }
    
    if (user.status !== 'ATIVO') {
      return { success: false, error: "Este usuário está inativo." };
    }
    
    await logAction(username, "Login efetuado com sucesso");
    
    var token = generateToken({
      username: user.usuario,
      nome: user.nome,
      loja: user.loja || 'Todos'
    });
    
    var extra = parseExtraPermissions(user.medicos, user);
    // Retorna o objeto de usuário formatado para sessões
    return {
      success: true,
      token: token,
      user: {
        username: user.usuario,
        nome: user.nome,
        loja: user.loja || 'Todos',
        mustChangePassword: extra.mustChangePassword,
        permissions: {
          conferencia: user.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: user.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: user.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: user.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: user.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: user.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: user.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: user.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: user.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          medicos: extra.medicos,
          orcamentos: extra.orcamentos,
          garantias: extra.garantias,
          devolucoes: extra.devolucoes,
          assistencia: extra.assistencia,
          visitaMedica: extra.visitaMedica,
          vendaOSList: extra.vendaOSList,
          leadKanban: extra.leadKanban,
          leadControle: extra.leadControle,
          ocorrencias: extra.ocorrencias
        }
      }
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function getUserUsername(loggedUser) {
  if (!loggedUser) return "";
  if (typeof loggedUser === 'string') {
    if (loggedUser.trim().indexOf('{') === 0) {
      try {
        var parsed = JSON.parse(loggedUser);
        return parsed.username || parsed.usuario || "";
      } catch (e) {}
    }
    return loggedUser;
  }
  if (typeof loggedUser === 'object') {
    return loggedUser.username || loggedUser.usuario || "";
  }
  return "";
}

async function validateUserSession(loggedUser, requiredPermission) {
  try {
    var username = getUserUsername(loggedUser);
    if (!username) return false;
    
    var users = await supabaseFetch("/usuarios?usuario=ilike." + encodeURIComponent(username));
    if (users.length === 0) return false;
    
    var user = users[0];
    if (user.status !== 'ATIVO') return false;
    
    if (requiredPermission) {
      // Mapeamento de chaves de permissão
      var permissionCol = requiredPermission;
      if (requiredPermission === 'logVendas') permissionCol = 'log_vendas';
      if (requiredPermission === 'resumoVendas') permissionCol = 'resumo_vendas';
      
      var newPerms = ['medicos', 'orcamentos', 'garantias', 'devolucoes', 'assistencia', 'visitaMedica', 'vendaOSList', 'leadKanban', 'leadControle', 'ocorrencias'];
      if (newPerms.indexOf(requiredPermission) !== -1) {
        var extra = parseExtraPermissions(user.medicos, user);
        return extra[requiredPermission] === 'ATIVO';
      }
      
      return user[permissionCol] === 'ATIVO';
    }
    return true;
  } catch (e) {
    return false;
  }
}

// ==========================================
// LEITURA DOS DADOS (getAppData)
// ==========================================

async function getAppData(loggedUser) {
  var username = getUserUsername(loggedUser);
  if (!username) {
    return { success: false, error: 'UNAUTHORIZED: Acesso negado. Usuário não autenticado.' };
  }
  if (!await validateUserSession(loggedUser)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  try {
    var paths = [
      "/lojas",
      "/laboratorios",
      "/vendedores",
      "/representantes",
      "/contatos_resumo",
      "/produtos",
      "/auditoria_logs?order=data_hora.desc&limit=100",
      "/vendas?order=data.desc&limit=300",
      "/conferencias?order=data.desc&limit=300",
      "/config_settings",
      "/ocorrencias?order=data.desc"
    ];
    
    var results = await supabaseFetchAll(paths);
    
    var lojasRaw = results[0];
    var labsRaw = results[1];
    var vendedoresRaw = results[2];
    var representantesRaw = results[3];
    var contatosRaw = results[4];
    var produtosRaw = results[5];
    var logsRaw = results[6];
    var vendasRaw = results[7];
    var confsRaw = results[8];
    var configsList = results[9];
    var ocorrenciasRaw = results[10];

    var visitasRaw = [];
    try {
      visitasRaw = await supabaseFetchPaginated("/visitas_medicas?order=data.desc,hora.desc");
    } catch (errVisitas) {
      console.warn("Aviso ao consultar public.visitas_medicas, usando fallback:", errVisitas);
    }

    // 1. Obter tabelas simples
    var lojas = lojasRaw.map(function(x) { return x.nome; });
    var labs = labsRaw.map(function(x) { return x.nome; });
    var vendedores = vendedoresRaw.map(function(x) { return x.nome; });
    var representantes = representantesRaw.map(function(x) { return x.nome; });
    
    var contatos = contatosRaw.map(function(x) {
      return { nome: x.nome, telefone: x.telefone };
    });
    
    var produtos = produtosRaw.map(function(x) {
      return { nome: x.nome, preco: Number(x.preco), laboratorio: x.laboratorio, tipo: x.tipo };
    });
    
    // 2. Logs de Auditoria (últimos 100)
    var logs = logsRaw.map(function(x) {
      var logTime = "";
      if (x.data_hora) {
        try {
          var tParts = x.data_hora.split('T');
          if (tParts.length === 2) {
            var dateParts = tParts[0].split('-');
            var timeParts = tParts[1].split('.')[0].split(':');
            
            var year = Number(dateParts[0]);
            var month = Number(dateParts[1]) - 1;
            var day = Number(dateParts[2]);
            var hours = Number(timeParts[0]);
            var minutes = Number(timeParts[1]);
            var seconds = Number(timeParts[2]);
            
            var utcDate = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
            logTime = formatDateSP(utcDate);
          }
        } catch (err) {
          // Fallback se ocorrer qualquer erro na conversão de fuso horário
          logTime = ymdToDmy(x.data_hora.split('T')[0]) + " " + x.data_hora.split('T')[1].split('.')[0];
        }
      }
      return {
        data: logTime,
        timestamp: logTime,
        usuario: x.usuario,
        acao: x.acao
      };
    });
    
    // 3. Vendas (Formatando o JSONB detalhes com os metadados externos)
    var vendas = vendasRaw.map(function(v) {
      var details = v.detalhes || {};
      details.osVenda = v.os_venda;
      details.data = ymdToDmy(v.data);
      details.loja = v.loja;
      details.vendedor = v.vendedor;
      details.clienteNome = v.cliente_nome;
      details.totalVenda = Number(v.total_venda);
      return details;
    });

    // 4. Conferências / Lançamentos Lab (Formatando JSONB)
    var conferencias = confsRaw.map(function(c) {
      var details = c.detalhes || {};
      var dateStr = ymdToDmy(c.data);
      details.Data = dateStr;
      details.data = dateStr;
      details.Loja = c.loja;
      details.loja = c.loja;
      details.OSLoja = c.os;
      details.osLoja = c.os;
      details.LabPedido = c.laboratorio;
      details.labPedido = c.laboratorio;
      return details;
    });
    
    // 4.5 Ocorrências (Formatando JSONB)
    var ocorrencias = (ocorrenciasRaw || []).map(function(o) {
      var details = {};
      if (o.detalhes) {
        try {
          details = typeof o.detalhes === 'string' ? JSON.parse(o.detalhes) : o.detalhes;
        } catch(e) {}
      }
      return {
        id: o.id,
        os: o.os,
        loja: o.loja,
        vendedor: o.vendedor,
        clienteNome: o.cliente_nome,
        cliente_nome: o.cliente_nome,
        data: ymdToDmy(o.data),
        motivo: o.motivo,
        custoAdicional: Number(o.custo_adicional) || 0.00,
        custo_adicional: Number(o.custo_adicional) || 0.00,
        detalhes: details
      };
    });
    
    // 5. Configurações de Parâmetros
    var configs = {
      sessionTimeout: '2',
      logoUrl: '',
      comissaoMedicoPerc: '15',
      comissaoRepPercAbaixo: '1',
      comissaoRepPercAcima: '6',
      comissaoRepMeta: '200000',
      comissaoVendedorPerc: '2',
      comissaoGerentePerc: '1',
      comissaoLojaPerc: '10'
    };
    var medicos = [];
    var clinicas = [];
    var assistencias = [];
    var tecnicos = [];
    var vendedores = [];
    var captadores = [];
    var motivosPerda = ["Preço alto", "Prazo longo", "Falta do produto", "Garantia/Insatisfação", "Outro motivo"];
    var motivosOcorrencia = ["Erro de Digitação", "Atraso no Lab", "Quebra na Montagem", "Outro motivo"];
    var formasPagamento = ["Dinheiro", "Pix", "Cartão de Crédito", "Crediário", "Depósito/Transferência"];
    var orcamentos = [];
    var visitas = [];
    var assuntosVisita = ["Apresentação de Linha", "Feedback de Adaptação", "Lançamento de Lentes", "Visita de Relacionamento"];
    var assistTemplates = {
      tecnico: "Olá {tecnico}, a loja {loja} solicitou assistência para a OS {os} no dia {data} às {hora}.\n\nCliente: {cliente}\nMotivo: {motivo}\nLentes: {lente}.",
      clientePendente: "Olá {cliente}! Recebemos a sua solicitação de assistência técnica para os seus óculos (OS {os}). Reservamos o dia {data} às {hora}.\n\nNosso técnico está confirmando a agenda e, assim que aprovado, você receberá a confirmação aqui no WhatsApp!",
      clienteConfirmado: "Olá {cliente}! Seu atendimento de assistência técnica foi CONFIRMADO por nosso técnico para o dia {data} às {hora}. Esperamos você!"
    };

    var hasCustomVendedores = false;

    configsList.forEach(function(c) {
      if (c.key === 'sessionTimeout') configs.sessionTimeout = c.value;
      if (c.key === 'logoUrl') configs.logoUrl = c.value;
      if (c.key === 'comissaoMedicoPerc') configs.comissaoMedicoPerc = c.value;
      if (c.key === 'comissaoRepPercAbaixo') configs.comissaoRepPercAbaixo = c.value;
      if (c.key === 'comissaoRepMeta') configs.comissaoRepMeta = c.value;
      if (c.key === 'comissaoVendedorPerc') configs.comissaoVendedorPerc = c.value;
      if (c.key === 'comissaoGerentePerc') configs.comissaoGerentePerc = c.value;
      if (c.key === 'comissaoLojaPerc') configs.comissaoLojaPerc = c.value;
      if (c.key === 'medicos') {
        try { medicos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'clinicas') {
        try { clinicas = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assistencias') {
        try { assistencias = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'visitas' && (!visitasRaw || visitasRaw.length === 0)) {
        try { visitas = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assuntosVisita') {
        try { assuntosVisita = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'tecnicos') {
        try { tecnicos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'vendedores') {
        try { vendedores = JSON.parse(c.value); hasCustomVendedores = true; } catch(e) {}
      }
      if (c.key === 'captadores') {
        try { captadores = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'formasPagamento' || c.key === 'formas_pagamento') {
        try { formasPagamento = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'motivosPerda' || c.key === 'motivos_perda') {
        try { motivosPerda = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'motivosOcorrencia' || c.key === 'motivos_ocorrencia') {
        try { motivosOcorrencia = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'orcamentos') {
        try { orcamentos = JSON.parse(c.value); } catch(e) {}
      }
      if (c.key === 'assistTemplateTecnico') assistTemplates.tecnico = c.value;
      if (c.key === 'assistTemplateClientePendente') assistTemplates.clientePendente = c.value;
      if (c.key === 'assistTemplateClienteConfirmado') assistTemplates.clienteConfirmado = c.value;
    });

    if (visitasRaw && visitasRaw.length > 0) {
      visitas = visitasRaw.map(function(v) {
        var isClin = v.medico_crm === 'CLINICA' || 
          (v.medico_nome && (v.medico_nome.toLowerCase().includes('clínica') || v.medico_nome.toLowerCase().includes('clinica')));
        return {
          id: v.id,
          data: v.data,
          hora: v.hora,
          representante: v.representante,
          medicoNome: v.medico_nome,
          medicoCrm: v.medico_crm,
          medico_nome: v.medico_nome,
          medico_crm: v.medico_crm,
          tipo: isClin ? 'Clinica' : 'Medico',
          clinicaNome: isClin ? v.medico_nome : '',
          assunto: v.assunto,
          status: v.status,
          relato: v.relato || '',
          lat: (v.lat !== null && v.lat !== undefined && !isNaN(v.lat)) ? Number(v.lat) : null,
          lng: (v.lng !== null && v.lng !== undefined && !isNaN(v.lng)) ? Number(v.lng) : null,
          created_at: v.created_at
        };
      });
    }

    if (!hasCustomVendedores) {
      var legacyVendedores = vendedoresRaw || [];
      vendedores = legacyVendedores.map(function(x) {
        return { nome: x.nome, loja: "Todos" };
      });
    }

    var campanhas = [];
    try {
      var campsRaw = await supabaseFetch("/campanhas?order=id.asc");
      campanhas = campsRaw.map(function(c) {
        return {
          id: c.id,
          nome: c.nome,
          status: c.status || 'ATIVO',
          data_inicio: c.data_inicio ? (c.data_inicio.indexOf('-') !== -1 ? c.data_inicio : ymdToDmy(c.data_inicio)) : '',
          data_fim: c.data_fim ? (c.data_fim.indexOf('-') !== -1 ? c.data_fim : ymdToDmy(c.data_fim)) : '',
          lojas: c.lojas || 'Todas',
          loja: c.lojas || 'Todas',
          aro: c.aro || '',
          lente: c.lente || '',
          preco_alvo: Number(c.preco_alvo) || 0
        };
      });
    } catch(e) {
      Logger.log("Erro ao buscar campanhas: " + e.toString());
    }

    var leads = [];
    try {
      var leadsRaw = await supabaseFetch("/leads?order=id.desc");
      leads = leadsRaw.map(function(l) {
        var data_visita = "";
        var hora_visita = "";
        if (l.dia_horario) {
          try {
            // dia_horario no banco é ISO string
            var dt = new Date(l.dia_horario);
            if (!isNaN(dt.getTime())) {
              // Ajusta fuso horário local se necessário
              var year = dt.getFullYear();
              var month = ("0" + (dt.getMonth() + 1)).slice(-2);
              var day = ("0" + dt.getDate()).slice(-2);
              data_visita = year + "-" + month + "-" + day;
              
              var hh = ("0" + dt.getHours()).slice(-2);
              var mm = ("0" + dt.getMinutes()).slice(-2);
              hora_visita = hh + ":" + mm;
            }
          } catch(err) {}
        }
        var det = {};
        if (l.detalhes) {
          try {
            det = typeof l.detalhes === 'string' ? JSON.parse(l.detalhes) : l.detalhes;
          } catch(err) {}
        }
        return {
          id: l.id,
          nome: l.nome,
          whatsapp: l.telefone || '',
          telefone: l.telefone || '',
          loja: l.loja_destino || '',
          loja_destino: l.loja_destino || '',
          data_visita: data_visita,
          hora_visita: hora_visita,
          dia_horario: l.dia_horario,
          campanha_id: l.campanha_id,
          status: l.status || 'entrante',
          vendedor: l.vendedor || '',
          produtos_vendidos: l.produtos_vendidos || '',
          valor_vendido: Number(l.valor_vendido) || 0,
          forma_pagamento: l.forma_pagamento || '',
          motivo_perda: l.motivo_perda || '',
          venda_os: l.venda_os || '',
          obs: det.obs || '',
          detalhes: det,
          criado_em: l.created_at || '',
          atualizado_em: l.atualizado_em || l.created_at || ''
        };
      });
    } catch(e) {
      Logger.log("Erro ao buscar leads: " + e.toString());
    }

    return {
      success: true,
      lojas: lojas,
      labs: labs,
      vendedores: vendedores,
      produtos: produtos,
      representantes: representantes,
      contatosResumo: contatos,
      logs: logs,
      vendas: vendas,
      lancamentos: conferencias,
      configs: configs,
      medicos: medicos,
      clinicas: clinicas,
      assistencias: assistencias,
      tecnicos: tecnicos,
      assistTemplates: assistTemplates,
      captadores: captadores,
      motivosPerda: motivosPerda,
      motivosOcorrencia: motivosOcorrencia,
      formasPagamento: formasPagamento,
      orcamentos: orcamentos,
      visitas: visitas,
      assuntosVisita: assuntosVisita,
      campanhas: campanhas,
      leads: leads,
      ocorrencias: ocorrencias
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ==========================================
// SALVAR E EXCLUIR VENDAS
// ==========================================

async function addVenda(saleData, loggedUserUsername) {
  try {
    var os = saleData.osVenda;
    if (!os) throw new Error("OS da Venda é obrigatório.");
    
    // Limpar chaves externas do objeto para o JSONB
    var metadata = {
      os_venda: os,
      data: dmyToYmd(saleData.data),
      loja: saleData.loja,
      vendedor: saleData.vendedor,
      cliente_nome: saleData.clienteNome,
      total_venda: Number(saleData.totalVenda) || 0
    };
    
    var payload = Object.assign({}, saleData);
    delete payload.osVenda;
    delete payload.data;
    delete payload.loja;
    delete payload.vendedor;
    delete payload.clienteNome;
    delete payload.totalVenda;
    
    metadata.detalhes = payload;

    // Verificar se a OS já existe no banco
    var exists = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
    
    if (exists.length > 0) {
      // Atualizar venda
      await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os), {
        method: "PATCH",
        payload: JSON.stringify(metadata)
      });
      await logAction(loggedUserUsername, "Atualizou venda OS: " + os);
    } else {
      // Criar nova venda
      await supabaseFetch("/vendas", {
        method: "POST",
        payload: JSON.stringify(metadata)
      });
      await logAction(loggedUserUsername, "Cadastrou nova venda OS: " + os);
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function validateDeletionAuthority(authUser, authPass, requiredPermission) {
  if (!authUser || !authPass) {
    throw new Error("Credenciais de autorização de exclusão não fornecidas.");
  }
  var normalizedAuthUser = authUser.trim().toLowerCase();
  var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(normalizedAuthUser));
  if (users.length === 0) {
    throw new Error("Usuário autorizador não encontrado.");
  }
  var user = users[0];
  if (user.senha !== authPass) {
    throw new Error("Senha do autorizador incorreta.");
  }
  if (user.status !== 'ATIVO') {
    throw new Error("O usuário autorizador está inativo.");
  }
  
  if (normalizedAuthUser === 'admin') {
    return user;
  }
  
  var hasConfig = user.configuracoes === 'ATIVO';
  var hasSpecific = false;
  if (requiredPermission) {
    var permissionCol = requiredPermission;
    if (requiredPermission === 'logVendas') permissionCol = 'log_vendas';
    if (requiredPermission === 'resumoVendas') permissionCol = 'resumo_vendas';
    hasSpecific = user[permissionCol] === 'ATIVO';
  }
  
  if (!hasConfig && !hasSpecific) {
    throw new Error("O usuário autorizador não possui permissão para autorizar esta exclusão.");
  }
  return user;
}

async function deleteVendas(osList, loggedUserUsername) {
  try {
    if (!osList || osList.length === 0) return { success: true };
    var username = getUserUsername(loggedUserUsername);
    if (!username) return { success: false, error: "Acesso não autorizado." };
    
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    var userLoja = (users && users.length > 0) ? (users[0].loja || 'Todos') : 'Todos';

    for (var i = 0; i < osList.length; i++) {
      var os = osList[i];
      if (userLoja !== 'Todos') {
        var existing = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
        if (existing && existing.length > 0 && existing[0].loja !== userLoja) {
          return { success: false, error: "Permissão negada: não é permitido excluir vendas de outra filial." };
        }
      }
      await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os), {
        method: "DELETE"
      });
      await logAction(loggedUserUsername, "Excluiu venda OS: " + os);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// SALVAR E EXCLUIR CONFERÊNCIAS (LAB)
// ==========================================

async function addConferencia(confData, loggedUserUsername) {
  try {
    var os = confData.OSLoja !== undefined ? confData.OSLoja : confData.osLoja;
    if (!os) throw new Error("OS do Lançamento é obrigatória.");
    
    var rawData = confData.Data !== undefined ? confData.Data : confData.data;
    var rawLoja = confData.Loja !== undefined ? confData.Loja : confData.loja;
    var rawLab = confData.LabPedido !== undefined ? confData.LabPedido : confData.labPedido;
    
    var metadata = {
      os: os.toString(),
      data: dmyToYmd(rawData),
      loja: rawLoja,
      laboratorio: rawLab
    };
    
    var payload = Object.assign({}, confData);
    delete payload.OSLoja;
    delete payload.osLoja;
    delete payload.Data;
    delete payload.data;
    delete payload.Loja;
    delete payload.loja;
    delete payload.LabPedido;
    delete payload.labPedido;
    
    metadata.detalhes = payload;
    
    // Verificar se o lançamento já existe
    var exists = await supabaseFetch("/conferencias?os=eq." + encodeURIComponent(os));
    
    if (exists.length > 0) {
      await supabaseFetch("/conferencias?os=eq." + encodeURIComponent(os), {
        method: "PATCH",
        payload: JSON.stringify(metadata)
      });
      await logAction(loggedUserUsername, "Atualizou conferência OS: " + os);
    } else {
      await supabaseFetch("/conferencias", {
        method: "POST",
        payload: JSON.stringify(metadata)
      });
      await logAction(loggedUserUsername, "Lançou conferência OS: " + os);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteConferencia(os, dataStr, loggedUserUsername) {
  try {
    var query = "/conferencias?os=eq." + encodeURIComponent(os);
    if (dataStr) {
      query += "&data=eq." + encodeURIComponent(dmyToYmd(dataStr));
    }
    await supabaseFetch(query, {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu conferência OS: " + os);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteConferenciaGroup(items, loggedUserUsername) {
  try {
    if (!items || items.length === 0) return { success: true };
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var os = item.os || item.osLoja;
      var dataStr = item.dataStr || item.data;
      var query = "/conferencias?os=eq." + encodeURIComponent(os);
      if (dataStr) {
        query += "&data=eq." + encodeURIComponent(dmyToYmd(dataStr));
      }
      await supabaseFetch(query, {
        method: "DELETE"
      });
      await logAction(loggedUserUsername, "Excluiu conferência grupo OS: " + os);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// OPERAÇÕES DE CONFIGURAÇÃO (CRUD TABELAS APOIO)
// ==========================================

// 1. Lojas
async function addLoja(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await supabaseFetch("/lojas", {
      method: "POST",
      payload: JSON.stringify({ nome: name })
    });
    await logAction(loggedUserUsername, "Cadastrou loja: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLoja(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu loja: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function renameLoja(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(oldName), {
      method: "PATCH",
      payload: JSON.stringify({ nome: newName })
    });
    await logAction(loggedUserUsername, "Renomeou loja de '" + oldName + "' para '" + newName + "'");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 2. Laboratórios
async function addLab(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await supabaseFetch("/laboratorios", {
      method: "POST",
      payload: JSON.stringify({ nome: name })
    });
    await logAction(loggedUserUsername, "Cadastrou laboratório: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLab(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu laboratório: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function renameLab(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(oldName), {
      method: "PATCH",
      payload: JSON.stringify({ nome: newName })
    });
    await logAction(loggedUserUsername, "Renomeou laboratório de '" + oldName + "' para '" + newName + "'");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 3. Vendedores
async function addVendedor(name, loggedUserUsername) {
  try {
    var exists = await supabaseFetch("/vendedores?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await supabaseFetch("/vendedores", {
      method: "POST",
      payload: JSON.stringify({ nome: name })
    });
    await logAction(loggedUserUsername, "Cadastrou vendedor: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteVendedor(name, loggedUserUsername) {
  try {
    await supabaseFetch("/vendedores?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu vendedor: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 4. Representantes
async function saveRepresentante(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      return { success: true };
    }
    await supabaseFetch("/representantes", {
      method: "POST",
      payload: JSON.stringify({ nome: name })
    });
    await logAction(loggedUserUsername, "Cadastrou representante: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteRepresentante(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu representante: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function renameRepresentante(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/representantes?nome=eq." + encodeURIComponent(oldName), {
      method: "PATCH",
      payload: JSON.stringify({ nome: newName })
    });
    await logAction(loggedUserUsername, "Renomeou representante de '" + oldName + "' para '" + newName + "'");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 5. Contatos Resumo
async function addContatoResumo(name, phone, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name));
    if (exists.length > 0) {
      await supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name), {
        method: "PATCH",
        payload: JSON.stringify({ telefone: phone })
      });
      await logAction(loggedUserUsername, "Atualizou contato resumo: " + name);
      return { success: true };
    }
    await supabaseFetch("/contatos_resumo", {
      method: "POST",
      payload: JSON.stringify({ nome: name, telefone: phone })
    });
    await logAction(loggedUserUsername, "Cadastrou contato resumo: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteContatoResumo(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/contatos_resumo?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu contato resumo: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// 6. Produtos (Catálogo)
async function addProduto(record, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var exists = await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(record.nome));
    if (exists.length > 0) {
      await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(record.nome), {
        method: "PATCH",
        payload: JSON.stringify({
          preco: Number(record.preco) || 0,
          laboratorio: record.laboratorio,
          tipo: record.tipo
        })
      });
      await logAction(loggedUserUsername, "Atualizou produto: " + record.nome);
      return { success: true };
    }
    await supabaseFetch("/produtos", {
      method: "POST",
      payload: JSON.stringify({
        nome: record.nome,
        preco: Number(record.preco) || 0,
        laboratorio: record.laboratorio,
        tipo: record.tipo
      })
    });
    await logAction(loggedUserUsername, "Cadastrou produto: " + record.nome);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteProduto(name, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(name), { method: "DELETE" });
    await logAction(loggedUserUsername, "Excluiu produto: " + name);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}


// ==========================================
// SALVAR PARÂMETROS E CONFIGURAÇÕES
// ==========================================

async function saveConfigKey(key, value) {
  var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(key));
  if (exists.length > 0) {
    await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(key), {
      method: "PATCH",
      payload: JSON.stringify({ value: value.toString() })
    });
  } else {
    await supabaseFetch("/config_settings", {
      method: "POST",
      payload: JSON.stringify({ key: key, value: value.toString() })
    });
  }
}

async function saveLogoUrl(url, loggedUserUsername) {
  try {
    await saveConfigKey('logoUrl', url);
    await logAction(loggedUserUsername, "Atualizou URL do logotipo");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLogoUrl(loggedUserUsername) {
  try {
    await saveConfigKey('logoUrl', '');
    await logAction(loggedUserUsername, "Excluiu logotipo customizado");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveSessionTimeoutSetting(value, loggedUserUsername) {
  try {
    await saveConfigKey('sessionTimeout', value);
    await logAction(loggedUserUsername, "Alterou timeout da sessão para " + value + " horas");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// GESTÃO DE USUÁRIOS
// ==========================================

function parseExtraPermissions(medicosColValue, user) {
  var extra = {
    medicos: 'ATIVO',
    orcamentos: 'INATIVO',
    garantias: 'INATIVO',
    devolucoes: 'INATIVO',
    assistencia: 'INATIVO',
    visitaMedica: 'INATIVO',
    vendaOSList: 'INATIVO',
    leadKanban: 'INATIVO',
    leadControle: 'INATIVO',
    ocorrencias: 'INATIVO',
    mustChangePassword: false
  };

  // Fallbacks para compatibilidade anterior se for um registro legado
  if (user) {
    var uName = (user.usuario || user.username || "").toLowerCase().trim();
    if (uName === 'admin') {
      extra.medicos = 'ATIVO';
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.devolucoes = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
      extra.leadKanban = 'ATIVO';
      extra.leadControle = 'ATIVO';
      extra.ocorrencias = 'ATIVO';
    }
    if (user.venda === 'ATIVO') {
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
    }
    if (user.conferencia === 'ATIVO') {
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
    }
    if (user.log_vendas === 'ATIVO' || user.log_venda === 'ATIVO') {
      extra.devolucoes = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
    }
  }

  if (medicosColValue !== null && medicosColValue !== undefined) {
    var str = medicosColValue.toString().trim();
    if (str.indexOf('{') === 0) {
      try {
        var parsed = JSON.parse(str);
        if (parsed.hasOwnProperty('medicos')) extra.medicos = parsed.medicos;
        if (parsed.hasOwnProperty('orcamentos')) extra.orcamentos = parsed.orcamentos;
        if (parsed.hasOwnProperty('garantias')) extra.garantias = parsed.garantias;
        if (parsed.hasOwnProperty('devolucoes')) extra.devolucoes = parsed.devolucoes;
        if (parsed.hasOwnProperty('assistencia')) extra.assistencia = parsed.assistencia;
        if (parsed.hasOwnProperty('visitaMedica')) extra.visitaMedica = parsed.visitaMedica;
        if (parsed.hasOwnProperty('vendaOSList')) extra.vendaOSList = parsed.vendaOSList;
        if (parsed.hasOwnProperty('leadKanban')) extra.leadKanban = parsed.leadKanban;
        if (parsed.hasOwnProperty('leadControle')) extra.leadControle = parsed.leadControle;
        if (parsed.hasOwnProperty('ocorrencias')) extra.ocorrencias = parsed.ocorrencias;
        if (parsed.hasOwnProperty('mustChangePassword')) extra.mustChangePassword = parsed.mustChangePassword;
      } catch (e) {}
    } else if (str === 'ATIVO' || str === 'INATIVO') {
      extra.medicos = str;
      if (extra.medicos === 'ATIVO') {
        extra.visitaMedica = 'ATIVO';
      }
    } else {
      // Formato compactado: lista separada por vírgula dos códigos de permissões ativas
      if (str !== "") {
        var parts = str.split(',');
        extra.medicos = parts.indexOf('med') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.orcamentos = parts.indexOf('orc') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.garantias = parts.indexOf('gar') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.devolucoes = parts.indexOf('dev') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.assistencia = parts.indexOf('ast') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.visitaMedica = parts.indexOf('vis') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.vendaOSList = parts.indexOf('osl') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.leadKanban = parts.indexOf('lkn') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.leadControle = parts.indexOf('lct') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.ocorrencias = parts.indexOf('oco') !== -1 ? 'ATIVO' : 'INATIVO';
        extra.mustChangePassword = parts.indexOf('pw') !== -1;
      }
    }
  }

  // Se for admin, força para garantir acesso irrestrito a todas as permissões
  if (user) {
    var uName = (user.usuario || user.username || "").toLowerCase().trim();
    if (uName === 'admin') {
      extra.medicos = 'ATIVO';
      extra.orcamentos = 'ATIVO';
      extra.garantias = 'ATIVO';
      extra.devolucoes = 'ATIVO';
      extra.assistencia = 'ATIVO';
      extra.visitaMedica = 'ATIVO';
      extra.vendaOSList = 'ATIVO';
      extra.leadKanban = 'ATIVO';
      extra.leadControle = 'ATIVO';
      extra.ocorrencias = 'ATIVO';
    }
  }

  return extra;
}

async function getUsersList(loggedUser) {
  var username = getUserUsername(loggedUser);
  if (username !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    var rawList = await supabaseFetch("/usuarios?order=usuario.asc");
    var formattedList = rawList.map(function(u) {
      var extra = parseExtraPermissions(u.medicos, u);
      return {
        username: u.usuario,
        senha: '••••••••',
        nome: u.nome,
        status: u.status,
        loja: u.loja || 'Todos',
        permissions: {
          conferencia: u.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: u.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: u.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: u.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: u.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: u.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: u.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: u.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: u.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          medicos: extra.medicos,
          orcamentos: extra.orcamentos,
          garantias: extra.garantias,
          devolucoes: extra.devolucoes,
          assistencia: extra.assistencia,
          visitaMedica: extra.visitaMedica,
          vendaOSList: extra.vendaOSList,
          leadKanban: extra.leadKanban,
          leadControle: extra.leadControle,
          ocorrencias: extra.ocorrencias,
          forcePasswordChange: extra.mustChangePassword ? 'ATIVO' : 'INATIVO'
        }
      };
    });
    return { success: true, users: formattedList };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveUser(userData, loggedUserUsername) {
  var username = getUserUsername(loggedUserUsername);
  if (username !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    var permissions = userData.permissions || {};
    var exists = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(userData.username));
    
    var passwordValue = userData.senha !== undefined ? userData.senha : userData.password;

    var payload = {
      usuario: userData.username,
      nome: userData.nome,
      status: userData.status,
      loja: userData.loja || 'Todos',
      conferencia: permissions.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      registros: permissions.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      dashboard: permissions.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      auditoria: permissions.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      configuracoes: permissions.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      logs: permissions.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      venda: permissions.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      log_vendas: permissions.logVendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
      resumo_vendas: permissions.resumoVendas === 'ATIVO' ? 'ATIVO' : 'INATIVO'
    };

    var schemaSample = exists.length > 0 ? exists[0] : (await supabaseFetch("/usuarios?limit=1")[0] || {});
    if (schemaSample.hasOwnProperty('medicos') || schemaSample.medicos !== undefined) {
      // Criar formato compactado para caber no limite varchar(50) do banco de dados
      var arr = [];
      if (permissions.medicos === 'ATIVO') arr.push('med');
      if (permissions.orcamentos === 'ATIVO') arr.push('orc');
      if (permissions.garantias === 'ATIVO') arr.push('gar');
      if (permissions.devolucoes === 'ATIVO') arr.push('dev');
      if (permissions.assistencia === 'ATIVO') arr.push('ast');
      if (permissions.visitaMedica === 'ATIVO') arr.push('vis');
      if (permissions.vendaOSList === 'ATIVO') arr.push('osl');
      if (permissions.leadKanban === 'ATIVO') arr.push('lkn');
      if (permissions.leadControle === 'ATIVO') arr.push('lct');
      if (permissions.ocorrencias === 'ATIVO') arr.push('oco');
      if (permissions.forcePasswordChange === 'ATIVO') arr.push('pw');
      payload.medicos = arr.join(',');
    }
    
    if (exists.length > 0) {
      if (passwordValue && passwordValue.trim() !== "") {
        payload.senha = passwordValue;
      }
      
      await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(userData.username), {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou permissões do usuário: " + userData.username);
    } else {
      payload.senha = passwordValue || "";
      
      await supabaseFetch("/usuarios", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou novo usuário: " + userData.username);
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function changeOwnPassword(newPassword, loggedUserUsername, currentPassword) {
  try {
    var username = getUserUsername(loggedUserUsername);
    if (!username) {
      return { success: false, error: "Sessão inválida." };
    }
    
    // Buscar o usuário
    var users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username));
    if (users.length === 0) {
      return { success: false, error: "Usuário não encontrado." };
    }
    
    var user = users[0];
    
    // Se fornecida senha atual, validar antes da alteração
    if (currentPassword !== undefined && currentPassword !== null && currentPassword !== "") {
      if (user.senha !== currentPassword) {
        return { success: false, error: "Senha atual incorreta." };
      }
    }
    
    // Atualizar a senha e remover o 'pw' da coluna medicos
    var extra = parseExtraPermissions(user.medicos, user);
    
    var arr = [];
    if (extra.medicos === 'ATIVO') arr.push('med');
    if (extra.orcamentos === 'ATIVO') arr.push('orc');
    if (extra.garantias === 'ATIVO') arr.push('gar');
    if (extra.devolucoes === 'ATIVO') arr.push('dev');
    if (extra.assistencia === 'ATIVO') arr.push('ast');
    if (extra.visitaMedica === 'ATIVO') arr.push('vis');
    if (extra.vendaOSList === 'ATIVO') arr.push('osl');
    if (extra.leadKanban === 'ATIVO') arr.push('lkn');
    if (extra.leadControle === 'ATIVO') arr.push('lct');
    // omitimos 'pw' aqui para remover a exigência de alteração
    
    var payload = {
      senha: newPassword,
      medicos: arr.join(',')
    };
    
    await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username), {
      method: "PATCH",
      payload: JSON.stringify(payload)
    });
    
    await logAction(username, "Alterou a própria senha (limpou exigência de primeiro login)");
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteUser(username, loggedUserUsername) {
  var reqUser = getUserUsername(loggedUserUsername);
  if (reqUser !== 'admin') {
    return { success: false, error: 'PERMISSION_DENIED' };
  }
  try {
    if (username === 'admin') {
      throw new Error("O usuário administrador padrão 'admin' não pode ser excluído.");
    }
    await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(username), {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu usuário: " + username);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// EMISSÃO DE PDF DE FECHAMENTO DIÁRIO
// ==========================================

async function getOrCreateAppFolder() {
  try {
    var folderName = "planilha_controle_lentes_V2_Assets";
    var folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      return folders.next();
    }
    return DriveApp.createFolder(folderName);
  } catch (e) {
    Logger.log("Erro em getOrCreateAppFolder: " + e.toString());
    return null;
  }
}

async function generateDailySummaryPDF(dateStr, loggedUser) {
  if (!await validateUserSession(loggedUser, 'logVendas') && 
      !await validateUserSession(loggedUser, 'venda') && 
      !await validateUserSession(loggedUser, 'vendaOSList') &&
      !await validateUserSession(loggedUser, 'conferencia')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    // 1. Carregar as vendas da data informada no Supabase
    var salesRaw = await supabaseFetch("/vendas?data=eq." + encodeURIComponent(dateStr));
    
    var sales = [];
    for (var i = 0; i < salesRaw.length; i++) {
      var row = salesRaw[i];
      var details = row.detalhes || {};
      
      // Montar exibição amigável de formas de pagamento
      var fpDisplay = details.Forma_Pagamento_1 || details.Forma_Pagamento || 'Não Informado';
      var parts = [];
      if (Number(details.Valor_Pagamento_1) > 0) {
        parts.push(fpDisplay + ' (R$ ' + Number(details.Valor_Pagamento_1).toFixed(2) + ')');
      }
      if (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum' && Number(details.Valor_Pagamento_2) > 0) {
        parts.push(details.Forma_Pagamento_2 + ' (R$ ' + Number(details.Valor_Pagamento_2).toFixed(2) + ')');
      }
      if (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum' && Number(details.Valor_Pagamento_3) > 0) {
        parts.push(details.Forma_Pagamento_3 + ' (R$ ' + Number(details.Valor_Pagamento_3).toFixed(2) + ')');
      }
      if (parts.length > 0) {
        fpDisplay = parts.join(' + ');
      }

      sales.push({
        os: row.os_venda,
        loja: row.loja,
        vendedor: row.vendedor,
        cliente: row.cliente_nome,
        total: Number(row.total_venda) || 0,
        pago: Number(details.Valor_Pago) || (Number(details.Valor_Pagamento_1 || 0) + Number(details.Valor_Pagamento_2 || 0) + Number(details.Valor_Pagamento_3 || 0)) || 0,
        residual: Number(details.Valor_Residual) || 0,
        formaPag: fpDisplay,
        formaPag1: details.Forma_Pagamento_1 || details.Forma_Pagamento || '',
        valorPag1: Number(details.Valor_Pagamento_1) || 0,
        formaPag2: (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum') ? details.Forma_Pagamento_2 : '',
        valorPag2: Number(details.Valor_Pagamento_2) || 0,
        formaPag3: (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum') ? details.Forma_Pagamento_3 : '',
        valorPag3: Number(details.Valor_Pagamento_3) || 0
      });
    }

    if (sales.length === 0) {
      var displayDateSplit = dateStr.split('-');
      throw new Error("Nenhuma venda registrada na data: " + displayDateSplit[2] + "/" + displayDateSplit[1] + "/" + displayDateSplit[0]);
    }

    var summaryLoja = {};
    var summaryFormaPag = {};
    var summaryVendedor = {};
    var grandTotal = 0;
    var grandPago = 0;
    var grandResidual = 0;

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      grandTotal += s.total;
      grandPago += s.pago;
      grandResidual += s.residual;

      if (!summaryLoja[s.loja]) summaryLoja[s.loja] = { total: 0, pago: 0, residual: 0, count: 0 };
      summaryLoja[s.loja].total += s.total;
      summaryLoja[s.loja].pago += s.pago;
      summaryLoja[s.loja].residual += s.residual;
      summaryLoja[s.loja].count++;

      var f1 = s.formaPag1 || '';
      var v1 = s.valorPag1 || 0;
      var f2 = s.formaPag2 || '';
      var v2 = s.valorPag2 || 0;
      var f3 = s.formaPag3 || '';
      var v3 = s.valorPag3 || 0;

      // Fallback para vendas antigas
      if (!v1 && !v2 && !v3) {
        f1 = s.formaPag || 'Não Informado';
        v1 = s.pago || s.total || 0;
      }

      var totalPag = v1 + v2 + v3;
      if (totalPag > 0) {
        if (v1 > 0 && f1) {
          var prop1 = v1 / totalPag;
          var fat1 = s.total * prop1;
          if (!summaryFormaPag[f1]) summaryFormaPag[f1] = { total: 0, count: 0 };
          summaryFormaPag[f1].total += fat1;
          summaryFormaPag[f1].count++;
        }
        if (v2 > 0 && f2) {
          var prop2 = v2 / totalPag;
          var fat2 = s.total * prop2;
          if (!summaryFormaPag[f2]) summaryFormaPag[f2] = { total: 0, count: 0 };
          summaryFormaPag[f2].total += fat2;
          summaryFormaPag[f2].count++;
        }
        if (v3 > 0 && f3) {
          var prop3 = v3 / totalPag;
          var fat3 = s.total * prop3;
          if (!summaryFormaPag[f3]) summaryFormaPag[f3] = { total: 0, count: 0 };
          summaryFormaPag[f3].total += fat3;
          summaryFormaPag[f3].count++;
        }
      } else {
        var fFallback = f1 || 'Não Informado';
        if (!summaryFormaPag[fFallback]) summaryFormaPag[fFallback] = { total: 0, count: 0 };
        summaryFormaPag[fFallback].total += s.total;
        summaryFormaPag[fFallback].count++;
      }

      var vName = s.vendedor || 'Não Identificado';
      if (!summaryVendedor[vName]) summaryVendedor[vName] = { total: 0, count: 0 };
      summaryVendedor[vName].total += s.total;
      summaryVendedor[vName].count++;
    }

    var dateParts = dateStr.split('-');
    var displayDate = dateParts[2] + '/' + dateParts[1] + '/' + dateParts[0];

    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fechamento de Vendas do Dia ' + displayDate + '</title>' +
      '<style>' +
      'body { font-family: sans-serif; color: #333; padding: 20px; line-height: 1.4; }' +
      '.header { text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 10px; margin-bottom: 20px; }' +
      '.title { font-size: 24px; font-weight: bold; color: #10b981; }' +
      '.section { margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; padding: 12px; }' +
      '.section-title { font-weight: bold; color: #1e293b; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-bottom: 8px; font-size: 14px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 12px; }' +
      'th, td { border: 1px solid #ddd; padding: 6px; }' +
      'th { background-color: #f1f5f9; text-align: left; }' +
      '.text-right { text-align: right; }' +
      '.text-center { text-align: center; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      '<div class="header"><div class="title">RESUMO DE VENDAS DIÁRIO</div><div>Data: ' + displayDate + ' | Relatório consolidado</div></div>' +
      
      '<div class="section"><div class="section-title">CONSOLIDADO POR FILIAL / LOJA</div>' +
      '<table><thead><tr><th>Loja/Filial</th><th class="text-center">Vendas</th><th class="text-right">Faturamento (R$)</th><th class="text-right">Recebido (R$)</th><th class="text-right">Residual (R$)</th></tr></thead><tbody>';

    var lojas = Object.keys(summaryLoja);
    for (var i = 0; i < lojas.length; i++) {
      var lj = lojas[i];
      var dataLj = summaryLoja[lj];
      html += '<tr><td><strong>' + lj + '</strong></td><td class="text-center">' + dataLj.count + '</td><td class="text-right">R$ ' + dataLj.total.toFixed(2) + '</td><td class="text-right">R$ ' + dataLj.pago.toFixed(2) + '</td><td class="text-right">R$ ' + dataLj.residual.toFixed(2) + '</td></tr>';
    }
    html += '<tr class="bold" style="background-color:#f8fafc;"><td>TOTAL CONSOLIDADO</td><td class="text-center">' + sales.length + '</td><td class="text-right">R$ ' + grandTotal.toFixed(2) + '</td><td class="text-right">R$ ' + grandPago.toFixed(2) + '</td><td class="text-right">R$ ' + grandResidual.toFixed(2) + '</td></tr>';
    html += '</tbody></table></div>' +

      '<div class="section"><div class="section-title">CONSOLIDADO POR VENDEDOR</div>' +
      '<table><thead><tr><th>Vendedor</th><th class="text-center">Vendas</th><th class="text-right">Faturamento (R$)</th></tr></thead><tbody>';
    var vendsList = Object.keys(summaryVendedor);
    for (var i = 0; i < vendsList.length; i++) {
      var v = vendsList[i];
      var dataV = summaryVendedor[v];
      html += '<tr><td><strong>' + v + '</strong></td><td class="text-center">' + dataV.count + '</td><td class="text-right">R$ ' + dataV.total.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">RESUMO POR FORMA DE PAGAMENTO</div>' +
      '<table><thead><tr><th>Forma de Pagamento</th><th class="text-center">Operações</th><th class="text-right">Faturamento (R$)</th></tr></thead><tbody>';

    var formas = Object.keys(summaryFormaPag);
    for (var i = 0; i < formas.length; i++) {
      var fp = formas[i];
      var dataFp = summaryFormaPag[fp];
      html += '<tr><td><strong>' + fp + '</strong></td><td class="text-center">' + dataFp.count + '</td><td class="text-right">R$ ' + dataFp.total.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">DETALHE DAS TRANSAÇÕES (OS)</div>' +
      '<table><thead><tr><th>OS</th><th>Cliente</th><th>Loja</th><th>Vendedor</th><th>Forma Pag.</th><th class="text-right">Total</th><th class="text-right">Pago</th><th class="text-right">Residual</th></tr></thead><tbody>';

    for (var i = 0; i < sales.length; i++) {
      var s = sales[i];
      html += '<tr><td><strong>' + s.os + '</strong></td><td>' + s.cliente + '</td><td>' + s.loja + '</td><td>' + (s.vendedor || '') + '</td><td>' + s.formaPag + '</td><td class="text-right">R$ ' + s.total.toFixed(2) + '</td><td class="text-right">R$ ' + s.pago.toFixed(2) + '</td><td class="text-right">R$ ' + s.residual.toFixed(2) + '</td></tr>';
    }
    html += '</tbody></table></div>' +
      
      '<div style="text-align:center; font-size:10px; color:#999; margin-top:30px;">Gerado automaticamente por Óticas Gestão Integrada</div>' +
      '</body></html>';

    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    var username = getUserUsername(loggedUser);
    await logAction(username || "admin", "Gerou resumo de vendas PDF do dia: " + displayDate);
    
    return { success: true, url: downloadUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================================
// FUNÇÕES DE COMPATIBILIDADE DE ROTAS E MÉTODOS ADICIONAIS
// ==========================================================

async function saveVenda(record, loggedUserUsername) {
  return addVenda(record, loggedUserUsername);
}

async function saveLancamento(record, loggedUserUsername) {
  return addConferencia(record, loggedUserUsername);
}

async function deleteVenda(os, loggedUserUsername) {
  return deleteVendas([os], loggedUserUsername);
}

async function deleteVendasBulk(osList, loggedUserUsername) {
  return deleteVendas(osList, loggedUserUsername);
}

async function deleteLancamento(os, dataStr, loggedUserUsername) {
  return deleteConferencia(os, dataStr, loggedUserUsername);
}

async function deleteLancamentosBulk(items, loggedUserUsername) {
  return deleteConferenciaGroup(items, loggedUserUsername);
}

async function saveConfigParam(key, val, loggedUserUsername) {
  // Relax validation for specific operation keys, otherwise require 'configuracoes'
  if (key === 'assistencias' || key === 'visitas') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConf = await validateUserSession(loggedUserUsername, 'conferencia');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
    var isAssistencia = await validateUserSession(loggedUserUsername, 'assistencia');
    if (!isVenda && !isConf && !isConfig && !isVisita && !isAssistencia) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isVenda && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'medicos' || key === 'clinicas') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
    if (!isVenda && !isConfig && !isVisita) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  // Normalização e limpeza da chave motivosPerda / motivos_perda
  if (key === 'motivosPerda' || key === 'motivos_perda') {
    try {
      await supabaseFetch("/config_settings?key=eq.motivos_perda", { method: "DELETE" });
    } catch (e) {}
    key = 'motivosPerda';
  }

  // Normalização e limpeza da chave motivosOcorrencia / motivos_ocorrencia
  if (key === 'motivosOcorrencia' || key === 'motivos_ocorrencia') {
    try {
      await supabaseFetch("/config_settings?key=eq.motivos_ocorrencia", { method: "DELETE" });
    } catch (e) {}
    key = 'motivosOcorrencia';
  }

  try {
    var queryKey = key;
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    if (exists.length > 0) {
      await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
        method: "PATCH",
        payload: JSON.stringify({ value: val })
      });
    } else {
      await supabaseFetch("/config_settings", {
        method: "POST",
        payload: JSON.stringify({ key: queryKey, value: val })
      });
    }
    var logVal = typeof val === 'string' ? val : JSON.stringify(val);
    if (logVal.length > 150) {
      logVal = logVal.substring(0, 150) + "... (dados compactados)";
    }
    await logAction(loggedUserUsername, "Alterou parâmetro " + queryKey + " para " + logVal);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

function normalizeCrm(val) {
  if (!val) return "";
  return val.toString().replace(/[^a-zA-Z0-9]/g, "").toLowerCase().trim();
}

async function addMedico(med, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'venda') && !await validateUserSession(loggedUserUsername, 'visitaMedica')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
    var medicos = [];
    if (medicosRaw.length > 0) {
      try { medicos = JSON.parse(medicosRaw[0].value); } catch(e) {}
    }
    
    for (var i = 0; i < medicos.length; i++) {
      if (normalizeCrm(medicos[i].crm) === normalizeCrm(med.crm)) {
        return { success: false, error: 'Médico com este CRM já cadastrado.' };
      }
    }
    
    medicos.push(med);
    
    await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    
    await logAction(loggedUserUsername, "Cadastrou médico: " + med.nome + " CRM: " + med.crm);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function addClinica(clin, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'venda') && !await validateUserSession(loggedUserUsername, 'visitaMedica')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
    var clinicas = [];
    if (clinicasRaw.length > 0) {
      try { clinicas = JSON.parse(clinicasRaw[0].value); } catch(e) {}
    }
    
    for (var i = 0; i < clinicas.length; i++) {
      if (clinicas[i].nome.toLowerCase().trim() === clin.nome.toLowerCase().trim()) {
        return { success: false, error: 'Clínica com este nome já cadastrada.' };
      }
    }
    
    clinicas.push(clin);
    
    await saveConfigParam('clinicas', JSON.stringify(clinicas), loggedUserUsername);
    
    await logAction(loggedUserUsername, "Cadastrou clínica: " + clin.nome);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function addVisitaMedica(visitaData, loggedUserUsername) {
  if (typeof loggedUserUsername === 'object' && loggedUserUsername) {
    loggedUserUsername = loggedUserUsername.username;
  }
  var isVenda = await validateUserSession(loggedUserUsername, 'venda');
  var isConf = await validateUserSession(loggedUserUsername, 'conferencia');
  var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
  var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
  var isAssistencia = await validateUserSession(loggedUserUsername, 'assistencia');
  if (!isVenda && !isConf && !isConfig && !isVisita && !isAssistencia) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  if (!visitaData) {
    return { success: false, error: "Dados da visita não informados." };
  }

  try {
    var id = visitaData.id || crypto.randomUUID();
    var row = {
      id: id,
      data: visitaData.data || new Date().toISOString().split('T')[0],
      hora: visitaData.hora || '12:00',
      representante: visitaData.representante || 'Geral',
      medico_nome: visitaData.medicoNome || visitaData.medico_nome || 'Desconhecido',
      medico_crm: visitaData.medicoCrm || visitaData.medico_crm || '',
      assunto: visitaData.assunto || 'Visita',
      status: visitaData.status || 'EFETIVADA',
      relato: visitaData.relato || '',
      lat: (visitaData.lat !== null && visitaData.lat !== undefined && !isNaN(visitaData.lat)) ? Number(visitaData.lat) : null,
      lng: (visitaData.lng !== null && visitaData.lng !== undefined && !isNaN(visitaData.lng)) ? Number(visitaData.lng) : null
    };

    await supabaseFetch("/visitas_medicas", {
      method: "POST",
      payload: JSON.stringify(row)
    });

    await logAction(loggedUserUsername, "Registrou visita médica: " + row.medico_nome + " (" + row.representante + ")");

    var isClin = row.medico_crm === 'CLINICA' || 
      (row.medico_nome && (row.medico_nome.toLowerCase().includes('clínica') || row.medico_nome.toLowerCase().includes('clinica')));
    var formattedRecord = {
      id: row.id,
      data: row.data,
      hora: row.hora,
      representante: row.representante,
      medicoNome: row.medico_nome,
      medicoCrm: row.medico_crm,
      medico_nome: row.medico_nome,
      medico_crm: row.medico_crm,
      tipo: isClin ? 'Clinica' : 'Medico',
      clinicaNome: isClin ? row.medico_nome : '',
      assunto: row.assunto,
      status: row.status,
      relato: row.relato,
      lat: row.lat,
      lng: row.lng
    };

    return { success: true, data: formattedRecord, record: formattedRecord };
  } catch (err) {
    console.error("Erro ao registrar visita médica em public.visitas_medicas:", err);
    return { success: false, error: err.toString() };
  }
}

async function deleteVisitaMedica(visitaId, loggedUserUsername) {
  if (typeof loggedUserUsername === 'object' && loggedUserUsername) {
    loggedUserUsername = loggedUserUsername.username;
  }
  var isVenda = await validateUserSession(loggedUserUsername, 'venda');
  var isConf = await validateUserSession(loggedUserUsername, 'conferencia');
  var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
  var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
  var isAssistencia = await validateUserSession(loggedUserUsername, 'assistencia');
  if (!isVenda && !isConf && !isConfig && !isVisita && !isAssistencia) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }

  if (!visitaId) {
    return { success: false, error: "ID da visita não informado." };
  }

  try {
    await supabaseFetch("/visitas_medicas?id=eq." + encodeURIComponent(visitaId), {
      method: "DELETE"
    });

    await logAction(loggedUserUsername, "Removeu registro de visita médica ID: " + visitaId);
    return { success: true, deletedId: visitaId };
  } catch (err) {
    console.error("Erro ao excluir visita médica:", err);
    return { success: false, error: err.toString() };
  }
}

async function addConfigRecord(key, record, loggedUserUsername) {
  if (key === 'visitas') {
    return await addVisitaMedica(record, loggedUserUsername);
  }
  if (key === 'assistencias') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConf = await validateUserSession(loggedUserUsername, 'conferencia');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
    var isAssistencia = await validateUserSession(loggedUserUsername, 'assistencia');
    if (!isVenda && !isConf && !isConfig && !isVisita && !isAssistencia) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isVenda && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  try {
    var queryKey = key;
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    var currentArray = [];
    if (exists.length > 0) {
      try { currentArray = JSON.parse(exists[0].value) || []; } catch(e) {}
    }

    currentArray.unshift(record);
    var val = JSON.stringify(currentArray);

    if (exists.length > 0) {
      await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
        method: "PATCH",
        payload: JSON.stringify({ value: val })
      });
    } else {
      await supabaseFetch("/config_settings", {
        method: "POST",
        payload: JSON.stringify({ key: queryKey, value: val })
      });
    }

    await logAction(loggedUserUsername, "Adicionou registro no parâmetro " + queryKey);
    return { success: true, data: currentArray };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function deleteConfigRecord(key, recordId, loggedUserUsername) {
  if (key === 'visitas') {
    return await deleteVisitaMedica(recordId, loggedUserUsername);
  }
  if (key === 'assistencias') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConf = await validateUserSession(loggedUserUsername, 'conferencia');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    var isVisita = await validateUserSession(loggedUserUsername, 'visitaMedica');
    var isAssistencia = await validateUserSession(loggedUserUsername, 'assistencia');
    if (!isVenda && !isConf && !isConfig && !isVisita && !isAssistencia) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else if (key === 'orcamentos') {
    var isVenda = await validateUserSession(loggedUserUsername, 'venda');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isVenda && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  } else {
    if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
  }

  try {
    var queryKey = key;
    var exists = await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey));
    var currentArray = [];
    if (exists.length > 0) {
      try { currentArray = JSON.parse(exists[0].value) || []; } catch(e) {}
    } else {
      return { success: false, error: "Parâmetro não encontrado." };
    }

    var initialLength = currentArray.length;
    currentArray = currentArray.filter(function(v) {
      return v.id !== recordId;
    });

    if (currentArray.length === initialLength) {
      return { success: false, error: "Registro não encontrado para exclusão." };
    }

    var val = JSON.stringify(currentArray);
    await supabaseFetch("/config_settings?key=eq." + encodeURIComponent(queryKey), {
      method: "PATCH",
      payload: JSON.stringify({ value: val })
    });

    await logAction(loggedUserUsername, "Removeu registro no parâmetro " + queryKey + " ID: " + recordId);
    return { success: true, data: currentArray };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}


async function importBulkCadastros(dataObj, overwrite, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    // 1. Importar Lojas
    if (dataObj.lojas && dataObj.lojas.length > 0) {
      if (overwrite) {
        await supabaseFetch("/lojas?id=gt.0", { method: "DELETE" });
      }
      for (const lj of (dataObj.lojas || [])) {
        var name = typeof lj === 'string' ? lj : lj.nome;
        if (!name) continue;
        var exists = await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(name));
        if (exists.length === 0) {
          await supabaseFetch("/lojas", { method: "POST", payload: JSON.stringify({ nome: name }) });
        }
      }
    }

    // 2. Importar Laboratórios
    if (dataObj.laboratorios && dataObj.laboratorios.length > 0) {
      if (overwrite) {
        await supabaseFetch("/laboratorios?id=gt.0", { method: "DELETE" });
      }
      for (const lb of (dataObj.laboratorios || [])) {
        var name = typeof lb === 'string' ? lb : lb.nome;
        if (!name) continue;
        var exists = await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(name));
        if (exists.length === 0) {
          await supabaseFetch("/laboratorios", { method: "POST", payload: JSON.stringify({ nome: name }) });
        }
      }
    }

    // 3. Importar Produtos
    if (dataObj.produtos && dataObj.produtos.length > 0) {
      if (overwrite) {
        await supabaseFetch("/produtos?id=gt.0", { method: "DELETE" });
      }
      for (const p of (dataObj.produtos || [])) {
        var exists = await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(p.nome));
        if (exists.length === 0) {
          await supabaseFetch("/produtos", {
            method: "POST",
            payload: JSON.stringify({
              nome: p.nome,
              preco: Number(p.preco) || 0,
              laboratorio: p.laboratorio || '',
              tipo: p.tipo || ''
            })
          });
        }
      }
    }

    // 4. Importar Médicos (Salvo em config_settings)
    if (dataObj.medicos && dataObj.medicos.length > 0) {
      var medicos = [];
      if (!overwrite) {
        var medicosRaw = await supabaseFetch("/config_settings?key=eq.medicos");
        if (medicosRaw.length > 0) {
          try { medicos = JSON.parse(medicosRaw[0].value); } catch(e) {}
        }
      }
      dataObj.medicos.forEach(function(newMed) {
        var dup = false;
        for (var i = 0; i < medicos.length; i++) {
          if (medicos[i].crm === newMed.crm) { dup = true; break; }
        }
        if (!dup) {
          medicos.push(newMed);
        }
      });
      await saveConfigParam('medicos', JSON.stringify(medicos), loggedUserUsername);
    }

    // 5. Importar Clínicas (Salvo em config_settings)
    if (dataObj.clinicas && dataObj.clinicas.length > 0) {
      var clinicas = [];
      if (!overwrite) {
        var clinicasRaw = await supabaseFetch("/config_settings?key=eq.clinicas");
        if (clinicasRaw.length > 0) {
          try { clinicas = JSON.parse(clinicasRaw[0].value); } catch(e) {}
        }
      }
      dataObj.clinicas.forEach(function(newClin) {
        var dup = false;
        for (var i = 0; i < clinicas.length; i++) {
          if (clinicas[i].nome.toLowerCase().trim() === newClin.nome.toLowerCase().trim()) { dup = true; break; }
        }
        if (!dup) {
          clinicas.push({
            nome: newClin.nome,
            representante: newClin.representante || ''
          });
        }
      });
      await saveConfigParam('clinicas', JSON.stringify(clinicas), loggedUserUsername);
    }

    await logAction(loggedUserUsername, "Efetuou importação em lote de cadastros");
    return { success: true };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

async function generateSalePDF(os, loggedUser) {
  if (!await validateUserSession(loggedUser, 'logVendas')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var salesRaw = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(os));
    if (salesRaw.length === 0) {
      throw new Error("Venda não encontrada com a OS: " + os);
    }
    
    var v = salesRaw[0];
    var details = v.detalhes || {};
    var displayDate = ymdToDmy(v.data);
    
    var logoHtml = "";
    var configsList = await supabaseFetch("/config_settings?key=eq.logoUrl");
    if (configsList.length > 0 && configsList[0].value) {
      logoHtml = '<div style="text-align:center; margin-bottom:15px;"><img src="' + configsList[0].value + '" style="max-height:50px;"></div>';
    }
    
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comprovante de Venda OS ' + os + '</title>' +
      '<style>' +
      'body { font-family: sans-serif; color: #333; padding: 20px; line-height: 1.4; font-size: 12px; }' +
      '.header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; margin-bottom: 20px; }' +
      '.title { font-size: 20px; font-weight: bold; color: #3b82f6; }' +
      '.section { margin-bottom: 15px; border: 1px solid #ddd; border-radius: 6px; padding: 10px; }' +
      '.section-title { font-weight: bold; color: #1e293b; border-bottom: 1px solid #eee; padding-bottom: 3px; margin-bottom: 6px; font-size: 13px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 5px; }' +
      'th, td { border: 1px solid #ddd; padding: 5px; text-align: left; }' +
      'th { background-color: #f1f5f9; }' +
      '.text-right { text-align: right; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      logoHtml +
      '<div class="header"><div class="title">RECIBO DE VENDA</div><div>OS: ' + os + (details.nfce ? ' | NFC-e: ' + details.nfce : '') + ' | Data: ' + displayDate + '</div></div>' +
      
      '<div class="section"><div class="section-title">DADOS DO CLIENTE</div>' +
      '<table>' +
      '<tr><td class="bold" style="width:25%;">Nome:</td><td>' + (v.cliente_nome || '') + '</td></tr>' +
      '<tr><td class="bold">CPF:</td><td>' + (details.Cliente_CPF || '') + '</td></tr>' +
      '<tr><td class="bold">WhatsApp:</td><td>' + (details.Cliente_WhatsApp || '') + '</td></tr>' +
      '</table></div>' +
      
      '<div class="section"><div class="section-title">DETALHES DA COMPRA</div>' +
      '<table><thead><tr><th>Item / Lente</th><th class="text-right">Valor (R$)</th></tr></thead><tbody>';
      
    var totalItens = 0;
    if (details.Aro1_Lente) {
      var precoLente = Number(details.Aro1_PrecoLente) || 0;
      html += '<tr><td>Lente: ' + details.Aro1_Lente + '</td><td class="text-right">R$ ' + precoLente.toFixed(2) + '</td></tr>';
      totalItens += precoLente;
    }
    if (details.Aro1_Tratamento) {
      var precoTrat = Number(details.Aro1_PrecoTratamento) || 0;
      html += '<tr><td>Tratamento: ' + details.Aro1_Tratamento + '</td><td class="text-right">R$ ' + precoTrat.toFixed(2) + '</td></tr>';
      totalItens += precoTrat;
    }
    if (details.Aro1_Modelo) {
      var precoAro = Number(details.Aro1_PrecoAro) || 0;
      html += '<tr><td>Armação: ' + details.Aro1_Modelo + ' (' + (details.Aro1_Codigo || '') + ')</td><td class="text-right">R$ ' + precoAro.toFixed(2) + '</td></tr>';
      totalItens += precoAro;
    }
    
    if (details.Aro2_Ativo === 'SIM') {
      if (details.Aro2_Lente) {
        var pL2 = Number(details.Aro2_PrecoLente) || 0;
        html += '<tr><td>Lente 2: ' + details.Aro2_Lente + '</td><td class="text-right">R$ ' + pL2.toFixed(2) + '</td></tr>';
        totalItens += pL2;
      }
      if (details.Aro2_Tratamento) {
        var pT2 = Number(details.Aro2_PrecoTratamento) || 0;
        html += '<tr><td>Tratamento 2: ' + details.Aro2_Tratamento + '</td><td class="text-right">R$ ' + pT2.toFixed(2) + '</td></tr>';
        totalItens += pT2;
      }
      if (details.Aro2_Modelo) {
        var pA2 = Number(details.Aro2_PrecoAro) || 0;
        html += '<tr><td>Armação 2: ' + details.Aro2_Modelo + ' (' + (details.Aro2_Codigo || '') + ')</td><td class="text-right">R$ ' + pA2.toFixed(2) + '</td></tr>';
        totalItens += pA2;
      }
    }
    
    html += '<tr class="bold" style="background-color:#f1f5f9;"><td>TOTAL DA VENDA</td><td class="text-right">R$ ' + Number(v.total_venda).toFixed(2) + '</td></tr>';
    html += '</tbody></table></div>' +
      
      '<div class="section"><div class="section-title">DIOPTRIAS / RECEITA (Aro 1)</div>' +
      '<table>' +
      '<thead><tr><th>Olho</th><th>Esférico</th><th>Cilíndrico</th><th>Eixo</th><th>Altura</th><th>DNP</th></tr></thead>' +
      '<tbody>' +
      '<tr><td class="bold">OD</td><td>' + (details.Aro1_OD_Esf || '0.00') + '</td><td>' + (details.Aro1_OD_Cil || '0.00') + '</td><td>' + (details.Aro1_OD_Eixo || '0') + '</td><td>' + (details.Aro1_OD_Alt || '') + '</td><td>' + (details.Aro1_OD_DNP || '') + '</td></tr>' +
      '<tr><td class="bold">OE</td><td>' + (details.Aro1_OE_Esf || '0.00') + '</td><td>' + (details.Aro1_OE_Cil || '0.00') + '</td><td>' + (details.Aro1_OE_Eixo || '0') + '</td><td>' + (details.Aro1_OE_Alt || '') + '</td><td>' + (details.Aro1_OE_DNP || '') + '</td></tr>' +
      '</tbody></table>' +
      (details.Aro1_Adicao ? '<div style="margin-top:5px;"><strong>Adição:</strong> ' + details.Aro1_Adicao + '</div>' : '') +
      '</div>';
      
    var fpDisplay = details.Forma_Pagamento_1 || details.Forma_Pagamento || "";
    var parts = [];
    if (Number(details.Valor_Pagamento_1) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_1 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_1 || 1) + 'x, Auto: ' + (details.Auto_1 || '-') + ')';
      }
      parts.push((details.Forma_Pagamento_1 || details.Forma_Pagamento) + ': R$ ' + Number(details.Valor_Pagamento_1).toFixed(2) + cardDetail);
    } else {
      // Fallback for older sales
      parts.push(fpDisplay + ': R$ ' + (Number(details.Valor_Pago) || Number(v.total_venda) || 0).toFixed(2));
    }
    if (details.Forma_Pagamento_2 && details.Forma_Pagamento_2 !== 'Nenhum' && Number(details.Valor_Pagamento_2) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_2 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_2 || 1) + 'x, Auto: ' + (details.Auto_2 || '-') + ')';
      }
      parts.push(details.Forma_Pagamento_2 + ': R$ ' + Number(details.Valor_Pagamento_2).toFixed(2) + cardDetail);
    }
    if (details.Forma_Pagamento_3 && details.Forma_Pagamento_3 !== 'Nenhum' && Number(details.Valor_Pagamento_3) > 0) {
      var cardDetail = "";
      if (details.Forma_Pagamento_3 === 'Cartão de Crédito') {
        cardDetail = ' (' + (details.Parcelas_3 || 1) + 'x, Auto: ' + (details.Auto_3 || '-') + ')';
      }
      parts.push(details.Forma_Pagamento_3 + ': R$ ' + Number(details.Valor_Pagamento_3).toFixed(2) + cardDetail);
    }
    var fpText = parts.length > 0 ? parts.join('<br>') : fpDisplay;

    var financeiroHtml = '<div class="section"><div class="section-title">FINANCEIRO</div>' +
      '<table>' +
      '<tr><td class="bold" style="width:25%;">Forma de Pagamento:</td><td>' + fpText + ' (' + (details.Tipo_Pagamento || details.tipoPagamento || 'Integral') + ')</td></tr>' +
      '<tr><td class="bold">Valor Pago (Sinal):</td><td>R$ ' + (Number(details.Valor_Pago) || (Number(details.Valor_Pagamento_1 || 0) + Number(details.Valor_Pagamento_2 || 0) + Number(details.Valor_Pagamento_3 || 0)) || 0).toFixed(2) + '</td></tr>' +
      '<tr><td class="bold">Valor Residual (A Pagar):</td><td>R$ ' + (Number(details.Valor_Residual) || 0).toFixed(2) + '</td></tr>' +
      '</table></div>';

    html += financeiroHtml;
      
      '<div style="text-align:center; font-size:10px; color:#999; margin-top:30px;">Comprovante emitido eletronicamente</div>' +
      '</body></html>';
      
    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    var username = getUserUsername(loggedUser);
    await logAction(username || "admin", "Gerou PDF da OS: " + os);
    
    return { success: true, url: downloadUrl };
  } catch(e) {
    return { success: false, error: e.toString() };
  }
}

async function addRepresentante(name, loggedUserUsername) {
  return saveRepresentante(name, loggedUserUsername);
}

async function generateTableReportPDF(title, headers, rows, isLandscape, loggedUserUsername) {
  if (loggedUserUsername && !await validateUserSession(loggedUserUsername)) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var sizeRule = isLandscape ? "A4 landscape" : "A4 portrait";
    var username = getUserUsername(loggedUserUsername) || loggedUserUsername || 'sistema';
    var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
      '<style>' +
      '@page { size: ' + sizeRule + '; margin: 8mm; }' +
      'body { font-family: sans-serif; color: #1e293b; font-size: 8px; margin: 0; padding: 0; }' +
      '.header { text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; margin-bottom: 12px; }' +
      '.title { font-size: 13px; font-weight: bold; color: #3b82f6; text-transform: uppercase; }' +
      '.meta { font-size: 8px; color: #64748b; margin-top: 2px; }' +
      'table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 8px; table-layout: auto; }' +
      'th, td { border: 1px solid #cbd5e1; padding: 4px 6px; text-align: left; white-space: nowrap; text-overflow: ellipsis; overflow: hidden; }' +
      'th { background-color: #f1f5f9; font-weight: bold; text-transform: uppercase; color: #334155; }' +
      'tr:nth-child(even) { background-color: #f8fafc; }' +
      '.text-right { text-align: right; }' +
      '.text-center { text-align: center; }' +
      '.bold { font-weight: bold; }' +
      '</style></head><body>' +
      '<div class="header">' +
        '<div class="title">' + title + '</div>' +
        '<div class="meta">Gerado em: ' + formatDateSP(new Date()) + ' | Solicitado por: ' + username + '</div>' +
      '</div>' +
      '<table><thead><tr>';
      
    for (var i = 0; i < headers.length; i++) {
      html += '<th>' + headers[i] + '</th>';
    }
    
    html += '</tr></thead><tbody>';
    
    for (var r = 0; r < rows.length; r++) {
      html += '<tr>';
      var row = rows[r];
      for (var c = 0; c < row.length; c++) {
        var val = row[c] === null || row[c] === undefined ? "" : row[c];
        html += '<td>' + val + '</td>';
      }
      html += '</tr>';
    }
    
    html += '</tbody></table>' +
      '<div style="text-align:center; font-size:7px; color:#94a3b8; margin-top:15px;">Óticas Gestão Integrada - Relatório PDF Automático</div>' +
      '</body></html>';

    var printableHtml = html.includes('window.print()') ? html : html.replace('</body>', '<script>window.onload=function(){setTimeout(function(){window.print();},500);};<\/script></body>');
    var downloadUrl = "data:text/html;charset=utf-8," + encodeURIComponent(printableHtml);
    
    await logAction(username, "Gerou relatório PDF: " + title);
    
    return { success: true, url: downloadUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function reverseGeocode(lat, lon) {
  try {
    var response = Maps.newGeocoder().reverseGeocode(lat, lon);
    if (response.status === 'OK' && response.results.length > 0) {
      var result = response.results[0];
      var bairro = "";
      var cidade = "";
      for (var i = 0; i < result.address_components.length; i++) {
        var comp = result.address_components[i];
        if (comp.types.indexOf('sublocality_level_1') !== -1 || comp.types.indexOf('neighborhood') !== -1) {
          bairro = comp.long_name;
        }
        if (comp.types.indexOf('locality') !== -1) {
          cidade = comp.long_name;
        }
      }
      return { success: true, bairro: bairro, cidade: cidade };
    }
  } catch (e) {
    return { success: false, error: e.toString() };
  }
  return { success: false, error: "Localização não encontrada" };
}

async function editLoja(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/lojas?nome=eq." + encodeURIComponent(oldName), {
      method: "PATCH",
      payload: JSON.stringify({ nome: newName })
    });
    await logAction(loggedUserUsername, "Editou loja: " + oldName + " para: " + newName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function editLab(oldName, newName, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/laboratorios?nome=eq." + encodeURIComponent(oldName), {
      method: "PATCH",
      payload: JSON.stringify({ nome: newName })
    });
    await logAction(loggedUserUsername, "Editou laboratório: " + oldName + " para: " + newName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function editProduto(oldNome, record, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'configuracoes')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/produtos?nome=eq." + encodeURIComponent(oldNome), {
      method: "PATCH",
      payload: JSON.stringify({
        nome: record.nome,
        preco: Number(record.preco) || 0,
        laboratorio: record.laboratorio,
        tipo: record.tipo
      })
    });
    await logAction(loggedUserUsername, "Editou produto: " + oldNome + " para: " + record.nome);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveCampaign(camp, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var dateInicio = camp.data_inicio;
    var dateFim = camp.data_fim;
    if (dateInicio && dateInicio.indexOf('/') !== -1) dateInicio = dmyToYmd(dateInicio);
    if (dateFim && dateFim.indexOf('/') !== -1) dateFim = dmyToYmd(dateFim);

    var payload = {
      nome: camp.nome,
      status: camp.status || 'Ativa',
      data_inicio: dateInicio,
      data_fim: dateFim,
      lojas: camp.loja || camp.lojas || 'Todas',
      aro: camp.aro || '',
      lente: camp.lente || '',
      preco_alvo: camp.preco_alvo ? Number(camp.preco_alvo) : 0
    };

    if (camp.id) {
      await supabaseFetch("/campanhas?id=eq." + camp.id, {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou campanha ID " + camp.id + ": " + camp.nome);
    } else {
      await supabaseFetch("/campanhas", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou nova campanha: " + camp.nome);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteCampaign(campId, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/campanhas?id=eq." + campId, {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu campanha ID: " + campId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveLead(lead, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle') && !await validateUserSession(loggedUserUsername, 'leadKanban')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var diaHorario = lead.dia_horario || (lead.data_visita + 'T' + (lead.hora_visita || '00:00') + ':00');
    var detailsObj = typeof lead.detalhes === 'object' ? lead.detalhes : {};
    if (lead.obs) detailsObj.obs = lead.obs;

    var payload = {
      nome: lead.nome,
      telefone: lead.whatsapp || lead.telefone,
      loja_destino: lead.loja || lead.loja_destino,
      dia_horario: diaHorario,
      campanha_id: lead.campanha_id ? Number(lead.campanha_id) : null,
      status: lead.status || 'entrante',
      vendedor: lead.vendedor || null,
      produtos_vendidos: lead.produtos_vendidos || null,
      valor_vendido: lead.valor_vendido ? Number(lead.valor_vendido) : 0,
      forma_pagamento: lead.forma_pagamento || null,
      motivo_perda: lead.motivo_perda || null,
      venda_os: lead.venda_os || null,
      detalhes: JSON.stringify(detailsObj)
    };

    if (lead.id) {
      await supabaseFetch("/leads?id=eq." + lead.id, {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou lead ID " + lead.id + ": " + lead.nome);
    } else {
      await supabaseFetch("/leads", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou novo lead: " + lead.nome);
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteLead(leadId, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadControle')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    await supabaseFetch("/leads?id=eq." + leadId, {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu lead ID: " + leadId);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function updateLeadStatus(leadId, status, conversionData, loggedUserUsername) {
  if (!await validateUserSession(loggedUserUsername, 'leadKanban') && !await validateUserSession(loggedUserUsername, 'leadControle') && !await validateUserSession(loggedUserUsername, 'venda')) {
    return { success: false, error: 'SESSION_EXPIRED' };
  }
  try {
    var payload = {
      status: status,
      atualizado_em: new Date().toISOString()
    };
    if (conversionData) {
      if (conversionData.vendedor) payload.vendedor = conversionData.vendedor;
      if (conversionData.produtos_vendidos) payload.produtos_vendidos = conversionData.produtos_vendidos;
      if (conversionData.valor_vendido) payload.valor_vendido = Number(conversionData.valor_vendido);
      if (conversionData.forma_pagamento) payload.forma_pagamento = conversionData.forma_pagamento;
      if (conversionData.motivo_perda) payload.motivo_perda = conversionData.motivo_perda;
      if (conversionData.venda_os) payload.venda_os = conversionData.venda_os;
      if (conversionData.detalhes) {
        payload.detalhes = typeof conversionData.detalhes === 'object' ? JSON.stringify(conversionData.detalhes) : conversionData.detalhes;
      }
    }

    await supabaseFetch("/leads?id=eq." + leadId, {
      method: "PATCH",
      payload: JSON.stringify(payload)
    });
    
    await logAction(loggedUserUsername, "Alterou status do lead ID " + leadId + " para: " + status);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveOcorrencia(record, loggedUserUsername) {
  try {
    var isOco = await validateUserSession(loggedUserUsername, 'ocorrencias');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isOco && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    var id = record.id;
    
    var payload = {
      os: record.os || "",
      loja: record.loja || "",
      vendedor: record.vendedor || "",
      cliente_nome: record.clienteNome !== undefined ? record.clienteNome : (record.cliente_nome || ""),
      data: dmyToYmd(record.data),
      motivo: record.motivo || "",
      custo_adicional: Number(record.custoAdicional) || 0.00,
      detalhes: typeof record.detalhes === 'object' ? JSON.stringify(record.detalhes) : (record.detalhes || "{}")
    };
    
    if (id) {
      // Editar ocorrência existente
      await supabaseFetch("/ocorrencias?id=eq." + id, {
        method: "PATCH",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Atualizou ocorrência ID: " + id + " (OS: " + record.os + ")");
    } else {
      // Criar nova ocorrência
      await supabaseFetch("/ocorrencias", {
        method: "POST",
        payload: JSON.stringify(payload)
      });
      await logAction(loggedUserUsername, "Cadastrou nova ocorrência OS: " + record.os);
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteOcorrencia(id, loggedUserUsername) {
  try {
    var isOco = await validateUserSession(loggedUserUsername, 'ocorrencias');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isOco && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    await supabaseFetch("/ocorrencias?id=eq." + id, {
      method: "DELETE"
    });
    await logAction(loggedUserUsername, "Excluiu ocorrência ID: " + id);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteOcorrenciasBulk(ids, loggedUserUsername) {
  try {
    var isOco = await validateUserSession(loggedUserUsername, 'ocorrencias');
    var isConfig = await validateUserSession(loggedUserUsername, 'configuracoes');
    if (!isOco && !isConfig) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return { success: true };
    }
    
    var idsStr = ids.join(",");
    await supabaseFetch("/ocorrencias?id=in.(" + idsStr + ")", {
      method: "DELETE"
    });
    
    await logAction(loggedUserUsername, "Excluiu ocorrências em lote IDs: " + idsStr);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

/**
 * Processa requisições de Webhook originadas pelo TikTok Ads.
 */
async function handleTikTokWebhook(e) {
  try {
    var rawContents = e.postData.contents;
    if (!rawContents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Nenhum conteúdo recebido" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    var payload = JSON.parse(rawContents);
    
    // Log do payload bruto na tabela de auditoria para auditoria e mapeamento
    await logAction("webhook_tiktok", "Payload bruto recebido: " + rawContents);
    
    // 1. Resposta de Handshake / Verificação (TikTok Ads exige isso para validar a URL do Webhook)
    if (payload.event === "handshake" || payload.challenge) {
      var challengeVal = payload.challenge || "";
      return ContentService.createTextOutput(JSON.stringify({ challenge: challengeVal }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 2. Extração de informações de Lead (Nome, Telefone, Email)
    var name = "";
    var phone = "";
    var email = "";
    
    // Varre a estrutura 'lead_details' caso enviada no formato padrão array
    if (payload.lead_details && Array.isArray(payload.lead_details)) {
      payload.lead_details.forEach(function(item) {
        var key = (item.field_key || item.field_name || "").toLowerCase().trim();
        var val = (item.field_value || "").toString().trim();
        if (!val) return;
        
        if (key.indexOf("name") !== -1 || key.indexOf("nome") !== -1) {
          name = val;
        } else if (key.indexOf("phone") !== -1 || key.indexOf("tel") !== -1 || key.indexOf("whatsapp") !== -1 || key.indexOf("celular") !== -1) {
          phone = val;
        } else if (key.indexOf("email") !== -1 || key.indexOf("mail") !== -1) {
          email = val;
        }
      });
    }
    
    // Varredura recursiva de fallback caso o payload utilize outra estrutura aninhada
    if (!name || !phone) {
      var traverse = function(obj) {
        for (var k in obj) {
          if (obj.hasOwnProperty(k)) {
            var keyLower = k.toLowerCase();
            var val = obj[k];
            if (typeof val === 'string' || typeof val === 'number') {
              var valStr = val.toString().trim();
              if (!name && (keyLower.indexOf("name") !== -1 || keyLower.indexOf("nome") !== -1)) {
                name = valStr;
              }
              if (!phone && (keyLower.indexOf("phone") !== -1 || keyLower.indexOf("tel") !== -1 || keyLower.indexOf("whatsapp") !== -1 || keyLower.indexOf("celular") !== -1)) {
                phone = valStr;
              }
              if (!email && (keyLower.indexOf("email") !== -1 || keyLower.indexOf("mail") !== -1)) {
                email = valStr;
              }
            } else if (val && typeof val === 'object') {
              traverse(val);
            }
          }
        }
      };
      traverse(payload);
    }
    
    // 3. Cadastra o Lead como "Lead Entrante" no Supabase
    var leadData = {
      nome: name || "Lead TikTok",
      telefone: phone || "",
      loja_destino: "", // Fica vazio para ser atribuído no Kanban/Controle de Leads
      dia_horario: new Date().toISOString(),
      campanha_id: null,
      status: "entrante",
      vendedor: "",
      produtos_vendidos: "",
      valor_vendido: 0,
      forma_pagamento: "",
      motivo_perda: "",
      venda_os: "",
      detalhes: JSON.stringify({
        origem: "TikTok Ads",
        email: email,
        tiktok_campaign_id: payload.campaign_id || payload.campaign_name || "",
        tiktok_ad_id: payload.ad_id || "",
        tiktok_form_id: payload.form_id || "",
        tiktok_lead_id: payload.lead_id || "",
        raw_payload: payload
      })
    };
    
    await supabaseFetch("/leads", {
      method: "POST",
      payload: JSON.stringify(leadData)
    });
    
    await logAction("webhook_tiktok", "Lead TikTok inserido com sucesso: " + (name || "Sem Nome") + " (" + (phone || "Sem Tel") + ")");
    
    return ContentService.createTextOutput(JSON.stringify({ success: true, message: "Lead cadastrado com sucesso" }))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    await logAction("webhook_tiktok_error", "Erro ao processar lead TikTok: " + err.toString());
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

async function buscarDadosOS(os) {
  if (!os) return { success: false, error: "OS não informada." };
  try {
    var osClean = os.toString().trim();
    
    // Busca em conferências (tentativa exata, depois ilike)
    var confs = await supabaseFetch("/conferencias?os=eq." + encodeURIComponent(osClean));
    if (!confs || confs.length === 0) {
      confs = await supabaseFetch("/conferencias?os=ilike." + encodeURIComponent(osClean));
    }
    if (!confs || confs.length === 0) {
      confs = await supabaseFetch("/conferencias?os=ilike." + encodeURIComponent("%" + osClean + "%"));
    }
    
    // Busca em vendas (tentativa exata, depois ilike)
    var vendas = await supabaseFetch("/vendas?os_venda=eq." + encodeURIComponent(osClean));
    if (!vendas || vendas.length === 0) {
      vendas = await supabaseFetch("/vendas?os_venda=ilike." + encodeURIComponent(osClean));
    }
    if (!vendas || vendas.length === 0) {
      vendas = await supabaseFetch("/vendas?os_venda=ilike." + encodeURIComponent("%" + osClean + "%"));
    }
    
    var conf = (confs && confs.length > 0) ? confs[0] : null;
    var venda = (vendas && vendas.length > 0) ? vendas[0] : null;
    
    if (!conf && !venda) {
      return { success: false, error: "OS não encontrada no histórico do banco de dados." };
    }
    
    var confObj = null;
    if (conf) {
      confObj = conf.detalhes || {};
      var dateStr = ymdToDmy(conf.data);
      confObj.Data = dateStr;
      confObj.data = dateStr;
      confObj.Loja = conf.loja;
      confObj.loja = conf.loja;
      confObj.OSLoja = conf.os;
      confObj.osLoja = conf.os;
      confObj.LabPedido = conf.laboratorio;
      confObj.labPedido = conf.laboratorio;
    }
    
    var vendaObj = null;
    if (venda) {
      vendaObj = venda.detalhes || {};
      vendaObj.osVenda = venda.os_venda;
      vendaObj.data = ymdToDmy(venda.data);
      vendaObj.loja = venda.loja;
      vendaObj.vendedor = venda.vendedor;
      vendaObj.clienteNome = venda.cliente_nome;
      vendaObj.totalVenda = Number(venda.total_venda);
    }
    
    return {
      success: true,
      conf: confObj,
      venda: vendaObj
    };
  } catch (err) {
    return { success: false, error: err.toString() };
  }
}

// ==========================================
// A.T.L.A.S. LENSAUDIT — RECURSOS DE CONFERÊNCIA & AUDITORIA AVANÇADA
// ==========================================

async function authenticateByPin(pin) {
  try {
    if (!pin) {
      return { success: false, error: "PIN não informado." };
    }
    const cleanPin = String(pin).trim();
    if (cleanPin.length !== 4) {
      return { success: false, error: "O PIN deve conter exatamente 4 dígitos numéricos." };
    }

    // 1. Busca mapa customizado de PINs em config_settings
    let userPins = {};
    try {
      const cfg = await supabaseFetch("/config_settings?key=eq.user_pins");
      if (cfg && cfg.length > 0 && cfg[0].value) {
        userPins = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      }
    } catch (e) {
      console.warn("Falha ao ler user_pins de config_settings:", e);
    }

    // PINs de fábrica de alta confiabilidade
    const defaultPins = {
      "1234": "Tati - Lab",     // Conferente Lab Central (Tatiane CasaGrande)
      "5678": "Mario",          // Auditor / Gerente
      "9999": "admin",          // Administrador Master
      "1804": "admin",          // Admin alternativo
      "2026": "Thelma",         // Auditoria Fiscal
      "1111": "MN Barao",       // Loja Barão
      "2222": "CESAR",          // Loja Cesar
      "3333": "Demetrius",
      "4444": "Monica",
      "5555": "Andreza",
      "6666": "Flavia",
      "7777": "Fabiano",
      "8888": "Paloma",
      "1611": "Silvia"
    };

    const targetUsername = userPins[cleanPin] || defaultPins[cleanPin];
    let matchedUser = null;

    if (targetUsername) {
      const users = await supabaseFetch("/usuarios?usuario=eq." + encodeURIComponent(targetUsername));
      if (users && users.length > 0) {
        matchedUser = users[0];
      }
    }

    // Fallback: se não estiver no mapa, confere se algum usuário tem a senha igual ao PIN ou iniciando com ele
    if (!matchedUser) {
      const allUsers = await supabaseFetch("/usuarios");
      if (Array.isArray(allUsers)) {
        matchedUser = allUsers.find(u => u.senha === cleanPin || (u.senha && u.senha.substring(0, 4) === cleanPin));
      }
    }

    if (!matchedUser) {
      return { success: false, error: "PIN incorreto ou usuário não cadastrado para este PIN." };
    }

    if (matchedUser.status !== 'ATIVO') {
      return { success: false, error: "Este usuário está inativo no sistema." };
    }

    await logAction(matchedUser.usuario, "Login efetuado via PIN Diamante (A.T.L.A.S. LensAudit)");

    const isFinancialAuditor = (matchedUser.auditoria === 'ATIVO' || matchedUser.configuracoes === 'ATIVO');
    const isConferenteOnly = (matchedUser.conferencia === 'ATIVO' && !isFinancialAuditor);

    const token = generateToken({
      username: matchedUser.usuario,
      nome: matchedUser.nome,
      loja: matchedUser.loja || 'Todos',
      scope: isFinancialAuditor ? 'admin' : (isConferenteOnly ? 'conferente' : 'loja'),
      role: isFinancialAuditor ? 'auditor' : (isConferenteOnly ? 'conferente' : 'loja')
    });

    const extra = parseExtraPermissions(matchedUser.medicos, matchedUser);

    return {
      success: true,
      token: token,
      user: {
        username: matchedUser.usuario,
        nome: matchedUser.nome,
        loja: matchedUser.loja || 'Todos',
        role: isFinancialAuditor ? 'auditor' : (isConferenteOnly ? 'conferente' : 'loja'),
        costBlind: isConferenteOnly,
        permissions: {
          conferencia: matchedUser.conferencia === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          registros: matchedUser.registros === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          dashboard: matchedUser.dashboard === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          auditoria: matchedUser.auditoria === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          configuracoes: matchedUser.configuracoes === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logs: matchedUser.logs === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          venda: matchedUser.venda === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          logVendas: matchedUser.log_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO',
          resumoVendas: matchedUser.resumo_vendas === 'ATIVO' ? 'ATIVO' : 'INATIVO'
        }
      }
    };
  } catch (e) {
    console.error("Erro em authenticateByPin:", e);
    return { success: false, error: e.toString() };
  }
}

async function getUserPins(loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    const cfg = await supabaseFetch("/config_settings?key=eq.user_pins");
    let map = {
      "1234": "Tati - Lab",
      "5678": "Mario",
      "9999": "admin",
      "1804": "admin",
      "2026": "Thelma",
      "1111": "MN Barao",
      "2222": "CESAR",
      "3333": "Demetrius",
      "4444": "Monica",
      "5555": "Andreza",
      "6666": "Flavia",
      "7777": "Fabiano",
      "8888": "Paloma",
      "1611": "Silvia"
    };
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const saved = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      map = { ...map, ...saved };
    }
    return { success: true, data: map };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveUserPin(username, pin, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    const cleanPin = String(pin).trim();
    if (cleanPin.length !== 4 || !/^\d{4}$/.test(cleanPin)) {
      return { success: false, error: 'O PIN deve conter exatamente 4 dígitos numéricos.' };
    }
    const current = await getUserPins(loggedUser);
    let map = current.success ? current.data : {};
    
    // Remove PIN anterior do mesmo usuário caso existisse
    Object.keys(map).forEach(k => {
      if (map[k] === username) delete map[k];
    });

    map[cleanPin] = username;
    await saveConfigParam('user_pins', map, getUserUsername(loggedUser));
    return { success: true, pin: cleanPin, username: username };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function getFornecedoresDePara(loggedUser) {
  try {
    try {
      const data = await supabaseFetch("/fornecedores_depara?order=laboratorio.asc,loja.asc");
      if (Array.isArray(data) && data.length > 0) return { success: true, data };
    } catch (tblErr) {}
    
    const cfg = await supabaseFetch("/config_settings?key=eq.fornecedores_depara");
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const list = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      return { success: true, data: Array.isArray(list) ? list : [] };
    }
    return { success: true, data: [] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveFornecedorDePara(aliasData, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    let savedInTable = false;
    try {
      if (aliasData.id && typeof aliasData.id === 'number' && aliasData.id < 1000000000) {
        await supabaseFetch(`/fornecedores_depara?id=eq.${aliasData.id}`, { method: 'PATCH', payload: JSON.stringify(aliasData) });
      } else {
        await supabaseFetch('/fornecedores_depara', { method: 'POST', payload: JSON.stringify(aliasData) });
      }
      savedInTable = true;
    } catch (e) {}

    const res = await getFornecedoresDePara(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    if (aliasData.id) {
      list = list.map(item => item.id == aliasData.id ? { ...item, ...aliasData } : item);
    } else {
      aliasData.id = Date.now();
      aliasData.created_at = new Date().toISOString();
      list.push(aliasData);
    }
    await saveConfigParam('fornecedores_depara', list, getUserUsername(loggedUser));
    return { success: true, data: aliasData };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function deleteFornecedorDePara(aliasId, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'configuracoes') && !await validateUserSession(loggedUser, 'auditoria')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      await supabaseFetch(`/fornecedores_depara?id=eq.${aliasId}`, { method: 'DELETE' });
    } catch (e) {}
    const res = await getFornecedoresDePara(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    list = list.filter(item => item.id != aliasId);
    await saveConfigParam('fornecedores_depara', list, getUserUsername(loggedUser));
    return { success: true };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function getAuditoriaFechamentos(loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      const data = await supabaseFetch("/auditoria_fechamentos?order=created_at.desc");
      if (Array.isArray(data) && data.length > 0) return { success: true, data };
    } catch (tblErr) {}
    
    const cfg = await supabaseFetch("/config_settings?key=eq.auditoria_fechamentos");
    if (cfg && cfg.length > 0 && cfg[0].value) {
      const list = typeof cfg[0].value === 'string' ? JSON.parse(cfg[0].value) : cfg[0].value;
      return { success: true, data: Array.isArray(list) ? list : [] };
    }
    return { success: true, data: [] };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function saveAuditoriaFechamento(fechamentoData, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }
    try {
      await supabaseFetch('/auditoria_fechamentos', { method: 'POST', payload: JSON.stringify(fechamentoData) });
    } catch (e) {}

    const res = await getAuditoriaFechamentos(loggedUser);
    let list = (res.success && Array.isArray(res.data)) ? res.data : [];
    if (!fechamentoData.id) fechamentoData.id = Date.now();
    fechamentoData.created_at = new Date().toISOString();
    fechamentoData.auditor = getUserUsername(loggedUser);
    list.unshift(fechamentoData);
    await saveConfigParam('auditoria_fechamentos', list.slice(0, 100), getUserUsername(loggedUser));
    return { success: true, data: fechamentoData };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

async function processarReconciliacao3Way(params, loggedUser) {
  try {
    if (!await validateUserSession(loggedUser, 'auditoria') && !await validateUserSession(loggedUser, 'configuracoes')) {
      return { success: false, error: 'SESSION_EXPIRED' };
    }

    const { laboratorio, mesReferencia, itensFatura, condicaoPagamento } = params || {};
    if (!Array.isArray(itensFatura) || itensFatura.length === 0) {
      return { success: false, error: 'Nenhum item da fatura enviado para reconciliação.' };
    }

    // Busca todas as conferências recentes e vendas para cruzamento
    const conferencias = await supabaseFetch("/conferencias?order=id.desc&limit=2000");
    const vendas = await supabaseFetch("/vendas?order=id.desc&limit=2000");

    let totalFaturado = 0;
    let totalGlosas = 0;
    let totalAprovado = 0;

    const itensProcessados = itensFatura.map((item, idx) => {
      const valorItem = Number(item.valor) || 0;
      totalFaturado += valorItem;

      const cfop = String(item.cfop || '').trim();
      const os = String(item.os || '').trim().replace(/^0+/, '');

      // 1. Regra de Glosa por CFOP (Bonificações e Trocas/Garantias)
      const cfopsIsentos = ['5910', '6910', '5.910', '6.910', '5949', '6949', '5.949', '6.949'];
      const isentoCfop = cfopsIsentos.includes(cfop);

      // 2. Busca OS na loja (vendas)
      const vendaMatch = Array.isArray(vendas) ? vendas.find(v => {
        const vOs = String(v.os_venda || '').trim().replace(/^0+/, '');
        return vOs && vOs === os;
      }) : null;

      // 3. Busca Conferência física do romaneio
      const confMatch = Array.isArray(conferencias) ? conferencias.find(c => {
        const cOs = String(c.os || '').trim().replace(/^0+/, '');
        return cOs && cOs === os;
      }) : null;

      let status = 'CONCILIADO_OK';
      let motivoGlosa = '';
      let valorGlosa = 0;

      if (isentoCfop) {
        status = 'GLOSA_CFOP';
        motivoGlosa = `CFOP ${cfop} (Bonificação/Garantia isenta de cobrança)`;
        valorGlosa = valorItem;
      } else if (!vendaMatch && !confMatch) {
        status = 'ITEM_FANTASMA';
        motivoGlosa = 'Item faturado sem registro de OS na loja nem romaneio físico conferido no laboratório.';
        valorGlosa = valorItem;
      } else if (!confMatch) {
        status = 'SEM_ROMANEIO';
        motivoGlosa = 'OS consta na loja, mas não foi localizado comprovante fotográfico de conferência de romaneio.';
        valorGlosa = valorItem;
      } else if (item.valorEsperado && Number(item.valorEsperado) < valorItem) {
        status = 'DIVERGENCIA_VALOR';
        valorGlosa = valorItem - Number(item.valorEsperado);
        motivoGlosa = `Valor cobrado (R$ ${valorItem.toFixed(2)}) superior ao acordado (R$ ${Number(item.valorEsperado).toFixed(2)}).`;
      }

      totalGlosas += valorGlosa;
      const valorLiquido = valorItem - valorGlosa;
      totalAprovado += valorLiquido;

      return {
        id: item.id || (idx + 1),
        os: item.os,
        loja: item.loja || (vendaMatch ? vendaMatch.loja : (confMatch ? confMatch.loja : 'Desconhecida')),
        descricao: item.descricao || 'Lente / Tratamento',
        cfop: item.cfop || '-',
        valorCobrado: valorItem,
        valorGlosa: valorGlosa,
        valorAprovado: valorLiquido,
        status: status,
        motivoGlosa: motivoGlosa,
        possuiOSLoja: !!vendaMatch,
        possuiRomaneioFoto: !!confMatch,
        fotoRomaneioUrl: confMatch ? (confMatch.detalhes ? (confMatch.detalhes.fotoUrl || confMatch.detalhes.FotoDriveUrl) : null) : null
      };
    });

    // 4. Rateio de Parcelas / Fluxo de Caixa (Split Cashflow)
    let parcelas = [];
    const dias = condicaoPagamento === '15_30' ? [15, 30] : [30];
    const valorParcela = totalAprovado / dias.length;
    const hoje = new Date();
    dias.forEach((d, i) => {
      const dataVenc = new Date(hoje.getTime() + d * 24 * 60 * 60 * 1000);
      parcelas.push({
        parcela: `${i + 1}/${dias.length}`,
        dias: d,
        vencimento: dataVenc.toLocaleDateString('pt-BR'),
        valor: Number(valorParcela.toFixed(2))
      });
    });

    return {
      success: true,
      resumo: {
        laboratorio: laboratorio || 'Não especificado',
        mesReferencia: mesReferencia || 'Atual',
        totalItens: itensFatura.length,
        totalFaturado: Number(totalFaturado.toFixed(2)),
        totalGlosas: Number(totalGlosas.toFixed(2)),
        totalAprovado: Number(totalAprovado.toFixed(2)),
        itensComGlosa: itensProcessados.filter(i => i.valorGlosa > 0).length,
        itensAprovados: itensProcessados.filter(i => i.status === 'CONCILIADO_OK').length,
        parcelas: parcelas
      },
      itens: itensProcessados
    };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

// ==========================================
// VERCEL SERVERLESS FUNCTION HANDLER
// ==========================================

const backendFunctions = {
  getAppData, authenticateUser, authenticateByPin, validateUserSession,
  saveVenda, addVenda, deleteVenda, deleteVendas, deleteVendasBulk,
  saveLancamento, addConferencia, deleteLancamento, deleteConferencia, deleteLancamentosBulk, deleteConferenciaGroup,
  addLoja, deleteLoja, renameLoja, editLoja,
  addLab, deleteLab, renameLab, editLab,
  addVendedor, deleteVendedor,
  addRepresentante, saveRepresentante, deleteRepresentante, renameRepresentante,
  addContatoResumo, deleteContatoResumo,
  addProduto, deleteProduto, editProduto,
  addMedico, addClinica,
  saveUser, deleteUser, getUsersList, changeOwnPassword,
  saveConfigParam, saveSessionTimeoutSetting, saveLogoUrl, deleteLogoUrl,
  generateSalePDF, generateDailySummaryPDF, importBulkCadastros, generateTableReportPDF,
  addConfigRecord, deleteConfigRecord,
  addVisitaMedica, deleteVisitaMedica,
  saveCampaign, deleteCampaign, saveLead, deleteLead, updateLeadStatus,
  saveOcorrencia, deleteOcorrencia, deleteOcorrenciasBulk,
  buscarDadosOS,
  getFornecedoresDePara, saveFornecedorDePara, deleteFornecedorDePara,
  getAuditoriaFechamentos, saveAuditoriaFechamento, processarReconciliacao3Way,
  getUserPins, saveUserPin
};

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // TikTok Webhook Handler
  if (req.query && req.query.source === 'tiktok') {
    try {
      const result = await handleTikTokWebhook({
        postData: { contents: typeof req.body === 'string' ? req.body : JSON.stringify(req.body) }
      });
      res.status(200).json(result || { success: true });
    } catch (e) {
      res.status(500).json({ success: false, error: e.toString() });
    }
    return;
  }

  // Healthcheck / Diagnostic GET
  if (req.method === 'GET') {
    res.status(200).json({
      status: 'online',
      service: 'controle-lentes-serverless-api',
      timestamp: new Date().toISOString(),
      status_detail: "Operando sob o Protocolo de Segurança A.T.L.A.S."
    });
    return;
  }

  // RPC POST Handler
  try {
    let body = req.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch (err) {
        // body could be raw text
      }
    }
    body = body || {};

    const functionName = body.functionName;
    const args = body.arguments || [];

    if (!functionName) {
      res.status(400).json({ success: false, error: "Nenhuma functionName especificada." });
      return;
    }

    if (!backendFunctions[functionName]) {
      res.status(404).json({ success: false, error: "Função não autorizada ou não encontrada: " + functionName });
      return;
    }

    // Validação de token de segurança para chamadas RPC protegidas
    if (functionName !== 'authenticateUser' && functionName !== 'authenticateByPin') {
      const reqHeaders = req.headers || {};
      const authHeader = reqHeaders.authorization || '';
      const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.token || null);
      const verified = verifyToken(token);
      
      // Fallback para usuário de sessão já validado nos argumentos (excluindo chaves reservadas)
      const candidateUser = args.slice().reverse().find(a => {
        if (typeof a === 'string' && a.length > 0 && a.length < 50) {
          const reserved = ['visitas', 'medicos', 'clinicas', 'assistencias', 'orcamentos', 'produtos', 'vendas', 'conferencias', 'lojas', 'laboratorios', 'campanhas', 'leads', 'ocorrencias'];
          return !reserved.includes(a.toLowerCase());
        }
        if (typeof a === 'object' && a && a.username) {
          return true;
        }
        return false;
      });
      const usernameToCheck = (typeof candidateUser === 'object' && candidateUser) ? candidateUser.username : candidateUser;
      if (!verified && (!usernameToCheck || !await validateUserSession(usernameToCheck))) {
        res.status(401).json({ success: false, error: "UNAUTHORIZED: Token de segurança ausente ou sessão expirada." });
        return;
      }
    }

    const result = await backendFunctions[functionName].apply(null, args);
    res.status(200).json(result !== undefined ? result : { success: true });
  } catch (err) {
    console.error("Erro na execução da API Serverless:", err);
    res.status(500).json({ success: false, error: err.toString() });
  }
};

// Export individual functions for test suites
module.exports.backendFunctions = backendFunctions;
module.exports.supabaseFetch = supabaseFetch;
