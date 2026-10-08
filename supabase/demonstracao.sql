-- =============================================================================
-- Agilizou — DADOS DE DEMONSTRAÇÃO (só para projetos de teste!)
-- =============================================================================
-- Como usar (Supabase → SQL Editor):
--   1. Rode este arquivo inteiro uma vez (ele só cria a função).
--   2. Cadastre-se no app com o e-mail que vai usar para testar.
--   3. Rode:   select preencher_demonstracao('seu-email@exemplo.com');
--   4. Atualize o app: a conta vira a "Barbearia do Zé (demonstração)" com
--      6 meses de vendas, despesas, estoque, clientes, agenda e contas.
--
-- A conta fica no plano Profissional, em teste por 30 dias.
-- Não rode em produção: os dados são fictícios.
-- =============================================================================

create or replace function public.preencher_demonstracao(p_email text)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_usuario uuid;
  v_empresa uuid;
  v_hoje date := public.hoje_sp();
  v_cat jsonb := '[
    {"tipo":"entrada","grupo":"receita","nome":"Serviço"},
    {"tipo":"entrada","grupo":"receita","nome":"Venda de produto"},
    {"tipo":"entrada","grupo":"receita","nome":"Outras entradas"},
    {"tipo":"saida","grupo":"custo","nome":"Produtos"},
    {"tipo":"saida","grupo":"custo","nome":"Comissão"},
    {"tipo":"saida","grupo":"despesa","nome":"Aluguel"},
    {"tipo":"saida","grupo":"despesa","nome":"Água, luz e internet"},
    {"tipo":"saida","grupo":"despesa","nome":"Outras saídas"}
  ]';
  c_servico uuid; c_produto_venda uuid; c_produtos uuid; c_comissao uuid; c_aluguel uuid; c_contas uuid;
  p_ze uuid; p_carla uuid;
  s_corte uuid; s_barba uuid; s_combo uuid; s_pigm uuid;
  v_servicos uuid[];
  v_produtos uuid[] := '{}';
  v_clientes uuid[] := '{}';
  v_id uuid;
  v_mes int;
  v_dia date;
  v_inicio_mes date;
  v_qtd int;
  i int;
  v_serv uuid;
  v_preco bigint;
  v_itens jsonb;
  v_formas text[] := array['pix', 'pix', 'dinheiro', 'cartao_debito', 'cartao_credito'];
  v_nomes text[] := array['Ana Souza', 'Bruno Lima', 'Carlos Pereira', 'Diego Santos', 'Eduardo Rocha', 'Fábio Alves', 'Gustavo Melo', 'Marcos Dias'];
  v_hora time;
  v_status text;
begin
  select u.id into v_usuario from auth.users u where lower(u.email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'Nenhum usuário com o e-mail %. Cadastre-se no app primeiro.', p_email;
  end if;
  select empresa_id into v_empresa from public.perfis where id = v_usuario;
  if v_empresa is null then
    raise exception 'Este usuário não tem empresa (é admin?).';
  end if;
  if exists (select 1 from public.lancamentos where empresa_id = v_empresa) then
    raise exception 'Esta conta já tem lançamentos. Use uma conta nova para a demonstração.';
  end if;

  -- Age "como o usuário": as funções do app usam auth.uid() / empresa_atual().
  perform set_config('request.jwt.claims', json_build_object('sub', v_usuario, 'role', 'authenticated')::text, true);

  -- Onboarding (salão/barbearia, saldo inicial R$ 2.500,00)
  update public.empresas set onboarding_concluido = false where id = v_empresa;
  perform public.concluir_onboarding('Barbearia do Zé (demonstração)', 'salao', 250000, true, v_cat);
  select id into c_servico from public.categorias where empresa_id = v_empresa and nome = 'Serviço';
  select id into c_produto_venda from public.categorias where empresa_id = v_empresa and nome = 'Venda de produto';
  select id into c_produtos from public.categorias where empresa_id = v_empresa and nome = 'Produtos';
  select id into c_comissao from public.categorias where empresa_id = v_empresa and nome = 'Comissão';
  select id into c_aluguel from public.categorias where empresa_id = v_empresa and nome = 'Aluguel';
  select id into c_contas from public.categorias where empresa_id = v_empresa and nome = 'Água, luz e internet';

  -- Profissionais e serviços
  insert into public.profissionais (empresa_id, nome) values (v_empresa, 'Zé') returning id into p_ze;
  insert into public.profissionais (empresa_id, nome) values (v_empresa, 'Carla') returning id into p_carla;
  insert into public.servicos (empresa_id, nome, preco_centavos, custo_centavos, duracao_minutos) values (v_empresa, 'Corte', 4500, 0, 30) returning id into s_corte;
  insert into public.servicos (empresa_id, nome, preco_centavos, custo_centavos, duracao_minutos) values (v_empresa, 'Barba', 3000, 0, 20) returning id into s_barba;
  insert into public.servicos (empresa_id, nome, preco_centavos, custo_centavos, duracao_minutos) values (v_empresa, 'Corte + barba', 7000, 0, 50) returning id into s_combo;
  insert into public.servicos (empresa_id, nome, preco_centavos, custo_centavos, duracao_minutos) values (v_empresa, 'Pigmentação', 6000, 800, 40) returning id into s_pigm;
  v_servicos := array[s_corte, s_corte, s_combo, s_barba, s_corte, s_pigm, s_combo];

  -- Produtos (estoque inicial; o código de barras é gerado sozinho)
  insert into public.produtos (empresa_id, nome, custo_centavos, preco_centavos, estoque, estoque_minimo) values
    (v_empresa, 'Pomada modeladora', 1800, 3990, 30, 5),
    (v_empresa, 'Óleo para barba', 2200, 4990, 30, 4),
    (v_empresa, 'Shampoo anticaspa', 1500, 3490, 30, 5),
    (v_empresa, 'Cera capilar', 1200, 2990, 30, 3);
  select array_agg(id order by nome) into v_produtos from public.produtos where empresa_id = v_empresa;

  -- Clientes (um deles pediu para não receber mensagens)
  for i in 1 .. array_length(v_nomes, 1) loop
    insert into public.clientes (empresa_id, nome, whatsapp, aceita_mensagens)
    values (v_empresa, v_nomes[i], '55119' || lpad((87650000 + i * 1111)::text, 8, '0'), i <> 6)
    returning id into v_id;
    v_clientes := v_clientes || v_id;
  end loop;

  -- 6 meses de movimento (do mais antigo para o atual)
  for v_mes in reverse 5 .. 0 loop
    v_inicio_mes := (date_trunc('month', v_hoje) - make_interval(months => v_mes))::date;

    -- Despesas fixas do mês (pagas)
    if v_inicio_mes + 4 <= v_hoje then
      insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, descricao, data, status, forma_pagamento)
      values (v_empresa, 'saida', 180000, c_aluguel, 'Aluguel do salão', v_inicio_mes + 4, 'pago', 'pix');
    end if;
    if v_inicio_mes + 9 <= v_hoje then
      insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, descricao, data, status, forma_pagamento)
      values (v_empresa, 'saida', 26000 + v_mes * 1300, c_contas, 'Energia e internet', v_inicio_mes + 9, 'pago', 'boleto');
    end if;
    -- Compra de produtos no começo do mês (vira saída no caixa)
    if v_inicio_mes + 2 <= v_hoje then
      for i in 1 .. 4 loop
        perform public.movimentar_estoque(v_produtos[i], 'entrada', 12, null, true, c_produtos, 'pix', 'Reposição');
      end loop;
      update public.lancamentos set data = v_inicio_mes + 2, pago_em = v_inicio_mes + 2
       where empresa_id = v_empresa and descricao like 'Compra:%' and data = v_hoje and v_mes > 0;
    end if;

    -- Vendas: o movimento cresce mês a mês
    v_qtd := 95 + (5 - v_mes) * 12;
    for i in 1 .. v_qtd loop
      v_dia := v_inicio_mes + ((i * 7) % 27);
      continue when v_dia > v_hoje;
      v_serv := v_servicos[1 + (i % array_length(v_servicos, 1))];
      select preco_centavos into v_preco from public.servicos where id = v_serv;
      v_itens := jsonb_build_array(jsonb_build_object('servico_id', v_serv, 'quantidade', 1, 'preco_unitario_centavos', v_preco));
      if i % 3 = 0 then
        v_itens := v_itens || jsonb_build_array(jsonb_build_object(
          'produto_id', v_produtos[1 + (i % 4)], 'quantidade', 1,
          'preco_unitario_centavos', (select preco_centavos from public.produtos where id = v_produtos[1 + (i % 4)])));
      end if;
      perform public.registrar_venda(jsonb_build_object(
        'data', v_dia,
        'forma_pagamento', v_formas[1 + (i % 5)],
        'categoria_id', c_servico,
        'cliente_id', v_clientes[1 + (i % 8)],
        'desconto_centavos', case when i % 10 = 0 then 500 else 0 end,
        'itens', v_itens));
    end loop;

    -- Comissão da Carla no fim do mês (meses já fechados)
    if v_mes > 0 then
      insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, descricao, data, status, forma_pagamento)
      values (v_empresa, 'saida', 85000 + (5 - v_mes) * 9000, c_comissao, 'Comissão da Carla',
              (v_inicio_mes + interval '1 month - 1 day')::date, 'pago', 'pix');
    end if;
  end loop;

  -- Estoque final: dois produtos ficam abaixo do mínimo (alerta de estoque baixo)
  perform public.movimentar_estoque(v_produtos[1], 'ajuste', 12);
  perform public.movimentar_estoque(v_produtos[2], 'ajuste', 3);
  perform public.movimentar_estoque(v_produtos[3], 'ajuste', 18);
  perform public.movimentar_estoque(v_produtos[4], 'ajuste', 2);

  -- Contas a pagar e a receber (vencida, vencendo, futuras)
  insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, descricao, data, vencimento, status) values
    (v_empresa, 'saida', 31900, c_contas, 'Conta de luz', v_hoje - 3, v_hoje - 3, 'pendente'),
    (v_empresa, 'saida', 64000, c_produtos, 'Fornecedor de produtos', v_hoje + 4, v_hoje + 4, 'pendente'),
    (v_empresa, 'saida', 180000, c_aluguel, 'Aluguel do salão', (date_trunc('month', v_hoje) + interval '1 month 4 days')::date,
                (date_trunc('month', v_hoje) + interval '1 month 4 days')::date, 'pendente');
  insert into public.lancamentos (empresa_id, tipo, valor_centavos, categoria_id, descricao, data, vencimento, status, cliente_id) values
    (v_empresa, 'entrada', 14000, c_servico, 'Corte + barba (fiado)', v_hoje + 1, v_hoje + 1, 'pendente', v_clientes[8]),
    (v_empresa, 'entrada', 4500, c_servico, 'Corte (fiado)', v_hoje - 2, v_hoje - 2, 'pendente', v_clientes[3]);

  -- Lembretes
  insert into public.lembretes (empresa_id, titulo, data, tipo, valor_centavos, cliente_id) values
    (v_empresa, 'Ligar para o contador', v_hoje, 'outro', null, null),
    (v_empresa, 'Cobrar o Marcos', v_hoje + 2, 'cobrar', 14000, v_clientes[8]),
    (v_empresa, 'Pagar fornecedor de toalhas', v_hoje + 5, 'pagar', 12000, null);

  -- Agenda: semana passada (presenças e faltas), hoje e amanhã
  for i in 1 .. 14 loop
    v_dia := v_hoje - (1 + (i % 6));
    v_hora := ('09:00'::time + make_interval(mins => 60 * (i % 8)));
    v_status := case when i % 5 = 0 then 'faltou' else 'compareceu' end;
    v_serv := v_servicos[1 + (i % array_length(v_servicos, 1))];
    insert into public.agendamentos (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, status)
    select v_empresa, v_clientes[1 + (i % 8)], case when i % 2 = 0 then p_ze else p_carla end, v_serv,
           (v_dia + v_hora) at time zone 'America/Sao_Paulo',
           (v_dia + v_hora) at time zone 'America/Sao_Paulo' + make_interval(mins => s.duracao_minutos), v_status
      from public.servicos s where s.id = v_serv
    on conflict do nothing;
  end loop;
  for i in 0 .. 1 loop
    v_dia := v_hoje + i;
    insert into public.agendamentos (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, status) values
      (v_empresa, v_clientes[1 + i], p_ze, s_corte, (v_dia + time '10:00') at time zone 'America/Sao_Paulo', (v_dia + time '10:30') at time zone 'America/Sao_Paulo', 'confirmado'),
      (v_empresa, v_clientes[3 + i], p_ze, s_combo, (v_dia + time '14:00') at time zone 'America/Sao_Paulo', (v_dia + time '14:50') at time zone 'America/Sao_Paulo', 'agendado'),
      (v_empresa, v_clientes[5 + i], p_carla, s_barba, (v_dia + time '11:00') at time zone 'America/Sao_Paulo', (v_dia + time '11:20') at time zone 'America/Sao_Paulo', 'agendado'),
      (v_empresa, v_clientes[7], p_carla, s_pigm, (v_dia + time '16:00') at time zone 'America/Sao_Paulo', (v_dia + time '16:40') at time zone 'America/Sao_Paulo', 'agendado');
  end loop;

  -- Volta a ser o "dono do banco" para ajustar o plano (campo protegido)
  perform set_config('request.jwt.claims', '', true);
  update public.empresas
     set plano = 'profissional',
         status_assinatura = 'teste',
         teste_ate = now() + interval '30 days',
         whatsapp_ativo = true
   where id = v_empresa;

  return 'Pronto! Atualize o app: a conta ' || p_email || ' agora é a Barbearia do Zé (demonstração).';
end;
$$;

revoke execute on function public.preencher_demonstracao(text) from public, anon, authenticated, service_role;
