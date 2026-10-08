-- =============================================================================
-- Etapa 4 — Dashboard e fluxo de caixa
-- =============================================================================
-- Tudo calculado no banco, em centavos (bigint), regime de caixa:
-- só o que foi pago/recebido entra em saldo, entradas, saídas e resultado.
--
-- Resultado do mês (DRE simples):
--   receitas  = entradas pagas
--   custos    = saídas pagas de categoria do grupo "custo"
--   despesas  = demais saídas pagas (grupo "despesa" ou sem categoria)
--   lucro     = receitas - custos - despesas
-- =============================================================================

create or replace function public.hoje_sp()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

create or replace function public.resumo_financeiro(p_inicio date, p_fim date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_atual();
  v_hoje date := public.hoje_sp();
  v_resultado jsonb;
begin
  if v_empresa is null then
    raise exception 'Usuário sem empresa.' using errcode = '42501';
  end if;
  if p_fim < p_inicio then
    raise exception 'Período inválido.' using errcode = '22023';
  end if;

  with base as (
    select l.tipo, l.valor_centavos as v, l.status, l.data,
           case
             when l.tipo = 'entrada' then 'receita'
             else coalesce(nullif(c.grupo, 'receita'), 'despesa')
           end as grupo,
           coalesce(c.nome, 'Sem categoria') as categoria
      from public.lancamentos l
      left join public.categorias c on c.id = l.categoria_id and c.empresa_id = l.empresa_id
     where l.empresa_id = v_empresa and l.deleted_at is null
  ),
  periodo as (
    select * from base where status = 'pago' and data between p_inicio and p_fim
  ),
  meses as (
    select generate_series(
             date_trunc('month', p_fim) - interval '5 months',
             date_trunc('month', p_fim),
             interval '1 month'
           )::date as mes
  )
  select jsonb_build_object(
    'hoje', v_hoje,
    'saldo_inicial', (select saldo_inicial_centavos from public.empresas where id = v_empresa),
    'saldo_atual',
      (select saldo_inicial_centavos from public.empresas where id = v_empresa)
      + coalesce((select sum(case when tipo = 'entrada' then v else -v end)
                    from base where status = 'pago' and data <= v_hoje), 0),
    'entradas', coalesce((select sum(v) from periodo where tipo = 'entrada'), 0),
    'saidas',   coalesce((select sum(v) from periodo where tipo = 'saida'), 0),
    'receitas', coalesce((select sum(v) from periodo where grupo = 'receita'), 0),
    'custos',   coalesce((select sum(v) from periodo where grupo = 'custo'), 0),
    'despesas', coalesce((select sum(v) from periodo where grupo = 'despesa'), 0),
    'a_receber_periodo', coalesce((select sum(v) from base
        where status = 'pendente' and tipo = 'entrada' and data between p_inicio and p_fim), 0),
    'a_pagar_periodo', coalesce((select sum(v) from base
        where status = 'pendente' and tipo = 'saida' and data between p_inicio and p_fim), 0),
    'pagar_vencidas', (select jsonb_build_object('qtd', count(*), 'total', coalesce(sum(v), 0))
        from base where status = 'pendente' and tipo = 'saida' and data < v_hoje),
    'pagar_7dias', (select jsonb_build_object('qtd', count(*), 'total', coalesce(sum(v), 0))
        from base where status = 'pendente' and tipo = 'saida' and data between v_hoje and v_hoje + 7),
    'receber_vencidas', (select jsonb_build_object('qtd', count(*), 'total', coalesce(sum(v), 0))
        from base where status = 'pendente' and tipo = 'entrada' and data < v_hoje),
    'receber_7dias', (select jsonb_build_object('qtd', count(*), 'total', coalesce(sum(v), 0))
        from base where status = 'pendente' and tipo = 'entrada' and data between v_hoje and v_hoje + 7),
    'por_categoria', coalesce((
        select jsonb_agg(jsonb_build_object('categoria', categoria, 'grupo', grupo, 'total', total) order by total desc)
          from (select categoria, grupo, sum(v) as total from periodo group by categoria, grupo) x
      ), '[]'::jsonb),
    'serie', (
        select jsonb_agg(jsonb_build_object(
                 'mes', to_char(m.mes, 'YYYY-MM'),
                 'entradas', coalesce((select sum(v) from base b where b.status = 'pago' and b.tipo = 'entrada'
                                        and date_trunc('month', b.data) = m.mes), 0),
                 'saidas', coalesce((select sum(v) from base b where b.status = 'pago' and b.tipo = 'saida'
                                        and date_trunc('month', b.data) = m.mes), 0)
               ) order by m.mes)
          from meses m
      )
  ) into v_resultado;

  return v_resultado;
end;
$$;

revoke execute on function public.resumo_financeiro(date, date) from public, anon;
grant execute on function public.resumo_financeiro(date, date) to authenticated;
