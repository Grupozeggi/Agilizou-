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
