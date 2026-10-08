-- =============================================================================
-- Agilizou — instalação completa do banco (gerado por scripts/juntar-sql.mjs)
-- Supabase → SQL Editor → cole este arquivo inteiro → Run. Rode uma vez só,
-- num projeto novo. NÃO edite à mão: altere as migrations e rode
-- `npm run sql:juntar`.
-- =============================================================================

-- >>> 20261008000001_estrutura_inicial.sql
-- =============================================================================
-- Agilizou — estrutura inicial do banco
-- =============================================================================
-- Regras de ouro deste arquivo:
--   1. Toda tabela de negócio tem empresa_id e RLS ligada. Cada empresa só
--      enxerga e altera as próprias linhas.
--   2. Dinheiro é sempre bigint em centavos. Nunca float/numeric para R$.
--   3. Nada é apagado de verdade: exclusão lógica com deleted_at.
--   4. Admin (equipe da agência) é identificado SOMENTE por app_metadata.role,
--      que o usuário não consegue editar, e precisa estar com 2FA (aal2).
--   5. Toda alteração feita por admin é registrada em log_admin por gatilho,
--      então não depende de o código da aplicação lembrar de registrar.
-- =============================================================================

create extension if not exists btree_gist with schema extensions;

-- -----------------------------------------------------------------------------
-- Funções auxiliares de identidade
-- -----------------------------------------------------------------------------

-- Admin = app_metadata.role = 'admin' E sessão com 2FA concluída (aal2).
-- app_metadata só pode ser alterado com a chave service_role, nunca pelo usuário.
create or replace function public.eh_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
     and coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

-- Chamada feita pelo servidor com a chave service_role (webhooks, cron, admin).
create or replace function public.eh_servidor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

-- O servidor marca requisições do "modo suporte" com o cabeçalho x-modo-suporte.
-- O PostgREST expõe os cabeçalhos da requisição em request.headers.
create or replace function public.em_modo_suporte()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('request.headers', true), '')::json ->> 'x-modo-suporte',
    ''
  ) = '1';
$$;

-- Atualiza atualizado_em automaticamente.
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Empresas e perfis
-- -----------------------------------------------------------------------------

create table public.empresas (
  id uuid primary key default gen_random_uuid(),
  nome text not null default 'Minha empresa' check (char_length(nome) between 1 and 120),
  nicho text not null default 'outro'
    check (nicho in ('mecanica', 'odontologia', 'salao', 'varejo', 'outro')),
  saldo_inicial_centavos bigint not null default 0,
  onboarding_concluido boolean not null default false,
  agenda_ativa boolean not null default false,

  -- Campos protegidos: só o servidor (webhook do Asaas) ou admin alteram.
  plano text not null default 'essencial' check (plano in ('essencial', 'profissional')),
  status_assinatura text not null default 'teste'
    check (status_assinatura in ('teste', 'ativo', 'inadimplente', 'cancelado', 'suspenso')),
  teste_ate timestamptz not null default (now() + interval '7 days'),
  limites_personalizados jsonb,
  asaas_cliente_id text,
  asaas_assinatura_id text,
  proxima_cobranca date,

  ultimo_acesso_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger empresas_atualizado_em before update on public.empresas
  for each row execute function public.tocar_atualizado_em();

-- Um usuário pertence a uma empresa. O id é o mesmo de auth.users.
create table public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  empresa_id uuid not null references public.empresas (id),
  nome text,
  email text not null,
  criado_em timestamptz not null default now()
);

create index perfis_empresa_idx on public.perfis (empresa_id);

-- Empresa do usuário logado. security definer para poder ler perfis sem
-- depender das políticas de perfis (evita recursão de RLS).
create or replace function public.empresa_atual()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.empresa_id from public.perfis p where p.id = auth.uid();
$$;

-- Impede o cliente de mudar plano, status, limites e datas de cobrança.
create or replace function public.proteger_campos_empresa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.eh_servidor() or public.eh_admin() then
    return new;
  end if;
  if new.plano is distinct from old.plano
     or new.status_assinatura is distinct from old.status_assinatura
     or new.teste_ate is distinct from old.teste_ate
     or new.limites_personalizados is distinct from old.limites_personalizados
     or new.asaas_cliente_id is distinct from old.asaas_cliente_id
     or new.asaas_assinatura_id is distinct from old.asaas_assinatura_id
     or new.proxima_cobranca is distinct from old.proxima_cobranca
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Você não tem permissão para alterar os dados da assinatura.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger empresas_proteger_campos before update on public.empresas
  for each row execute function public.proteger_campos_empresa();

-- -----------------------------------------------------------------------------
-- Cadastro: todo usuário novo ganha a própria empresa em teste de 7 dias.
-- Nunca vira admin: o papel vem só de raw_app_meta_data, que o cadastro
-- público não consegue definir. Admins são criados manualmente e não ganham
-- empresa.
-- -----------------------------------------------------------------------------

create or replace function public.criar_empresa_no_cadastro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nova_empresa uuid;
  nome_empresa text;
begin
  if coalesce(new.raw_app_meta_data ->> 'role', '') = 'admin' then
    return new;
  end if;

  nome_empresa := left(nullif(trim(new.raw_user_meta_data ->> 'nome_empresa'), ''), 120);

  insert into public.empresas (nome)
  values (coalesce(nome_empresa, 'Minha empresa'))
  returning id into nova_empresa;

  insert into public.perfis (id, empresa_id, nome, email)
  values (
    new.id,
    nova_empresa,
    left(nullif(trim(new.raw_user_meta_data ->> 'nome'), ''), 120),
    new.email
  );

  return new;
end;
$$;

create trigger ao_criar_usuario
  after insert on auth.users
  for each row execute function public.criar_empresa_no_cadastro();

-- -----------------------------------------------------------------------------
-- Tabelas de negócio
-- Todas têm: empresa_id com padrão = empresa do usuário logado, e
-- unique (empresa_id, id) para permitir chaves estrangeiras compostas.
-- As FKs compostas garantem no banco que um lançamento nunca aponta para a
-- categoria/cliente/produto de OUTRA empresa.
-- -----------------------------------------------------------------------------

create table public.categorias (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  tipo text not null check (tipo in ('entrada', 'saida')),
  -- grupo usado no resultado do mês (DRE simples)
  grupo text not null check (grupo in ('receita', 'custo', 'despesa')),
  nome text not null check (char_length(nome) between 1 and 60),
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  check ((tipo = 'entrada' and grupo = 'receita') or (tipo = 'saida' and grupo in ('custo', 'despesa')))
);

create table public.clientes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome text not null check (char_length(nome) between 1 and 120),
  -- só dígitos, com DDI (ex.: 5511999998888)
  whatsapp text check (whatsapp ~ '^[0-9]{10,15}$'),
  observacoes text,
  aceita_mensagens boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create table public.produtos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome text not null check (char_length(nome) between 1 and 120),
  unidade text not null default 'un' check (char_length(unidade) between 1 and 10),
  custo_centavos bigint not null default 0 check (custo_centavos >= 0),
  preco_centavos bigint not null default 0 check (preco_centavos >= 0),
  -- quantidade não é dinheiro; numeric permite kg, litro etc.
  estoque numeric(14, 3) not null default 0,
  estoque_minimo numeric(14, 3) not null default 0 check (estoque_minimo >= 0),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create table public.profissionais (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome text not null check (char_length(nome) between 1 and 120),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create table public.servicos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  nome text not null check (char_length(nome) between 1 and 120),
  preco_centavos bigint not null default 0 check (preco_centavos >= 0),
  custo_centavos bigint not null default 0 check (custo_centavos >= 0),
  duracao_minutos int not null default 30 check (duracao_minutos between 5 and 720),
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id)
);

create table public.vendas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  cliente_id uuid,
  data date not null default current_date,
  subtotal_centavos bigint not null check (subtotal_centavos >= 0),
  desconto_centavos bigint not null default 0 check (desconto_centavos >= 0),
  total_centavos bigint not null check (total_centavos >= 0),
  custo_total_centavos bigint not null default 0 check (custo_total_centavos >= 0),
  forma_pagamento text not null,
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id),
  check (total_centavos = subtotal_centavos - desconto_centavos)
);

create table public.itens_venda (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  venda_id uuid not null,
  produto_id uuid,
  servico_id uuid,
  descricao text not null,
  quantidade numeric(14, 3) not null check (quantidade > 0),
  preco_unitario_centavos bigint not null check (preco_unitario_centavos >= 0),
  custo_unitario_centavos bigint not null default 0 check (custo_unitario_centavos >= 0),
  subtotal_centavos bigint not null check (subtotal_centavos >= 0),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id),
  foreign key (empresa_id, servico_id) references public.servicos (empresa_id, id),
  check (num_nonnulls(produto_id, servico_id) <= 1)
);

create table public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  tipo text not null check (tipo in ('entrada', 'saida')),
  valor_centavos bigint not null check (valor_centavos > 0),
  categoria_id uuid,
  descricao text,
  observacao text,
  forma_pagamento text
    check (forma_pagamento in ('dinheiro', 'pix', 'cartao_credito', 'cartao_debito', 'boleto', 'transferencia', 'outro')),
  -- status: pago (entrada recebida / saída paga) ou pendente
  status text not null default 'pago' check (status in ('pago', 'pendente')),
  data date not null default current_date,   -- data do pagamento ou previsão
  vencimento date,                            -- obrigatório quando pendente
  pago_em date,
  cliente_id uuid,
  venda_id uuid,
  -- recorrência e parcelamento
  grupo_id uuid,                              -- liga parcelas/recorrências da mesma série
  parcela_numero int,
  parcela_total int,
  recorrente boolean not null default false,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  foreign key (empresa_id, categoria_id) references public.categorias (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id),
  check (status = 'pago' or vencimento is not null),
  check (parcela_numero is null or (parcela_numero between 1 and parcela_total))
);

create index lancamentos_empresa_data_idx on public.lancamentos (empresa_id, data) where deleted_at is null;
create index lancamentos_pendentes_idx on public.lancamentos (empresa_id, vencimento)
  where status = 'pendente' and deleted_at is null;

create table public.movimentacoes_estoque (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  produto_id uuid not null,
  tipo text not null check (tipo in ('entrada', 'venda', 'perda', 'ajuste')),
  -- positivo entra no estoque, negativo sai
  quantidade numeric(14, 3) not null check (quantidade <> 0),
  custo_unitario_centavos bigint check (custo_unitario_centavos >= 0),
  venda_id uuid,
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  foreign key (empresa_id, produto_id) references public.produtos (empresa_id, id),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id)
);

create table public.agendamentos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  cliente_id uuid not null,
  profissional_id uuid not null,
  servico_id uuid,
  inicio timestamptz not null,
  fim timestamptz not null,
  status text not null default 'agendado'
    check (status in ('agendado', 'confirmado', 'compareceu', 'faltou', 'cancelado', 'remarcado')),
  venda_id uuid,
  observacao text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id),
  foreign key (empresa_id, profissional_id) references public.profissionais (empresa_id, id),
  foreign key (empresa_id, servico_id) references public.servicos (empresa_id, id),
  foreign key (empresa_id, venda_id) references public.vendas (empresa_id, id),
  check (fim > inicio),
  -- Impede conflito de horário do mesmo profissional (ignora cancelados,
  -- remarcados e excluídos).
  constraint agendamentos_sem_conflito exclude using gist (
    profissional_id with =,
    tstzrange(inicio, fim) with &&
  ) where (status not in ('cancelado', 'remarcado') and deleted_at is null)
);

create table public.lembretes (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.empresa_atual() references public.empresas (id),
  titulo text not null check (char_length(titulo) between 1 and 140),
  data date not null,
  valor_centavos bigint check (valor_centavos > 0),
  tipo text not null default 'outro' check (tipo in ('pagar', 'cobrar', 'outro')),
  feito boolean not null default false,
  cliente_id uuid,
  criado_em timestamptz not null default now(),
  deleted_at timestamptz,
  unique (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id)
);

create table public.mensagens_whatsapp (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas (id),
  agendamento_id uuid,
  cliente_id uuid,
  etapa text not null,
  telefone text not null,
  conteudo text not null,
  status text not null default 'pendente'
    check (status in ('pendente', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada')),
  tentativas int not null default 0,
  erro text,
  provedor_mensagem_id text,
  agendado_para timestamptz not null,
  enviado_em timestamptz,
  custo_estimado_centavos bigint not null default 0,
  criado_em timestamptz not null default now(),
  foreign key (empresa_id, agendamento_id) references public.agendamentos (empresa_id, id),
  foreign key (empresa_id, cliente_id) references public.clientes (empresa_id, id)
);

create index mensagens_fila_idx on public.mensagens_whatsapp (agendado_para) where status = 'pendente';

-- Gatilhos de atualizado_em
create trigger clientes_atualizado_em before update on public.clientes
  for each row execute function public.tocar_atualizado_em();
create trigger produtos_atualizado_em before update on public.produtos
  for each row execute function public.tocar_atualizado_em();
create trigger lancamentos_atualizado_em before update on public.lancamentos
  for each row execute function public.tocar_atualizado_em();
create trigger agendamentos_atualizado_em before update on public.agendamentos
  for each row execute function public.tocar_atualizado_em();

-- -----------------------------------------------------------------------------
-- Auditoria
-- -----------------------------------------------------------------------------

-- Toda ação de admin. Ninguém edita nem apaga (nem o próprio admin).
create table public.log_admin (
  id bigint generated always as identity primary key,
  admin_id uuid not null,
  admin_email text,
  empresa_id uuid,
  acao text not null,
  tabela text,
  registro_id text,
  valor_anterior jsonb,
  valor_novo jsonb,
  modo_suporte boolean not null default false,
  criado_em timestamptz not null default now()
);

create index log_admin_empresa_idx on public.log_admin (empresa_id, criado_em desc);

-- Tentativas de acesso negado (ex.: cliente tentando abrir /admin).
create table public.log_acesso_negado (
  id bigint generated always as identity primary key,
  usuario_id uuid,
  email text,
  rota text not null,
  motivo text not null,
  ip text,
  criado_em timestamptz not null default now()
);

create or replace function public.bloquear_alteracao_log()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Registros de auditoria não podem ser alterados nem apagados.'
    using errcode = '42501';
end;
$$;

create trigger log_admin_imutavel before update or delete on public.log_admin
  for each row execute function public.bloquear_alteracao_log();
create trigger log_admin_sem_truncate before truncate on public.log_admin
  for each statement execute function public.bloquear_alteracao_log();
create trigger log_acesso_negado_imutavel before update or delete on public.log_acesso_negado
  for each row execute function public.bloquear_alteracao_log();

-- Registra automaticamente qualquer insert/update/delete feito por admin.
create or replace function public.auditar_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  depois jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
  linha jsonb := coalesce(depois, antes);
begin
  if public.eh_admin() then
    insert into public.log_admin
      (admin_id, admin_email, empresa_id, acao, tabela, registro_id, valor_anterior, valor_novo, modo_suporte)
    values (
      auth.uid(),
      auth.jwt() ->> 'email',
      coalesce((linha ->> 'empresa_id')::uuid, case when tg_table_name = 'empresas' then (linha ->> 'id')::uuid end),
      lower(tg_op),
      tg_table_name,
      linha ->> 'id',
      antes,
      depois,
      public.em_modo_suporte()
    );
  end if;
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.empresas enable row level security;
alter table public.perfis enable row level security;
alter table public.log_admin enable row level security;
alter table public.log_acesso_negado enable row level security;

-- Empresa: o cliente vê e edita só a própria. Admin (com 2FA) vê e edita todas.
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.empresa_atual() or public.eh_admin());
create policy empresas_update on public.empresas for update to authenticated
  using (id = public.empresa_atual() or public.eh_admin())
  with check (id = public.empresa_atual() or public.eh_admin());
-- Sem insert/delete para clientes: empresa nasce no cadastro e nunca é apagada.

-- Perfil: o usuário vê o próprio; admin vê todos.
create policy perfis_select on public.perfis for select to authenticated
  using (id = auth.uid() or public.eh_admin());

-- Logs: só admin lê. Ninguém insere pelo app (gatilho/servidor fazem isso).
create policy log_admin_select on public.log_admin for select to authenticated
  using (public.eh_admin());
create policy log_acesso_negado_select on public.log_acesso_negado for select to authenticated
  using (public.eh_admin());

-- Mesmas 3 políticas para todas as tabelas de negócio.
-- Não há política de delete: exclusão é lógica (update de deleted_at).
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
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated
         using (empresa_id = public.empresa_atual() or public.eh_admin())',
      t || '_select', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (empresa_id = public.empresa_atual() or public.eh_admin())',
      t || '_insert', t);
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (empresa_id = public.empresa_atual() or public.eh_admin())
         with check (empresa_id = public.empresa_atual() or public.eh_admin())',
      t || '_update', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I
         for each row execute function public.auditar_admin()',
      t || '_auditar_admin', t);
  end loop;
end;
$$;

create trigger empresas_auditar_admin after update on public.empresas
  for each row execute function public.auditar_admin();

-- Mensagens de WhatsApp são criadas e atualizadas pela fila no servidor;
-- o cliente só lê.
drop policy mensagens_whatsapp_insert on public.mensagens_whatsapp;
drop policy mensagens_whatsapp_update on public.mensagens_whatsapp;

-- Movimentação de estoque é histórico: não se edita, só se cria outra.
drop policy movimentacoes_estoque_update on public.movimentacoes_estoque;

-- -----------------------------------------------------------------------------
-- Permissões de tabela (RLS decide as linhas; aqui decidimos as operações)
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
revoke delete, truncate on all tables in schema public from authenticated;
revoke insert, update, delete, truncate on public.log_admin, public.log_acesso_negado from authenticated, service_role;
grant insert on public.log_admin, public.log_acesso_negado to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke execute on function public.criar_empresa_no_cadastro() from public, anon, authenticated;
revoke execute on function public.auditar_admin() from public, anon, authenticated;

-- >>> 20261008000002_onboarding.sql
-- =============================================================================
-- Etapa 2 — Onboarding
-- =============================================================================

-- Não deixa duas categorias ativas com o mesmo nome e tipo na mesma empresa.
create unique index categorias_nome_unico on public.categorias (empresa_id, tipo, lower(nome))
  where deleted_at is null;

-- Conclui o onboarding em uma única transação: salva nome, nicho e saldo
-- inicial e cria as categorias do nicho. As categorias vêm do servidor
-- (src/config/nichos.ts), que é onde os templates vivem.
--
-- security invoker: roda com as permissões do usuário, então a RLS vale aqui
-- dentro também. Só mexe na empresa do próprio usuário (empresa_atual()).
-- Idempotente: se for chamada de novo (clique duplo), não duplica nada.
create or replace function public.concluir_onboarding(
  p_nome text,
  p_nicho text,
  p_saldo_inicial_centavos bigint,
  p_agenda_ativa boolean,
  p_categorias jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_empresa uuid := public.empresa_atual();
  v_concluido boolean;
begin
  if v_empresa is null then
    raise exception 'Usuário sem empresa.' using errcode = '42501';
  end if;

  -- Trava a linha da empresa: duas chamadas simultâneas viram uma fila.
  select onboarding_concluido into v_concluido
    from public.empresas where id = v_empresa for update;

  if v_concluido then
    return;
  end if;

  update public.empresas
     set nome = trim(p_nome),
         nicho = p_nicho,
         saldo_inicial_centavos = p_saldo_inicial_centavos,
         agenda_ativa = p_agenda_ativa,
         onboarding_concluido = true
   where id = v_empresa;

  insert into public.categorias (empresa_id, tipo, grupo, nome, ordem)
  select v_empresa, c.tipo, c.grupo, trim(c.nome), (c.ordem)::int
    from rows from (jsonb_to_recordset(p_categorias) as (tipo text, grupo text, nome text))
         with ordinality as c(tipo, grupo, nome, ordem)
  on conflict do nothing;
end;
$$;

revoke execute on function public.concluir_onboarding(text, text, bigint, boolean, jsonb) from public, anon;
grant execute on function public.concluir_onboarding(text, text, bigint, boolean, jsonb) to authenticated;

-- >>> 20261008000003_codigo_produto.sql
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

-- >>> 20261008000004_lancamentos.sql
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

-- >>> 20261008000005_dashboard.sql
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

-- >>> 20261008000006_estoque_vendas.sql
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

-- >>> 20261008000007_lembretes_avisos.sql
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

-- >>> 20261008000008_agenda.sql
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

-- >>> 20261008000009_whatsapp.sql
-- =============================================================================
-- Etapa 8 — Mensagens automáticas de confirmação (WhatsApp)
-- =============================================================================
-- Fluxo:
--   1. Ao agendar/remarcar, o servidor calcula a régua (src/lib/regua.ts) e
--      grava as mensagens em mensagens_whatsapp com status "pendente".
--   2. Uma tarefa agendada (cron) pega as pendentes vencidas
--      (pegar_mensagens_para_envio), confere de novo se ainda faz sentido e
--      envia pela camada src/services/whatsapp.
--   3. O webhook do WhatsApp atualiza entregue/lida/falhou e lê as respostas
--      1/2/3 do cliente para confirmar, remarcar ou cancelar.
-- =============================================================================

-- Correção de segurança: dentro de funções security definer o current_user é
-- o dono da função (postgres), então a versão anterior de eh_servidor()
-- respondia "sim" para qualquer usuário. Agora vale só:
--   * JWT com papel service_role (chave de serviço, via API), ou
--   * conexão direta ao banco sem JWT nenhum (SQL Editor / migrations).
create or replace function public.eh_servidor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or (auth.role() is null and session_user in ('postgres', 'supabase_admin'));
$$;

alter table public.empresas
  add column whatsapp_ativo boolean not null default false,
  add column regua_whatsapp jsonb;

-- Uma mensagem por etapa por agendamento (nulos não conflitam entre si).
-- Índice sem "where" para o upsert (on conflict) da API conseguir usá-lo.
create unique index mensagens_agendamento_etapa on public.mensagens_whatsapp (agendamento_id, etapa);
create index mensagens_provedor_idx on public.mensagens_whatsapp (provedor_mensagem_id) where provedor_mensagem_id is not null;
create index mensagens_telefone_idx on public.mensagens_whatsapp (telefone, enviado_em desc);
create index mensagens_empresa_mes_idx on public.mensagens_whatsapp (empresa_id, enviado_em);

alter table public.mensagens_whatsapp drop constraint mensagens_whatsapp_status_check;
alter table public.mensagens_whatsapp add constraint mensagens_whatsapp_status_check
  check (status in ('pendente', 'enviando', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada'));

-- Cancela as mensagens que ainda não saíram (agendamento cancelado, atendido,
-- remarcado). security definer porque o cliente não escreve nesta tabela;
-- a checagem de dono é feita aqui dentro.
-- p_so_confirmacoes = true: cliente já confirmou; cancela só as que pedem
-- confirmação e mantém o lembrete do dia.
create or replace function public.cancelar_mensagens_agendamento(p_agendamento uuid, p_so_confirmacoes boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_qtd int;
begin
  if not exists (
    select 1 from public.agendamentos
     where id = p_agendamento
       and (empresa_id = public.empresa_atual() or public.eh_admin() or public.eh_servidor())
  ) then
    raise exception 'Agendamento não encontrado.' using errcode = 'P0002';
  end if;
  update public.mensagens_whatsapp set status = 'cancelada'
   where agendamento_id = p_agendamento and status = 'pendente'
     and (not p_so_confirmacoes or etapa <> 'dia');
  get diagnostics v_qtd = row_count;
  return v_qtd;
end;
$$;

revoke execute on function public.cancelar_mensagens_agendamento(uuid, boolean) from public, anon;
grant execute on function public.cancelar_mensagens_agendamento(uuid, boolean) to authenticated, service_role;

-- Pega um lote de mensagens prontas para envio e marca como "enviando".
-- skip locked: dois envios rodando juntos nunca pegam a mesma mensagem.
create or replace function public.pegar_mensagens_para_envio(p_limite int default 50)
returns setof public.mensagens_whatsapp
language sql
security definer
set search_path = ''
as $$
  update public.mensagens_whatsapp m
     set status = 'enviando', tentativas = m.tentativas + 1
   where m.id in (
     select id from public.mensagens_whatsapp
      where status = 'pendente' and agendado_para <= now()
      order by agendado_para
      limit p_limite
      for update skip locked
   )
  returning m.*;
$$;

revoke execute on function public.pegar_mensagens_para_envio(int) from public, anon, authenticated;
grant execute on function public.pegar_mensagens_para_envio(int) to service_role;

-- >>> 20261008000010_relatorios.sql
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

-- >>> 20261008000011_assinatura.sql
-- =============================================================================
-- Etapa 10 — Assinatura (Asaas) e bloqueio por fim de teste/inadimplência
-- =============================================================================
-- Regra: a empresa pode GRAVAR quando a assinatura está ativa ou o teste
-- ainda não venceu. Fora disso (teste vencido, inadimplente, cancelado,
-- suspenso) o acesso vira somente leitura: tudo continua visível, nada é
-- apagado, só novos cadastros e alterações são recusados.
-- Implementado com políticas RESTRICTIVE, que se somam (AND) às políticas
-- de isolamento por empresa que já existem.
-- =============================================================================

alter table public.empresas
  add column plano_proximo text check (plano_proximo in ('essencial', 'profissional')),
  add column cpf_cnpj text check (cpf_cnpj ~ '^[0-9]{11}$|^[0-9]{14}$'),
  add column cancelado_em timestamptz;

create or replace function public.empresa_pode_escrever(p_empresa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.eh_admin() or public.eh_servidor() or exists (
    select 1 from public.empresas e
     where e.id = p_empresa
       and (e.status_assinatura = 'ativo'
            or (e.status_assinatura = 'teste' and e.teste_ate > now()))
  );
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'categorias', 'clientes', 'produtos', 'profissionais', 'servicos', 'vendas',
    'itens_venda', 'lancamentos', 'movimentacoes_estoque', 'agendamentos',
    'lembretes', 'exportacoes'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for insert to authenticated
         with check (public.empresa_pode_escrever(empresa_id))', t || '_escrita_insert', t);
    execute format(
      'create policy %I on public.%I as restrictive for update to authenticated
         using (public.empresa_pode_escrever(empresa_id))
         with check (public.empresa_pode_escrever(empresa_id))', t || '_escrita_update', t);
  end loop;
end;
$$;

-- Ajustes da própria empresa também ficam travados (o servidor/webhook e o
-- admin continuam podendo alterar).
create policy empresas_escrita_update on public.empresas as restrictive for update to authenticated
  using (public.empresa_pode_escrever(id))
  with check (public.empresa_pode_escrever(id));

-- Eventos do Asaas já processados (o webhook pode chegar repetido).
create table public.asaas_eventos (
  id text primary key,
  evento text not null,
  empresa_id uuid references public.empresas (id),
  recebido_em timestamptz not null default now()
);
alter table public.asaas_eventos enable row level security;
revoke all on public.asaas_eventos from anon, authenticated;

create index empresas_asaas_assinatura_idx on public.empresas (asaas_assinatura_id) where asaas_assinatura_id is not null;

-- >>> 20261008000012_admin.sql
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

-- >>> 20261008000013_agendamento_online.sql
-- =============================================================================
-- Etapa 13 — Link público de agendamento (o cliente marca sozinho)
-- =============================================================================
-- Cada empresa ganha um endereço próprio: agilizou.app/agendar/<slug>.
-- O visitante NÃO tem login e continua sem ler nenhuma tabela: tudo passa por
-- duas funções security definer, que devolvem só o mínimo:
--   * agenda_publica(slug): nome da empresa, serviços, profissionais e os
--     horários OCUPADOS (sem nome de cliente nem qualquer outro dado);
--   * agendar_online(...): confere tudo de novo no banco (dia, horário,
--     conflito, limites contra abuso), cadastra o cliente pelo WhatsApp e
--     cria o agendamento direto na agenda.
-- O link só funciona com a agenda ligada, o agendamento online ligado e a
-- conta podendo gravar (assinatura ativa ou teste em dia).
-- =============================================================================

alter table public.empresas
  add column slug text,
  add column agendamento_online boolean not null default false,
  -- até quantos dias à frente o cliente pode marcar
  add column agendamento_dias_adiante int not null default 30
    check (agendamento_dias_adiante between 1 and 90),
  -- antecedência mínima, em horas
  add column agendamento_antecedencia_horas int not null default 1
    check (agendamento_antecedencia_horas between 0 and 72),
  add column agendamento_mostrar_precos boolean not null default true,
  -- recado no topo da página (endereço, como chegar, forma de pagamento...)
  add column agendamento_mensagem text check (char_length(agendamento_mensagem) <= 300),
  -- datas sem atendimento (feriado, folga, férias)
  add column datas_fechadas date[] not null default '{}'
    check (cardinality(datas_fechadas) <= 120),
  add constraint empresas_slug_formato
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60);

create unique index empresas_slug_unico on public.empresas (slug) where slug is not null;

-- De onde veio o agendamento: lançado no app ou marcado pelo link.
alter table public.agendamentos
  add column origem text not null default 'app' check (origem in ('app', 'link'));

-- "Barbearia do Zé (demonstração)" → "barbearia-do-ze-demonstracao"
create or replace function public.gerar_slug(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when char_length(s) >= 3 then s else 'empresa' || case when s = '' then '' else '-' || s end end
    from (
      select trim(both '-' from left(
        regexp_replace(
          translate(lower(coalesce(p_nome, '')),
            'áàâãäåéèêëíìîïóòôõöúùûüçñ',
            'aaaaaaeeeeiiiiooooouuuucn'),
          '[^a-z0-9]+', '-', 'g'),
        50)) as s
    ) x;
$$;

-- Primeiro endereço livre a partir de uma base: base, base-2, base-3...
create or replace function public.slug_livre(p_base text, p_empresa uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tentativa text := p_base;
  v_n int := 1;
begin
  while exists (select 1 from public.empresas e where e.slug = v_tentativa and e.id is distinct from p_empresa) loop
    v_n := v_n + 1;
    v_tentativa := p_base || '-' || v_n;
  end loop;
  return v_tentativa;
end;
$$;

-- A empresa ganha o endereço quando tem nome de verdade. Depois disso o
-- endereço NÃO muda sozinho (trocar o nome não quebra links já enviados);
-- o dono pode trocar nos ajustes.
-- security definer: quem altera a empresa não pode chamar slug_livre() direto.
create or replace function public.definir_slug_empresa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.slug is not null then
    new.slug := lower(trim(new.slug));
  elsif new.nome <> 'Minha empresa' then
    new.slug := public.slug_livre(public.gerar_slug(new.nome), new.id);
  end if;
  return new;
end;
$$;

create trigger empresas_definir_slug before insert or update on public.empresas
  for each row execute function public.definir_slug_empresa();

-- Empresas que já existiam.
do $$
declare
  r record;
begin
  for r in select id, nome from public.empresas where slug is null and nome <> 'Minha empresa' order by criado_em loop
    update public.empresas
       set slug = public.slug_livre(public.gerar_slug(r.nome), r.id)
     where id = r.id;
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- Leitura pública: o que a página do link precisa para montar os horários.
-- -----------------------------------------------------------------------------
create or replace function public.agenda_publica(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select id, nome, nicho, horario_abertura, horario_fechamento, dias_funcionamento,
         agendamento_dias_adiante, agendamento_antecedencia_horas, agendamento_mostrar_precos,
         agendamento_mensagem, datas_fechadas
    into e
    from public.empresas
   where slug = lower(trim(coalesce(p_slug, '')))
     and agendamento_online and agenda_ativa
     and (status_assinatura = 'ativo' or (status_assinatura = 'teste' and teste_ate > now()));
  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'empresa', jsonb_build_object('nome', e.nome, 'nicho', e.nicho, 'mensagem', e.agendamento_mensagem),
    'horario', jsonb_build_object(
      'abertura', to_char(e.horario_abertura, 'HH24:MI'),
      'fechamento', to_char(e.horario_fechamento, 'HH24:MI'),
      'dias', to_jsonb(e.dias_funcionamento),
      'dias_adiante', e.agendamento_dias_adiante,
      'antecedencia_horas', e.agendamento_antecedencia_horas,
      'datas_fechadas', to_jsonb(e.datas_fechadas)),
    'profissionais', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome) order by p.nome)
        from public.profissionais p
       where p.empresa_id = e.id and p.ativo and p.deleted_at is null), '[]'::jsonb),
    'servicos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'nome', s.nome, 'duracao_minutos', s.duracao_minutos,
               'preco_centavos', case when e.agendamento_mostrar_precos then s.preco_centavos end)
             order by s.nome)
        from public.servicos s
       where s.empresa_id = e.id and s.deleted_at is null), '[]'::jsonb),
    -- Só o intervalo ocupado de cada profissional. Nada sobre quem marcou.
    'ocupados', coalesce((
      select jsonb_agg(jsonb_build_object('profissional', a.profissional_id, 'inicio', a.inicio, 'fim', a.fim))
        from public.agendamentos a
       where a.empresa_id = e.id and a.deleted_at is null
         and a.status not in ('cancelado', 'remarcado')
         and a.fim > now()
         and a.inicio < ((v_hoje + e.agendamento_dias_adiante + 1)::timestamp at time zone 'America/Sao_Paulo')), '[]'::jsonb)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Gravação pública: marca o horário. Todas as regras são conferidas aqui,
-- porque quem chama é um visitante sem login.
-- -----------------------------------------------------------------------------
create or replace function public.agendar_online(
  p_slug text,
  p_servico uuid,
  p_profissional uuid,
  p_inicio timestamptz,
  p_nome text,
  p_whatsapp text,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  e record;
  v_nome text := trim(coalesce(p_nome, ''));
  v_obs text := nullif(left(trim(coalesce(p_observacao, '')), 300), '');
  v_duracao int := 30;
  v_servico_nome text;
  v_local timestamp := p_inicio at time zone 'America/Sao_Paulo';
  v_dia date := (p_inicio at time zone 'America/Sao_Paulo')::date;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_fim timestamptz;
  v_prof uuid;
  v_prof_nome text;
  v_cliente uuid;
  v_id uuid;
begin
  select id, nome, horario_abertura, horario_fechamento, dias_funcionamento,
         agendamento_dias_adiante, agendamento_antecedencia_horas, datas_fechadas
    into e
    from public.empresas
   where slug = lower(trim(coalesce(p_slug, '')))
     and agendamento_online and agenda_ativa
     and (status_assinatura = 'ativo' or (status_assinatura = 'teste' and teste_ate > now()));
  if not found then
    raise exception 'O agendamento online não está disponível.' using errcode = 'P0002';
  end if;

  if char_length(v_nome) < 2 or char_length(v_nome) > 120 then
    raise exception 'Digite o seu nome.' using errcode = '22023';
  end if;
  if p_whatsapp is null or p_whatsapp !~ '^[0-9]{10,15}$' then
    raise exception 'WhatsApp inválido.' using errcode = '22023';
  end if;
  if p_inicio is null then
    raise exception 'Escolha o dia e o horário.' using errcode = '22023';
  end if;

  -- Serviço: obrigatório quando a empresa tem serviços cadastrados.
  if p_servico is not null then
    select s.duracao_minutos, s.nome into v_duracao, v_servico_nome
      from public.servicos s
     where s.id = p_servico and s.empresa_id = e.id and s.deleted_at is null;
    if not found then
      raise exception 'Serviço não encontrado.' using errcode = '22023';
    end if;
  elsif exists (select 1 from public.servicos s where s.empresa_id = e.id and s.deleted_at is null) then
    raise exception 'Escolha o serviço.' using errcode = '22023';
  end if;
  v_fim := p_inicio + make_interval(mins => v_duracao);

  -- Dia e horário dentro do que a empresa atende.
  if extract(second from v_local) <> 0 or (extract(minute from v_local)::int % 15) <> 0 then
    raise exception 'Horário inválido.' using errcode = '22023';
  end if;
  if p_inicio < now() + make_interval(hours => e.agendamento_antecedencia_horas) then
    raise exception 'Esse horário já passou ou está muito em cima da hora. Escolha outro.' using errcode = '22023';
  end if;
  if v_dia > v_hoje + e.agendamento_dias_adiante then
    raise exception 'Essa data ainda não está aberta para agendamento.' using errcode = '22023';
  end if;
  if not (extract(dow from v_dia)::int = any (e.dias_funcionamento)) or v_dia = any (e.datas_fechadas) then
    raise exception 'Não há atendimento nesse dia.' using errcode = '22023';
  end if;
  if v_local < v_dia + e.horario_abertura or v_local + make_interval(mins => v_duracao) > v_dia + e.horario_fechamento then
    raise exception 'Horário fora do período de atendimento.' using errcode = '22023';
  end if;

  -- Freios contra abuso: poucos horários futuros por WhatsApp e um teto por hora.
  if (select count(*)
        from public.agendamentos a
        join public.clientes c on c.id = a.cliente_id and c.empresa_id = a.empresa_id
       where a.empresa_id = e.id and c.whatsapp = p_whatsapp and a.deleted_at is null
         and a.status in ('agendado', 'confirmado') and a.inicio > now()) >= 3 then
    raise exception 'Você já tem horários marcados. Para marcar mais, fale direto com a empresa.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agendamentos a
       where a.empresa_id = e.id and a.origem = 'link' and a.criado_em > now() - interval '1 hour') >= 40 then
    raise exception 'Muitos agendamentos agora. Tente de novo daqui a pouco.' using errcode = 'P0001';
  end if;

  -- Profissional: o escolhido, ou o primeiro livre nesse horário.
  if p_profissional is not null then
    select p.id, p.nome into v_prof, v_prof_nome
      from public.profissionais p
     where p.id = p_profissional and p.empresa_id = e.id and p.ativo and p.deleted_at is null;
    if not found then
      raise exception 'Profissional não encontrado.' using errcode = '22023';
    end if;
  else
    select p.id, p.nome into v_prof, v_prof_nome
      from public.profissionais p
     where p.empresa_id = e.id and p.ativo and p.deleted_at is null
       and not exists (
         select 1 from public.agendamentos a
          where a.profissional_id = p.id and a.deleted_at is null
            and a.status not in ('cancelado', 'remarcado')
            and tstzrange(a.inicio, a.fim) && tstzrange(p_inicio, v_fim))
     order by p.nome
     limit 1;
    if not found then
      raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = '23P01';
    end if;
  end if;

  -- Cliente: reaproveita o cadastro com o mesmo WhatsApp; senão cria.
  -- (O limite de clientes do plano vale para o cadastro feito no app; pelo
  -- link nenhum cliente é recusado.)
  select c.id into v_cliente
    from public.clientes c
   where c.empresa_id = e.id and c.whatsapp = p_whatsapp and c.deleted_at is null
   order by c.criado_em
   limit 1;
  if v_cliente is null then
    insert into public.clientes (empresa_id, nome, whatsapp, observacoes)
    values (e.id, v_nome, p_whatsapp, 'Cadastrado pelo link de agendamento.')
    returning id into v_cliente;
  end if;

  begin
    insert into public.agendamentos (empresa_id, cliente_id, profissional_id, servico_id, inicio, fim, observacao, origem)
    values (e.id, v_cliente, v_prof, p_servico, p_inicio, v_fim, v_obs, 'link')
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado. Escolha outro.' using errcode = '23P01';
  end;

  return jsonb_build_object(
    'id', v_id, 'empresa_id', e.id, 'empresa', e.nome,
    'inicio', p_inicio, 'fim', v_fim,
    'profissional', v_prof_nome, 'servico', v_servico_nome);
end;
$$;

-- No Supabase toda função nova em public nasce liberada para todo mundo:
-- aqui dizemos exatamente quem pode chamar o quê.
revoke execute on function public.gerar_slug(text) from public, anon;
revoke execute on function public.slug_livre(text, uuid) from public, anon, authenticated;
revoke execute on function public.definir_slug_empresa() from public, anon, authenticated;
grant execute on function public.gerar_slug(text) to authenticated, service_role;

revoke execute on function public.agenda_publica(text) from public;
revoke execute on function public.agendar_online(text, uuid, uuid, timestamptz, text, text, text) from public;
grant execute on function public.agenda_publica(text) to anon, authenticated, service_role;
grant execute on function public.agendar_online(text, uuid, uuid, timestamptz, text, text, text) to anon, authenticated, service_role;

-- >>> 20261008000014_perfil_negocio.sql
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
