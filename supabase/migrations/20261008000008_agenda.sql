-- =============================================================================
-- Etapa 7 — Agenda de atendimentos e presença
-- =============================================================================

-- Horário de funcionamento (usado para mostrar horários vagos).
alter table public.empresas
  add column horario_abertura time not null default '08:00',
  add column horario_fechamento time not null default '18:00',
  -- 0 = domingo ... 6 = sábado
  add column dias_funcionamento int[] not null default '{1,2,3,4,5,6}',
  add constraint empresas_horario_valido check (horario_fechamento > horario_abertura);

alter table public.agendamentos
  add column remarcado_de uuid references public.agendamentos (id),
  add column presenca_em timestamptz;

create index agendamentos_inicio_idx on public.agendamentos (empresa_id, inicio) where deleted_at is null;
create index agendamentos_cliente_idx on public.agendamentos (empresa_id, cliente_id, inicio desc) where deleted_at is null;

-- Indicadores da agenda no período (datas em São Paulo).
create or replace function public.indicadores_agenda(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_atual();
  v_ini timestamptz := (p_inicio::timestamp at time zone 'America/Sao_Paulo');
  v_fim timestamptz := ((p_fim + 1)::timestamp at time zone 'America/Sao_Paulo');
  v jsonb;
begin
  if v_empresa is null then
    raise exception 'Usuário sem empresa.' using errcode = '42501';
  end if;

  with ag as (
    select a.*, s.preco_centavos as preco, c.nome as cliente_nome
      from public.agendamentos a
      left join public.servicos s on s.id = a.servico_id and s.empresa_id = a.empresa_id
      join public.clientes c on c.id = a.cliente_id and c.empresa_id = a.empresa_id
     where a.empresa_id = v_empresa and a.deleted_at is null
       and a.inicio >= v_ini and a.inicio < v_fim
  ),
  atendidos_90 as (
    -- clientes que compareceram nos 90 dias até o fim do período
    select cliente_id, count(*) as vezes
      from public.agendamentos
     where empresa_id = v_empresa and deleted_at is null and status = 'compareceu'
       and inicio >= v_fim - interval '90 days' and inicio < v_fim
     group by cliente_id
  )
  select jsonb_build_object(
    'total', (select count(*) from ag where status not in ('cancelado', 'remarcado')),
    'por_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from ag group by status) x), '{}'::jsonb),
    'compareceu', (select count(*) from ag where status = 'compareceu'),
    'faltou', (select count(*) from ag where status = 'faltou'),
    'receita_perdida', coalesce((select sum(preco) from ag where status = 'faltou'), 0),
    'minutos_ocupados', coalesce((select sum(extract(epoch from (fim - inicio)) / 60)
                                    from ag where status not in ('cancelado', 'remarcado')), 0)::bigint,
    'faltas_por_cliente', coalesce((
        select jsonb_agg(jsonb_build_object('cliente', cliente_nome, 'faltas', n) order by n desc, cliente_nome)
          from (select cliente_nome, count(*) n from ag where status = 'faltou' group by cliente_nome order by n desc limit 5) f
      ), '[]'::jsonb),
    'clientes_atendidos_90d', (select count(*) from atendidos_90),
    'clientes_que_voltaram_90d', (select count(*) from atendidos_90 where vezes >= 2)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.indicadores_agenda(date, date) from public, anon;
grant execute on function public.indicadores_agenda(date, date) to authenticated;
