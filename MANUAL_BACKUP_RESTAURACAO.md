# Manual Operacional de Backup e Restauração de Desastres (DRP)

> **Protocolo:** A.T.L.A.S.  
> **Ambiente:** Supabase PostgreSQL (`controle-lentes-db`)  

---

## 1. Visão Geral

Este manual estabelece os procedimentos para realizar cópias de segurança (backups) off-site e restaurar dados em caso de exclusão acidental, corrupção ou necessidade de migração.

---

## 2. Como Fazer o Backup Manualmente

Para gerar um novo snapshot completo com todas as 14 tabelas do banco de dados, execute na pasta do projeto:

```bash
node scripts/backup_supabase.js
```

O comando exporta automaticamente:
1. **Arquivo JSON:** `backups/backup_YYYY-MM-DDTHH-mm-ss.json` (backup estruturado).
2. **Arquivo SQL:** `backups/backup_YYYY-MM-DDTHH-mm-ss.sql` (comandos de inserção para o PostgreSQL).
3. **Ponteiro Latest:** `backups/backup_latest.json` (última versão gerada).

---

## 3. Como Restaurar os Dados

### Opção A: Restauração Automática via Script Node.js
Para restaurar a partir do último backup gerado:
```bash
node scripts/restore_supabase.js
```

Para restaurar a partir de um backup específico:
```bash
node scripts/restore_supabase.js backups/backup_2026-10-20T21-49-43-933Z.json
```

### Opção B: Restauração via SQL Editor do Supabase
1. Abra o arquivo `backups/backup_*.sql`.
2. Acesse o **Supabase Dashboard** > **SQL Editor**.
3. Cole o conteúdo do arquivo `.sql` e clique em **Run**.

---

## 4. Política de Retenção Recomendada
- Manter backups locais versionados na pasta `backups/`.
- Copiar periodicamente o arquivo mais recente para um armazenamento em nuvem externo e desconectado (ex: Google Drive Seguro ou AWS S3).
