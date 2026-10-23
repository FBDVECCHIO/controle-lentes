-- Tabela dedicada para Registro de Visitas Médicas
-- Soluciona definitivamente concorrência e desaparecimento de visitas

CREATE TABLE IF NOT EXISTS public.visitas_medicas (
    id VARCHAR(100) PRIMARY KEY,
    data VARCHAR(20) NOT NULL,
    hora VARCHAR(20) NOT NULL,
    representante VARCHAR(255) NOT NULL,
    medico_nome VARCHAR(255),
    medico_crm VARCHAR(100),
    assunto VARCHAR(255),
    status VARCHAR(50) DEFAULT 'EFETIVADA',
    relato TEXT,
    lat NUMERIC(10, 7),
    lng NUMERIC(10, 7),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Índices otimizados para busca e ordenação
CREATE INDEX IF NOT EXISTS idx_visitas_data ON public.visitas_medicas (data DESC, hora DESC);
CREATE INDEX IF NOT EXISTS idx_visitas_representante ON public.visitas_medicas (representante);
CREATE INDEX IF NOT EXISTS idx_visitas_medico_crm ON public.visitas_medicas (medico_crm);

-- Garantir acesso total ao PostgREST
GRANT ALL ON TABLE public.visitas_medicas TO anon, authenticated, service_role;
ALTER TABLE public.visitas_medicas DISABLE ROW LEVEL SECURITY;
