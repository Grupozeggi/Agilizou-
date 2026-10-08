-- =============================================================================
-- Etapa 11 — Painel administrativo e modo suporte
-- =============================================================================
-- Modo suporte: o servidor manda os cabeçalhos x-modo-suporte: 1 e
-- x-empresa-suporte: <uuid>. Eles SÓ valem para admin com 2FA (eh_admin());
-- para qualquer outro usuário são ignorados.
--   * empresa_atual() passa a ser a empresa do suporte;
--   * as políticas deixam de mostrar "todas as empresas" e mostram só ela;
--   * toda alteração vai para log_admin com modo_suporte = true (gatilho).
-- =============================================================================

create or replace function public.empresa_suporte()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when public.eh_admin() and public.em_modo_suporte()
         and (nullif(current_setting('request.headers', true), '')::json ->> 'x-empresa-suporte')
             ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then (nullif(current_setting('request.headers', true), '')::json ->> 'x-empresa-suporte')::uuid
  end;
$$;

create or replace function public.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.empresa_suporte(),
    (select p.empresa_id from public.perfis p where p.id = auth.uid())
  );
$$;

-- Admin vendo TODAS as empresas (painel), e não dentro de uma (suporte).
create or replace function public.admin_global()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.eh_admin() and public.empresa_suporte() is null;
$$;

-- Recria as políticas de isolamento trocando eh_admin() por admin_global().
do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'clientes', 'produtos', 'profissionais', 'servicos', 'vendas',
    'itens_venda', 'lancamentos', 'movimentacoes_estoque', 'agendamentos',
    'lembretes', 'mensagens_whatsapp'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = public.empresa_atual() or public.admin_global())', t || '_select', t);
    if t <> 'mensagens_whatsapp' then
      execute format(
        'create policy %I on public.%I for insert to authenticated
           with check (empresa_id = public.empresa_atual() or public.admin_global())', t || '_insert', t);
    end if;
    -- sem update: fila de mensagens, histórico de estoque e itens de venda
    if t not in ('mensagens_whatsapp', 'movimentacoes_estoque', 'itens_venda') then
      execute format(
        'create policy %I on public.%I for update to authenticated
           using (empresa_id = public.empresa_atual() or public.admin_global())
           with check (empresa_id = public.empresa_atual() or public.admin_global())', t || '_update', t);
    end if;
  end loop;
end;
$$;

drop policy empresas_select on public.empresas;
drop policy empresas_update on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.empresa_atual() or public.admin_global());
create policy empresas_update on public.empresas for update to authenticated
  using (id = public.empresa_atual() or public.admin_global())
  with check (id = public.empresa_atual() or public.admin_global());

drop policy exportacoes_select on public.exportacoes;
create policy exportacoes_select on public.exportacoes for select to authenticated
  using (empresa_id = public.empresa_atual() or public.admin_global());

-- Último acesso do cliente (no máximo 1 gravação a cada 30 min).
-- security definer: grava mesmo com a conta em somente leitura; ignora o admin.
create or replace function public.registrar_acesso()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.empresas e set ultimo_acesso_em = now()
   from public.perfis p
   where p.id = auth.uid() and e.id = p.empresa_id
     and not public.em_modo_suporte()
     and (e.ultimo_acesso_em is null or e.ultimo_acesso_em < now() - interval '30 minutes');
$$;
revoke execute on function public.registrar_acesso() from public, anon;
grant execute on function public.registrar_acesso() to authenticated;

-- Lista de empresas com uso dos limites (só admin, fora do modo suporte).
create or replace function public.admin_empresas(p_busca text default null)
returns table (
  id uuid, nome text, nicho text, plano text, status_assinatura text, teste_ate timestamptz,
  criado_em timestamptz, ultimo_acesso_em timestamptz, emails text,
  lancamentos_mes bigint, produtos bigint, clientes bigint, profissionais bigint,
  limites_personalizados jsonb
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
         e.limites_personalizados
    from public.empresas e
   where p_busca is null or trim(p_busca) = ''
      or lower(e.nome) like v_busca or e.nicho like v_busca
      or exists (select 1 from public.perfis p where p.empresa_id = e.id and lower(p.email) like v_busca)
   order by e.criado_em desc
   limit 500;
end;
$$;
revoke execute on function public.admin_empresas(text) from public, anon;
grant execute on function public.admin_empresas(text) to authenticated;

-- Números do painel geral.
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
    'whatsapp_mes', (select count(*) from public.mensagens_whatsapp where status in ('enviada', 'entregue', 'lida') and enviado_em >= v_inicio_mes)
  );
end;
$$;
revoke execute on function public.admin_painel() from public, anon;
grant execute on function public.admin_painel() to authenticated;
