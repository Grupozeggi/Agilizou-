-- =============================================================================
-- Etapa 9 — Relatórios e exportação
-- =============================================================================

-- Mais vendidos no período (produtos, serviços e itens avulsos).
create or replace function public.relatorio_mais_vendidos(p_inicio date, p_fim date, p_limite int default 50)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(x order by x.receita desc, x.descricao), '[]'::jsonb)
    from (
      select i.descricao,
             case when i.produto_id is not null then 'produto' when i.servico_id is not null then 'servico' else 'avulso' end as tipo,
             sum(i.quantidade)::float as quantidade,
             sum(i.subtotal_centavos)::bigint as receita,
             sum(round(i.custo_unitario_centavos * i.quantidade))::bigint as custo,
             (sum(i.subtotal_centavos) - sum(round(i.custo_unitario_centavos * i.quantidade)))::bigint as lucro,
             count(distinct v.id)::int as vendas
        from public.itens_venda i
        join public.vendas v on v.id = i.venda_id and v.empresa_id = i.empresa_id
       where v.empresa_id = public.empresa_atual()
         and v.deleted_at is null
         and v.data between p_inicio and p_fim
       group by coalesce(i.produto_id::text, i.servico_id::text, lower(i.descricao)), i.descricao, 2
       limit p_limite
    ) x;
$$;

-- Lucro mês a mês (regime de caixa, mesmo critério do resultado do mês).
create or replace function public.relatorio_lucro_mensal(p_fim date, p_meses int default 12)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with meses as (
    select generate_series(date_trunc('month', p_fim) - make_interval(months => least(greatest(p_meses, 1), 36) - 1),
                           date_trunc('month', p_fim), interval '1 month')::date as mes
  ),
  base as (
    select date_trunc('month', l.data)::date as mes, l.tipo, l.valor_centavos as v,
           case when l.tipo = 'entrada' then 'receita' else coalesce(nullif(c.grupo, 'receita'), 'despesa') end as grupo
      from public.lancamentos l
      left join public.categorias c on c.id = l.categoria_id and c.empresa_id = l.empresa_id
     where l.empresa_id = public.empresa_atual() and l.deleted_at is null and l.status = 'pago'
       and l.data >= (select min(mes) from meses) and l.data < (select max(mes) from meses) + interval '1 month'
  )
  select jsonb_agg(jsonb_build_object(
           'mes', to_char(t.mes, 'YYYY-MM'), 'receitas', t.receitas, 'custos', t.custos,
           'despesas', t.despesas, 'lucro', t.receitas - t.custos - t.despesas
         ) order by t.mes)
    from (
      select m.mes,
             coalesce(sum(b.v) filter (where b.grupo = 'receita'), 0) as receitas,
             coalesce(sum(b.v) filter (where b.grupo = 'custo'), 0) as custos,
             coalesce(sum(b.v) filter (where b.grupo = 'despesa'), 0) as despesas
        from meses m
        left join base b on b.mes = m.mes
       group by m.mes
    ) t;
$$;

revoke execute on function public.relatorio_mais_vendidos(date, date, int) from public, anon;
revoke execute on function public.relatorio_lucro_mensal(date, int) from public, anon;
grant execute on function public.relatorio_mais_vendidos(date, date, int) to authenticated;
grant execute on function public.relatorio_lucro_mensal(date, int) to authenticated;

-- Exportações feitas (limite mensal do plano Essencial).
create table public.exportacoes (
  id bigint generated always as identity primary key,
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  relatorio text not null,
  formato text not null check (formato in ('csv', 'pdf')),
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index exportacoes_empresa_mes_idx on public.exportacoes (empresa_id, criado_em);
alter table public.exportacoes enable row level security;
create policy exportacoes_select on public.exportacoes for select to authenticated
  using (empresa_id = public.empresa_atual() or public.eh_admin());
create policy exportacoes_insert on public.exportacoes for insert to authenticated
  with check (empresa_id = public.empresa_atual());
revoke update, delete, truncate on public.exportacoes from authenticated;
