-- =============================================================================
-- Etapa 6 — Agenda do dia, lembretes e avisos
-- =============================================================================

-- Preferências de aviso da empresa (o dono altera em Ajustes).
alter table public.empresas
  add column aviso_email boolean not null default true,
  add column aviso_push boolean not null default true,
  add column aviso_no_dia boolean not null default true,
  -- 0 = não avisa antes; 1 = avisa 1 dia antes (padrão); até 7.
  add column aviso_dias_antes int not null default 1 check (aviso_dias_antes between 0 and 7);

alter table public.lembretes
  add column feito_em timestamptz,
  add column observacao text check (char_length(observacao) <= 500);

create index lembretes_data_idx on public.lembretes (empresa_id, data) where deleted_at is null;

-- Assinaturas de notificação (Web Push) de cada aparelho.
create table public.notificacoes_push (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  usuario_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now()
);

alter table public.notificacoes_push enable row level security;
create policy notificacoes_push_select on public.notificacoes_push for select to authenticated
  using (usuario_id = auth.uid());
create policy notificacoes_push_insert on public.notificacoes_push for insert to authenticated
  with check (usuario_id = auth.uid() and empresa_id = public.empresa_atual());
create policy notificacoes_push_delete on public.notificacoes_push for delete to authenticated
  using (usuario_id = auth.uid());
grant delete on public.notificacoes_push to authenticated;

-- Registro dos avisos já mandados, para o cron não repetir.
create table public.avisos_enviados (
  id bigint generated always as identity primary key,
  empresa_id uuid not null references public.empresas (id),
  chave text not null,
  canal text not null check (canal in ('email', 'push')),
  enviado_em timestamptz not null default now(),
  unique (chave, canal)
);
alter table public.avisos_enviados enable row level security;
revoke all on public.avisos_enviados from anon, authenticated;
