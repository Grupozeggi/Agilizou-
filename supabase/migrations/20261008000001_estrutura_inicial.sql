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
