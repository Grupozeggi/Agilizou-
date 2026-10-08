-- =============================================================================
-- Etapa 14 — Perguntas do cadastro (perfil do negócio) e pedido de marketing
-- =============================================================================
-- No onboarding o dono responde algumas perguntas rápidas (todas opcionais):
-- tempo de negócio, tamanho da equipe, faixa de faturamento, como controla o
-- caixa, maior dificuldade e como conheceu o Agilizou. Também pode pedir
-- ajuda do time de marketing (no onboarding ou depois, pelo menu).
-- As opções de cada pergunta ficam em src/config/perfil-negocio.ts; os
-- valores aceitos aqui precisam ser os mesmos de lá.
-- =============================================================================

create table public.perfil_negocio (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id),
  tempo_negocio text check (tempo_negocio in ('menos_1', '1_a_3', '3_a_5', '5_a_10', 'mais_10')),
  equipe text check (equipe in ('so_eu', '2_a_5', '6_a_10', 'mais_10')),
  faturamento text check (faturamento in ('ate_5k', '5k_a_15k', '15k_a_30k', '30k_a_60k', 'mais_60k', 'nao_informar')),
  controle_caixa text check (controle_caixa in ('nao_controla', 'caderno', 'planilha', 'outro_sistema')),
  dificuldade text check (dificuldade in ('saber_lucro', 'contas', 'estoque', 'agenda', 'vender_mais', 'falta_tempo', 'outra')),
  origem text check (origem in ('indicacao', 'instagram', 'google', 'agencia', 'outro')),
  quer_marketing boolean not null default false,
  -- só dígitos, com DDI (mesmo formato de clientes.whatsapp)
  whatsapp_contato text check (whatsapp_contato ~ '^[0-9]{10,15}$'),
  marketing_pedido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger perfil_negocio_atualizado_em before update on public.perfil_negocio
  for each row execute function public.tocar_atualizado_em();

-- Data do pedido de marketing: marcada na hora em que vira "sim".
create or replace function public.marcar_pedido_marketing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.quer_marketing and (tg_op = 'INSERT' or not old.quer_marketing) then
    new.marketing_pedido_em := now();
  elsif not new.quer_marketing then
    new.marketing_pedido_em := null;
  elsif tg_op = 'UPDATE' then
    new.marketing_pedido_em := old.marketing_pedido_em;
  end if;
  return new;
end;
$$;

create trigger perfil_negocio_pedido_marketing before insert or update on public.perfil_negocio
  for each row execute function public.marcar_pedido_marketing();

alter table public.perfil_negocio enable row level security;

-- O dono lê e grava só o da própria empresa; o admin (com 2FA) lê todos.
-- Sem a trava de "somente leitura": conta bloqueada ainda pode pedir contato.
create policy perfil_negocio_select on public.perfil_negocio for select to authenticated
  using (empresa_id = public.empresa_atual() or public.admin_global());
create policy perfil_negocio_insert on public.perfil_negocio for insert to authenticated
  with check (empresa_id = public.empresa_atual());
create policy perfil_negocio_update on public.perfil_negocio for update to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());

create trigger perfil_negocio_auditar_admin after insert or update or delete on public.perfil_negocio
  for each row execute function public.auditar_admin();

revoke all on public.perfil_negocio from anon;
revoke delete, truncate on public.perfil_negocio from authenticated;
revoke execute on function public.marcar_pedido_marketing() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Admin: a lista de empresas passa a trazer o pedido de marketing e o link
-- de agendamento; o painel ganha o total de pedidos.
-- (Mudar as colunas devolvidas exige apagar e recriar a função.)
-- -----------------------------------------------------------------------------
drop function public.admin_empresas(text);

create function public.admin_empresas(p_busca text default null)
returns table (
  id uuid, nome text, nicho text, plano text, status_assinatura text, teste_ate timestamptz,
  criado_em timestamptz, ultimo_acesso_em timestamptz, emails text,
  lancamentos_mes bigint, produtos bigint, clientes bigint, profissionais bigint,
  limites_personalizados jsonb,
  proxima_cobranca date, quer_marketing boolean, marketing_pedido_em timestamptz, whatsapp_contato text,
  slug text, agendamento_online boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  v_busca text := '%' || lower(coalesce(trim(p_busca), '')) || '%';
begin
  if not public.admin_global() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return query
  select e.id, e.nome, e.nicho, e.plano, e.status_assinatura, e.teste_ate, e.criado_em, e.ultimo_acesso_em,
         (select string_agg(p.email, ', ') from public.perfis p where p.empresa_id = e.id),
         (select count(distinct coalesce(l.grupo_id, l.id)) from public.lancamentos l where l.empresa_id = e.id and l.criado_em >= v_inicio_mes),
         (select count(*) from public.produtos x where x.empresa_id = e.id and x.deleted_at is null),
         (select count(*) from public.clientes x where x.empresa_id = e.id and x.deleted_at is null),
         (select count(*) from public.profissionais x where x.empresa_id = e.id and x.deleted_at is null),
         e.limites_personalizados,
         e.proxima_cobranca, coalesce(n.quer_marketing, false), n.marketing_pedido_em, n.whatsapp_contato,
         e.slug, e.agendamento_online
    from public.empresas e
    left join public.perfil_negocio n on n.empresa_id = e.id
   where p_busca is null or trim(p_busca) = ''
      or lower(e.nome) like v_busca or e.nicho like v_busca
      or exists (select 1 from public.perfis p where p.empresa_id = e.id and lower(p.email) like v_busca)
   order by e.criado_em desc
   limit 500;
end;
$$;
revoke execute on function public.admin_empresas(text) from public, anon;
grant execute on function public.admin_empresas(text) to authenticated;

create or replace function public.admin_painel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
begin
  if not public.admin_global() then
    raise exception 'Acesso negado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'total', (select count(*) from public.empresas),
    'novos_mes', (select count(*) from public.empresas where criado_em >= v_inicio_mes),
    'cancelados_mes', (select count(*) from public.empresas where cancelado_em >= v_inicio_mes),
    'ativos_por_plano', coalesce((select jsonb_object_agg(plano, n) from (select plano, count(*) n from public.empresas where status_assinatura = 'ativo' group by plano) x), '{}'::jsonb),
    'por_status', coalesce((select jsonb_object_agg(status_assinatura, n) from (select status_assinatura, count(*) n from public.empresas group by status_assinatura) x), '{}'::jsonb),
    'por_nicho', coalesce((select jsonb_object_agg(nicho, n) from (select nicho, count(*) n from public.empresas group by nicho) x), '{}'::jsonb),
    'whatsapp_mes', (select count(*) from public.mensagens_whatsapp where status in ('enviada', 'entregue', 'lida') and enviado_em >= v_inicio_mes),
    'testes_acabando', (select count(*) from public.empresas where status_assinatura = 'teste' and teste_ate > now() and teste_ate <= now() + interval '3 days'),
    'testes_vencidos', (select count(*) from public.empresas where status_assinatura = 'teste' and teste_ate <= now()),
    'querem_marketing', (select count(*) from public.perfil_negocio where quer_marketing),
    'agendamento_online', (select count(*) from public.empresas where agendamento_online)
  );
end;
$$;
revoke execute on function public.admin_painel() from public, anon;
grant execute on function public.admin_painel() to authenticated;
