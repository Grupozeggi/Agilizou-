-- =============================================================================
-- Etapa 5 — Produtos, estoque e vendas
-- =============================================================================
-- Regras:
--   * O estoque de um produto só muda por movimentação (entrada, venda, perda,
--     ajuste). Update direto em produtos.estoque é recusado, então o histórico
--     sempre explica o número atual.
--   * Uma venda é registrada numa única transação (registrar_venda): itens,
--     baixa no estoque, custo de cada item e a entrada no caixa.
--   * Valores de item = round(preço × quantidade), meio centavo para cima.
-- =============================================================================

-- Número sequencial da venda por empresa (#1, #2...).
alter table public.vendas add column numero bigint;
alter table public.vendas add column categoria_id uuid;
alter table public.vendas add constraint vendas_categoria_fk
  foreign key (empresa_id, categoria_id) references public.categorias (empresa_id, id);
create unique index vendas_numero_unico on public.vendas (empresa_id, numero);

create or replace function public.numerar_venda()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.numero := public.proximo_numero(new.empresa_id, 'venda');
  return new;
end;
$$;

create trigger vendas_numerar before insert on public.vendas
  for each row execute function public.numerar_venda();

-- -----------------------------------------------------------------------------
-- Proteção do estoque
-- -----------------------------------------------------------------------------

create or replace function public.proteger_estoque()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estoque is distinct from old.estoque
     and coalesce(current_setting('agilizou.movimentando_estoque', true), '') <> '1' then
    raise exception 'Para mudar o estoque, registre uma entrada, perda ou ajuste.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger produtos_proteger_estoque before update on public.produtos
  for each row execute function public.proteger_estoque();

-- Estoque informado no cadastro vira a primeira movimentação.
create or replace function public.estoque_inicial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estoque <> 0 then
    insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario_centavos, observacao, criado_por)
    values (new.empresa_id, new.id, 'ajuste', new.estoque, new.custo_centavos, 'Estoque inicial', auth.uid());
  end if;
  return new;
end;
$$;

create trigger produtos_estoque_inicial after insert on public.produtos
  for each row execute function public.estoque_inicial();

-- -----------------------------------------------------------------------------
-- Movimentar estoque: entrada (compra), perda ou ajuste (contagem)
-- -----------------------------------------------------------------------------

create or replace function public.movimentar_estoque(
  p_produto uuid,
  p_tipo text,
  p_quantidade numeric,
  p_custo_unitario_centavos bigint default null,
  p_lancar_saida boolean default false,
  p_categoria uuid default null,
  p_forma_pagamento text default null,
  p_observacao text default null
)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_produto public.produtos;
  v_delta numeric;
  v_custo bigint;
begin
  -- Trava o produto: duas movimentações ao mesmo tempo viram fila.
  select * into v_produto from public.produtos
   where id = p_produto and deleted_at is null
   for update;
  if not found then
    raise exception 'Produto não encontrado.' using errcode = 'P0002';
  end if;
  if p_quantidade is null or p_quantidade < 0 or (p_tipo <> 'ajuste' and p_quantidade = 0) then
    raise exception 'Quantidade inválida.' using errcode = '22023';
  end if;

  v_delta := case p_tipo
    when 'entrada' then p_quantidade
    when 'perda' then -p_quantidade
    when 'ajuste' then p_quantidade - v_produto.estoque   -- p_quantidade = quantidade contada
    else null
  end;
  if v_delta is null then
    raise exception 'Tipo de movimentação inválido.' using errcode = '22023';
  end if;
  if v_delta = 0 then
    return v_produto.estoque;
  end if;

  v_custo := coalesce(p_custo_unitario_centavos, v_produto.custo_centavos);
  if v_custo < 0 then
    raise exception 'Custo inválido.' using errcode = '22023';
  end if;

  perform set_config('agilizou.movimentando_estoque', '1', true);
  update public.produtos
     set estoque = estoque + v_delta,
         -- compra com custo informado atualiza o custo do produto
         custo_centavos = case when p_tipo = 'entrada' and p_custo_unitario_centavos is not null
                               then p_custo_unitario_centavos else custo_centavos end
   where id = p_produto;
  perform set_config('agilizou.movimentando_estoque', '', true);

  insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario_centavos, observacao)
  values (v_produto.empresa_id, p_produto, p_tipo, v_delta, v_custo, nullif(trim(p_observacao), ''));

  -- Compra paga: lança a saída no caixa.
  if p_tipo = 'entrada' and p_lancar_saida and round(v_custo * p_quantidade) > 0 then
    insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, forma_pagamento, descricao, data, status)
    values (v_produto.empresa_id, 'saida', round(v_custo * p_quantidade)::bigint, p_categoria, p_forma_pagamento,
            left('Compra: ' || v_produto.nome, 140), public.hoje_sp(), 'pago');
  end if;

  return v_produto.estoque + v_delta;
end;
$$;

-- -----------------------------------------------------------------------------
-- Registrar venda
-- -----------------------------------------------------------------------------
-- p_venda = {
--   "data": "2026-10-08", "forma_pagamento": "pix", "desconto_centavos": 0,
--   "categoria_id": "...", "cliente_id": null, "observacao": null,
--   "itens": [ {"produto_id": "...", "quantidade": 2, "preco_unitario_centavos": 1990},
--              {"servico_id": "...", "quantidade": 1, "preco_unitario_centavos": 8000},
--              {"descricao": "Mão de obra", "quantidade": 1, "preco_unitario_centavos": 5000} ]
-- }
create or replace function public.registrar_venda(p_venda jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_atual();
  v_item jsonb;
  v_qtd numeric;
  v_preco bigint;
  v_custo bigint;
  v_desc text;
  v_produto public.produtos;
  v_servico public.servicos;
  v_subtotal bigint := 0;
  v_custo_total bigint := 0;
  v_desconto bigint := coalesce((p_venda ->> 'desconto_centavos')::bigint, 0);
  v_data date := coalesce((p_venda ->> 'data')::date, public.hoje_sp());
  v_venda uuid := gen_random_uuid();
  v_numero bigint;
  v_itens jsonb := '[]'::jsonb;
begin
  if v_empresa is null then
    raise exception 'Usuário sem empresa.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_venda -> 'itens') <> 'array' or jsonb_array_length(p_venda -> 'itens') = 0 then
    raise exception 'A venda precisa de pelo menos um item.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_venda -> 'itens') > 200 then
    raise exception 'Itens demais numa venda só.' using errcode = '22023';
  end if;

  -- 1) Confere cada item e calcula valores (preço e custo vêm do banco
  --    quando é produto/serviço; o preço pode ser ajustado na venda).
  for v_item in select * from jsonb_array_elements(p_venda -> 'itens') loop
    v_qtd := (v_item ->> 'quantidade')::numeric;
    v_preco := (v_item ->> 'preco_unitario_centavos')::bigint;
    if v_qtd is null or v_qtd <= 0 or v_qtd > 1000000 or v_preco is null or v_preco < 0 then
      raise exception 'Quantidade ou preço inválido.' using errcode = '22023';
    end if;

    v_custo := 0;
    v_desc := nullif(trim(v_item ->> 'descricao'), '');
    if v_item ? 'produto_id' and v_item ->> 'produto_id' is not null then
      select * into v_produto from public.produtos
       where id = (v_item ->> 'produto_id')::uuid and deleted_at is null
       for update;
      if not found then
        raise exception 'Produto não encontrado.' using errcode = 'P0002';
      end if;
      v_custo := v_produto.custo_centavos;
      v_desc := v_produto.nome;
    elsif v_item ? 'servico_id' and v_item ->> 'servico_id' is not null then
      select * into v_servico from public.servicos
       where id = (v_item ->> 'servico_id')::uuid and deleted_at is null;
      if not found then
        raise exception 'Serviço não encontrado.' using errcode = 'P0002';
      end if;
      v_custo := v_servico.custo_centavos;
      v_desc := v_servico.nome;
    elsif v_desc is null then
      raise exception 'Item sem descrição.' using errcode = '22023';
    end if;

    v_subtotal := v_subtotal + round(v_preco * v_qtd)::bigint;
    v_custo_total := v_custo_total + round(v_custo * v_qtd)::bigint;
    v_itens := v_itens || jsonb_build_object(
      'produto_id', v_item -> 'produto_id', 'servico_id', v_item -> 'servico_id',
      'descricao', left(v_desc, 140), 'quantidade', v_qtd, 'preco', v_preco, 'custo', v_custo,
      'subtotal', round(v_preco * v_qtd)::bigint);
  end loop;

  if v_desconto < 0 or v_desconto > v_subtotal then
    raise exception 'Desconto maior que o valor da venda.' using errcode = '22023';
  end if;

  -- 2) Venda
  insert into public.vendas (id, empresa_id, cliente_id, data, subtotal_centavos, desconto_centavos, total_centavos,
                             custo_total_centavos, forma_pagamento, categoria_id, observacao)
  values (v_venda, v_empresa, (p_venda ->> 'cliente_id')::uuid, v_data, v_subtotal, v_desconto,
          v_subtotal - v_desconto, v_custo_total, coalesce(p_venda ->> 'forma_pagamento', 'outro'),
          (p_venda ->> 'categoria_id')::uuid, nullif(trim(p_venda ->> 'observacao'), ''))
  returning numero into v_numero;

  -- 3) Itens e baixa no estoque
  perform set_config('agilizou.movimentando_estoque', '1', true);
  for v_item in select * from jsonb_array_elements(v_itens) loop
    insert into public.itens_venda (empresa_id, venda_id, produto_id, servico_id, descricao, quantidade,
                                    preco_unitario_centavos, custo_unitario_centavos, subtotal_centavos)
    values (v_empresa, v_venda, (v_item ->> 'produto_id')::uuid, (v_item ->> 'servico_id')::uuid,
            v_item ->> 'descricao', (v_item ->> 'quantidade')::numeric, (v_item ->> 'preco')::bigint,
            (v_item ->> 'custo')::bigint, (v_item ->> 'subtotal')::bigint);

    if v_item ->> 'produto_id' is not null then
      update public.produtos set estoque = estoque - (v_item ->> 'quantidade')::numeric
       where id = (v_item ->> 'produto_id')::uuid;
      insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario_centavos, venda_id)
      values (v_empresa, (v_item ->> 'produto_id')::uuid, 'venda', -(v_item ->> 'quantidade')::numeric,
              (v_item ->> 'custo')::bigint, v_venda);
    end if;
  end loop;
  perform set_config('agilizou.movimentando_estoque', '', true);

  -- 4) Entrada no caixa
  if v_subtotal - v_desconto > 0 then
    insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, forma_pagamento, descricao,
                                    data, status, venda_id, cliente_id)
    values (v_empresa, 'entrada', v_subtotal - v_desconto, (p_venda ->> 'categoria_id')::uuid,
            p_venda ->> 'forma_pagamento', 'Venda #' || v_numero, v_data, 'pago', v_venda,
            (p_venda ->> 'cliente_id')::uuid);
  end if;

  return v_venda;
end;
$$;

-- Cancelar venda: devolve o estoque e tira a entrada do caixa (exclusão lógica).
create or replace function public.cancelar_venda(p_venda uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item record;
  v_venda public.vendas;
begin
  select * into v_venda from public.vendas where id = p_venda and deleted_at is null for update;
  if not found then
    raise exception 'Venda não encontrada.' using errcode = 'P0002';
  end if;

  perform set_config('agilizou.movimentando_estoque', '1', true);
  for v_item in select * from public.itens_venda where venda_id = p_venda and produto_id is not null loop
    update public.produtos set estoque = estoque + v_item.quantidade where id = v_item.produto_id;
    insert into public.movimentacoes_estoque (empresa_id, produto_id, tipo, quantidade, custo_unitario_centavos, venda_id, observacao)
    values (v_venda.empresa_id, v_item.produto_id, 'ajuste', v_item.quantidade, v_item.custo_unitario_centavos, p_venda,
            'Venda #' || v_venda.numero || ' cancelada');
  end loop;
  perform set_config('agilizou.movimentando_estoque', '', true);

  update public.vendas set deleted_at = now() where id = p_venda;
  update public.lancamentos set deleted_at = now() where venda_id = p_venda and deleted_at is null;
end;
$$;

revoke execute on function public.movimentar_estoque(uuid, text, numeric, bigint, boolean, uuid, text, text) from public, anon;
revoke execute on function public.registrar_venda(jsonb) from public, anon;
revoke execute on function public.cancelar_venda(uuid) from public, anon;
grant execute on function public.movimentar_estoque(uuid, text, numeric, bigint, boolean, uuid, text, text) to authenticated;
grant execute on function public.registrar_venda(jsonb) to authenticated;
grant execute on function public.cancelar_venda(uuid) to authenticated;

-- Venda é histórico: depois de registrada, só pode ser cancelada
-- (deleted_at). Valores e itens não mudam.
drop policy if exists itens_venda_update on public.itens_venda;

create or replace function public.proteger_venda()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'deleted_at') is distinct from (to_jsonb(old) - 'deleted_at') then
    raise exception 'Venda registrada não pode ser alterada. Cancele e lance de novo.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger vendas_proteger before update on public.vendas
  for each row execute function public.proteger_venda();

create index produtos_estoque_baixo_idx on public.produtos (empresa_id)
  where deleted_at is null and estoque_minimo > 0;
create index itens_venda_venda_idx on public.itens_venda (venda_id);
create index movimentacoes_produto_idx on public.movimentacoes_estoque (produto_id, criado_em desc);
