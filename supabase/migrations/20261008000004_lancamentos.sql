-- =============================================================================
-- Etapa 3 — Lançamentos, contas a pagar e a receber
-- =============================================================================
-- Convenção das datas de um lançamento:
--   data        quando o dinheiro entrou/saiu (pago) ou quando vai entrar/sair
--               (pendente). É a data usada nas listas e no fluxo de caixa.
--   vencimento  data combinada para pagar/receber (guardada também depois de pago)
--   pago_em     dia em que foi pago/recebido (só quando status = 'pago')
-- =============================================================================

alter table public.lancamentos
  add constraint lancamentos_pago_tem_data check (status = 'pendente' or pago_em is not null),
  add constraint lancamentos_pendente_sem_pago_em check (status = 'pago' or pago_em is null);

-- Mantém as datas coerentes: pago sem pago_em usa a própria data;
-- pendente não tem pago_em e o vencimento padrão é a data.
create or replace function public.normalizar_lancamento()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pago' then
    new.pago_em := coalesce(new.pago_em, new.data);
  else
    new.pago_em := null;
    new.vencimento := coalesce(new.vencimento, new.data);
  end if;
  return new;
end;
$$;

create trigger lancamentos_normalizar before insert or update on public.lancamentos
  for each row execute function public.normalizar_lancamento();

create index lancamentos_grupo_idx on public.lancamentos (empresa_id, grupo_id) where grupo_id is not null;

-- A categoria precisa ser do mesmo tipo do lançamento (entrada com categoria
-- de entrada), senão o resultado do mês fica errado.
create or replace function public.validar_categoria_lancamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_tipo text;
begin
  if new.categoria_id is null then
    return new;
  end if;
  select tipo into v_tipo from public.categorias
   where id = new.categoria_id and empresa_id = new.empresa_id;
  -- Categoria de outra empresa: deixa a chave estrangeira recusar.
  if not found then
    return new;
  end if;
  if v_tipo <> new.tipo then
    raise exception 'A categoria escolhida não combina com o tipo do lançamento.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger lancamentos_validar_categoria before insert or update of tipo, categoria_id on public.lancamentos
  for each row execute function public.validar_categoria_lancamento();

-- Uso do limite "lançamentos por mês" do plano. Parcelado ou recorrente
-- conta como 1 (é um lançamento só, dividido em vários meses).
-- Excluídos continuam contando, para o limite não ser contornado.
create or replace function public.uso_lancamentos_mes()
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select count(distinct coalesce(l.grupo_id, l.id))::int
    from public.lancamentos l
   where l.empresa_id = public.empresa_atual()
     and l.criado_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
$$;

revoke execute on function public.uso_lancamentos_mes() from public, anon;
grant execute on function public.uso_lancamentos_mes() to authenticated;
