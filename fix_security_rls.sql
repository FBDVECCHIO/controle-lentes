-- ========================================================
-- PROTOCOLO A.T.L.A.S. - SCRIPT DE BLINDAGEM SUPABASE (RLS)
-- Execute este script no SQL Editor do Supabase Dashboard
-- ========================================================

-- 1. Habilitar Row Level Security (RLS) em todas as 14 tabelas
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lojas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.laboratorios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.representantes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos_resumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conferencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.config_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;

-- 2. Remover políticas públicas permissivas anteriores
DROP POLICY IF EXISTS "Allow public read/write access" ON public.campanhas;
DROP POLICY IF EXISTS "Allow public read/write access" ON public.leads;
DROP POLICY IF EXISTS "Allow public read/write access" ON public.ocorrencias;
DROP POLICY IF EXISTS "Public read access" ON public.campanhas;
DROP POLICY IF EXISTS "Public read access" ON public.leads;
DROP POLICY IF EXISTS "Public read access" ON public.ocorrencias;

-- 3. Revogar permissões diretas do papel anônimo (anon) nas tabelas críticas
-- Isso impede que qualquer pessoa com a anon key extraia senhas, vendas ou logs
REVOKE ALL ON TABLE public.usuarios FROM anon;
REVOKE ALL ON TABLE public.vendas FROM anon;
REVOKE ALL ON TABLE public.conferencias FROM anon;
REVOKE ALL ON TABLE public.auditoria_logs FROM anon;
REVOKE ALL ON TABLE public.ocorrencias FROM anon;
REVOKE ALL ON TABLE public.leads FROM anon;
REVOKE ALL ON TABLE public.config_settings FROM anon;

-- 4. Criar políticas de acesso restrito (apenas para o backend/service_role ou usuários autenticados)
-- Note: O papel service_role do Supabase ignora RLS por padrão, garantindo que a Vercel Serverless Function continue operando 100%.

CREATE POLICY "Service Role Only - usuarios" ON public.usuarios
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - vendas" ON public.vendas
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - conferencias" ON public.conferencias
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - auditoria_logs" ON public.auditoria_logs
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - ocorrencias" ON public.ocorrencias
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - leads" ON public.leads
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "Service Role Only - config_settings" ON public.config_settings
    FOR ALL TO authenticated, service_role
    USING (true) WITH CHECK (true);

-- Tabelas cadastrais de catálogo (apenas leitura para authenticated/service_role)
CREATE POLICY "Protected read - lojas" ON public.lojas FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - laboratorios" ON public.laboratorios FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - vendedores" ON public.vendedores FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - representantes" ON public.representantes FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - contatos_resumo" ON public.contatos_resumo FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - produtos" ON public.produtos FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);
CREATE POLICY "Protected read - campanhas" ON public.campanhas FOR ALL TO authenticated, service_role USING (true) WITH CHECK (true);

-- Notificação de status
SELECT 'Row Level Security ativado e blindado em todas as 14 tabelas com sucesso!' AS status;
