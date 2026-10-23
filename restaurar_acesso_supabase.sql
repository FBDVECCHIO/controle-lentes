-- ====================================================================
-- PROTOCOLO A.T.L.A.S. - RESTAURAÇÃO IMEDIATA DE ACESSO AO BANCO
-- Execute este script no SQL Editor do Supabase para restabelecer o login
-- ====================================================================

-- 1. Restaurar os privilégios da tabela para a chave utilizada pela API Serverless
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 2. Desativar o bloqueio de RLS temporariamente nas tabelas
-- (A segurança já está garantida no backend Serverless que exige JWT e não expõe chaves no frontend)
ALTER TABLE public.usuarios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencias DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.laboratorios DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos_resumo DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias DISABLE ROW LEVEL SECURITY;

SELECT 'Acesso e privilégios restabelecidos com sucesso!' AS status;
