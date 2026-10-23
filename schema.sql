-- SQL Script to initialize CRM Campanhas and Leads in Supabase
-- Run this in the Supabase SQL Editor

-- 1. Create Campanhas Table
CREATE TABLE IF NOT EXISTS public.campanhas (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'Ativa',
    data_inicio DATE NOT NULL,
    data_fim DATE NOT NULL,
    lojas VARCHAR(255) DEFAULT 'Todas',
    aro VARCHAR(255),
    lente VARCHAR(255),
    preco_alvo NUMERIC(10,2),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS (or keep open if public anon client is used as per project current settings)
ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/write access" ON public.campanhas FOR ALL USING (true) WITH CHECK (true);

-- 2. Create Leads Table
CREATE TABLE IF NOT EXISTS public.leads (
    id SERIAL PRIMARY KEY,
    nome VARCHAR(255) NOT NULL,
    telefone VARCHAR(50) NOT NULL,
    loja_destino VARCHAR(255) NOT NULL,
    dia_horario TIMESTAMP WITH TIME ZONE NOT NULL,
    campanha_id INTEGER REFERENCES public.campanhas(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'entrante', -- 'entrante', 'espera', 'efetivado', 'perdido'
    vendedor VARCHAR(255),
    produtos_vendidos TEXT,
    valor_vendido NUMERIC(10,2) DEFAULT 0,
    forma_pagamento VARCHAR(255),
    motivo_perda VARCHAR(255),
    venda_os VARCHAR(50),
    detalhes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/write access" ON public.leads FOR ALL USING (true) WITH CHECK (true);

-- 3. Create Ocorrências Table
CREATE TABLE IF NOT EXISTS public.ocorrencias (
    id SERIAL PRIMARY KEY,
    os VARCHAR(50) NOT NULL,
    loja VARCHAR(100) NOT NULL,
    vendedor VARCHAR(100) NOT NULL,
    cliente_nome VARCHAR(255) NOT NULL,
    data DATE NOT NULL DEFAULT CURRENT_DATE,
    motivo VARCHAR(255) NOT NULL,
    custo_adicional NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    detalhes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE public.ocorrencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read/write access" ON public.ocorrencias FOR ALL USING (true) WITH CHECK (true);
