# Guia do Web App: Controle de Lançamentos e Vendas (Versão Atualizada)

Esta nova versão do aplicativo web de Gestão de Lentes adiciona um módulo completo de **Vendas**, **Log de Vendas** histórico e um painel gerencial de **Resumo de Vendas** (restrito a administradores), além de controle avançado de visibilidade dos menus por usuário na planilha e temporizador de inatividade.

---

## 🔐 Dados de Acesso Padrão e Níveis de Permissão

Ao abrir o aplicativo, a tela de login glassmorphic moderna bloqueará o acesso aos dados da planilha até a inserção de credenciais válidas.

### Perfis de Acesso e Controle de Visibilidade
O controle de acesso é gerenciado dinamicamente através da aba **`Cadastros_Usuarios`** na planilha. Cada menu do aplicativo possui uma coluna correspondente:
* **Colunas de Menu:** `Conferencia`, `Registros`, `Venda`, `LogVendas`, `Dashboard`, `Auditoria`, `ResumoVendas`, `Configuracoes`, `Logs`.
* **Valores:** Preenchendo com **`SIM`**, o menu correspondente será exibido na barra lateral. Preenchendo com **`NÃO`**, o menu é ocultado e o acesso à rota é bloqueado no frontend.
* **Resumo de Vendas:** Este menu gerencial é de visualização exclusiva de administradores. Só será exibido se o usuário tiver permissão ativa e seu nome de cadastro for exatamente **`Administrador`** (ou usuário `admin`).

As credenciais de teste padrão pré-carregadas são:
* **Usuário:** `admin`
* **Senha:** `admin123`
* **Nome de Exibição:** `Administrador`
* **Privilégios:** `SIM` para todas as colunas de menus.

---

## 🛍️ Novo Módulo de Vendas

O menu **Lançar Venda** permite lançar transações comerciais completas:

1. **Informações Iniciais:** Seleção de Loja, Vendedor (carregados dinamicamente do banco de dados) e o número da OS de Venda.
2. **Cadastro de Cliente:**
   * Geração automática de ID único do cliente (`CLI-XXXXXX`).
   * Campos de nome, e-mail, nascimento e CPF.
   * Integração com a **API ViaCEP**: digitando o CEP e clicando em **Buscar**, o sistema consulta a API e auto-preenche Rua, Bairro, Cidade e UF, restando ao usuário preencher o número e complemento.
   * Botão para **Clonar WhatsApp** direto para o telefone secundário para agilizar a digitação.
3. **Dados de Compra:**
   * **Aro 1:** Código, Modelo, Lente, Tratamento (carregados do catálogo) e Preço do Aro.
   * **Aro 2 (Dobro):** Checkbox para ativar segunda armação na mesma OS. Acompanha botão **Copiar Anterior** para replicar instantaneamente todas as dioptrias, DNP, alturas, lentes e tratamentos do Aro 1.
   * **Foto Receita (OCR):** Botões para simular processamento de OCR na receita do cliente, preenchendo automaticamente dioptrias de Longe (OD/OE: Esférico, Cilíndrico, Eixo, Altura, DNP) e Adição.
4. **Forma de Pagamento:**
   * Opções: Dinheiro, Pix, Cartão de Crédito (com input de parcelas), Crediário, Depósito/Transferência.
   * Modo de Recebimento: **Total** (Quitação integral imediata) ou **Apenas Sinal** (Entrada parcial + saldo residual).
   * Painel de valores atualizado em tempo real mostrando o Total da Venda, Valor Pago e Saldo Residual a receber.

---

## 📋 Log de Vendas e Resumo Gerencial

### Log de Vendas
Exibe a listagem completa das vendas em formato de linhas resumidas por OS e Cliente. 
* Contém filtros por texto (OS, Cliente ou Vendedor) e por faturamento (exibir todas, somente recebidas integralmente ou apenas com residual a receber).
* Botão **Detalhes** que abre um modal glassmorphic completo exibindo todos os dados da venda, endereço do cliente e as dioptrias cadastradas para o Aro 1 e Aro 2.

### Resumo de Vendas (Admin Apenas)
Dashboard gerencial que consolida os faturamentos:
* Filtro por intervalo de data.
* KPIs de Faturamento Total, Total Recebido em Caixa (Sinal) e Total de Resíduais a Receber.
* Gráfico de colunas empilhadas demonstrando recebimentos e resíduos por Loja.
* Gráfico Doughnut consolidando o volume de vendas por modalidade de pagamento.
* Listagem de contas com saldo residual em aberto contendo link direto para contato rápido via WhatsApp do cliente.

---

## ⏳ Expiração de Sessão por Inatividade
Para garantir a segurança dos dados, o sistema monitora a inatividade do usuário (movimento do mouse, digitação, cliques ou toques). Se o sistema ficar inativo por **mais de 2 minutos**, o usuário será automaticamente desconectado e redirecionado para a tela de login.

---

## 📦 Como Atualizar o Aplicativo no Google Apps Script

1. Abra a sua planilha do Google.
2. Acesse **Extensões** > **Apps Script**.
3. No painel esquerdo:
   * Abra o arquivo **`Code.gs`** (ou `Código.gs`), apague tudo e cole o novo código do arquivo **[Code.gs](file:///C:/Users/fbdv1/.gemini/antigravity/scratch/controle_lentes/Code.gs)**.
   * Abra o arquivo **`Index.html`**, apague tudo e cole o novo código do arquivo **[Index.html](file:///C:/Users/fbdv1/.gemini/antigravity/scratch/controle_lentes/Index.html)**.
4. Clique em **Salvar** (ícone do disquete).
5. **Atualizar a Implantação:**
   * Clique em **Implantar** (canto superior direito) > **Gerenciar implantações**.
   * Clique no ícone de **Lápis** (Editar) ao lado da implantação ativa.
   * Na caixa "Versão", selecione **"Nova versão"** (New version).
   * Clique em **Implantar** (Deploy).
6. Acesse a URL fornecida para utilizar a versão completa do sistema.

---

## 📁 Arquivos da Aplicação
* **[Code.gs](file:///C:/Users/fbdv1/.gemini/antigravity/scratch/controle_lentes/Code.gs):** Funções do servidor para CRUD de vendas, vendedores e autenticação de usuários.
* **[Index.html](file:///C:/Users/fbdv1/.gemini/antigravity/scratch/controle_lentes/Index.html):** Frontend contendo abas de conferências, lançar vendas, log e detalhes de vendas, gráficos financeiros de resumos, e controle de inatividade.
* **[planilha_controle_lentes.xlsx](file:///C:/Users/fbdv1/.gemini/antigravity/scratch/controle_lentes/planilha_controle_lentes.xlsx):** Arquivo de banco de dados Excel re-gerado contendo as novas abas `Vendas` e `Cadastros_Vendedores`.
