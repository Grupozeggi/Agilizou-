-- =============================================================================
-- Código sequencial e código de barras dos produtos
-- =============================================================================
-- Todo produto ganha automaticamente:
--   codigo        número sequencial por empresa (1, 2, 3...), nunca muda
--   codigo_barras EAN-13 de uso interno ("20" + código com 10 dígitos + dígito
--                 verificador), a não ser que o dono informe o código que já
--                 vem na embalagem. Prefixos 20-29 são reservados pela GS1
--                 para uso interno da loja, então não colidem com produtos
--                 de mercado.
-- =============================================================================

-- Contadores por empresa (hoje só "produto"; serve para outros no futuro).
create table public.sequencias (
  empresa_id uuid not null references public.empresas (id),
  nome text not null,
  valor bigint not null default 0,
  primary key (empresa_id, nome)
);

-- Ninguém acessa direto: só a função abaixo (security definer).
alter table public.sequencias enable row level security;
revoke all on public.sequencias from anon, authenticated;

create or replace function public.proximo_numero(p_empresa uuid, p_nome text)
returns bigint
language sql
security definer
set search_path = ''
as $$
  -- Upsert atômico: duas inserções ao mesmo tempo nunca pegam o mesmo número.
  insert into public.sequencias as s (empresa_id, nome, valor)
  values (p_empresa, p_nome, 1)
  on conflict (empresa_id, nome) do update set valor = s.valor + 1
  returning valor;
$$;

revoke execute on function public.proximo_numero(uuid, text) from public, anon, authenticated;

-- Dígito verificador GTIN (EAN-8, UPC-A, EAN-13, GTIN-14), sem o último dígito.
create or replace function public.gtin_digito(p_corpo text)
returns int
language sql
immutable
set search_path = ''
as $$
  select (10 - (sum(
           substr(reverse(p_corpo), i, 1)::int * case when i % 2 = 1 then 3 else 1 end
         ) % 10)) % 10
    from generate_series(1, length(p_corpo)) as i;
$$;

alter table public.produtos
  add column codigo bigint,
  add column codigo_barras text
    check (codigo_barras ~ '^[0-9A-Za-z.\-]{1,48}$');

create unique index produtos_codigo_unico on public.produtos (empresa_id, codigo);
-- O mesmo código de barras não pode estar em dois produtos ativos da empresa.
create unique index produtos_codigo_barras_unico on public.produtos (empresa_id, codigo_barras)
  where deleted_at is null;

create or replace function public.preencher_codigos_produto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  corpo text;
begin
  if tg_op = 'INSERT' then
    -- O número é sempre do sistema; ignora o que vier do app.
    new.codigo := public.proximo_numero(new.empresa_id, 'produto');
    new.codigo_barras := nullif(trim(new.codigo_barras), '');
    if new.codigo_barras is null then
      corpo := '20' || lpad(new.codigo::text, 10, '0');
      new.codigo_barras := corpo || public.gtin_digito(corpo);
    end if;
  else
    if new.codigo is distinct from old.codigo then
      raise exception 'O código do produto não pode ser alterado.' using errcode = '42501';
    end if;
    -- Apagou o código de barras na edição: volta para o código interno.
    if nullif(trim(new.codigo_barras), '') is null then
      corpo := '20' || lpad(new.codigo::text, 10, '0');
      new.codigo_barras := corpo || public.gtin_digito(corpo);
    end if;
  end if;
  return new;
end;
$$;

create trigger produtos_codigos before insert or update on public.produtos
  for each row execute function public.preencher_codigos_produto();

alter table public.produtos alter column codigo set not null;
alter table public.produtos alter column codigo_barras set not null;
