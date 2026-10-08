-- =============================================================================
-- Etapa 15 — Logo da empresa no link de agendamento
-- =============================================================================
-- O dono envia a logo nos ajustes do link. A imagem é reduzida no navegador
-- (no máximo 400 px) e guardada aqui como texto ("data:image/...;base64,...").
-- Fica numa tabela separada para não pesar em toda leitura de `empresas`.
-- O visitante do link não lê a tabela: recebe a imagem por logo_publica(),
-- que só responde quando o link da empresa está no ar (mesma regra de
-- agenda_publica).
-- =============================================================================

create table public.logos_empresa (
  empresa_id uuid primary key default public.empresa_atual() references public.empresas (id) on delete cascade,
  -- só PNG, JPEG ou WebP (nada de SVG) e no máximo ~220 KB de imagem
  imagem text not null
    check (char_length(imagem) <= 300000 and imagem ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$'),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger logos_empresa_atualizado_em before update on public.logos_empresa
  for each row execute function public.tocar_atualizado_em();

alter table public.logos_empresa enable row level security;

-- O dono lê, grava e apaga só a logo da própria empresa; o admin (com 2FA) lê.
create policy logos_empresa_select on public.logos_empresa for select to authenticated
  using (empresa_id = public.empresa_atual() or public.admin_global());
create policy logos_empresa_insert on public.logos_empresa for insert to authenticated
  with check (empresa_id = public.empresa_atual());
create policy logos_empresa_update on public.logos_empresa for update to authenticated
  using (empresa_id = public.empresa_atual())
  with check (empresa_id = public.empresa_atual());
create policy logos_empresa_delete on public.logos_empresa for delete to authenticated
  using (empresa_id = public.empresa_atual());

-- Conta em somente leitura (teste vencido, inadimplente...) não troca a logo.
create policy logos_empresa_escrita_insert on public.logos_empresa as restrictive for insert to authenticated
  with check (public.empresa_pode_escrever(empresa_id));
create policy logos_empresa_escrita_update on public.logos_empresa as restrictive for update to authenticated
  using (public.empresa_pode_escrever(empresa_id))
  with check (public.empresa_pode_escrever(empresa_id));

-- Alteração feita por admin (modo suporte) vai para o log, sem a imagem em si
-- (só o tamanho), para o log não crescer com cópias da logo.
create or replace function public.auditar_logo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  antes jsonb := case when tg_op in ('UPDATE', 'DELETE')
    then jsonb_build_object('empresa_id', old.empresa_id, 'tamanho', char_length(old.imagem)) end;
  depois jsonb := case when tg_op in ('INSERT', 'UPDATE')
    then jsonb_build_object('empresa_id', new.empresa_id, 'tamanho', char_length(new.imagem)) end;
  v_empresa uuid := coalesce(depois ->> 'empresa_id', antes ->> 'empresa_id')::uuid;
begin
  if public.eh_admin() then
    insert into public.log_admin
      (admin_id, admin_email, empresa_id, acao, tabela, registro_id, valor_anterior, valor_novo, modo_suporte)
    values (auth.uid(), auth.jwt() ->> 'email', v_empresa, lower(tg_op), tg_table_name, v_empresa::text,
            antes, depois, public.em_modo_suporte());
  end if;
  return coalesce(new, old);
end;
$$;

create trigger logos_empresa_auditar_admin after insert or update or delete on public.logos_empresa
  for each row execute function public.auditar_logo_admin();

revoke all on public.logos_empresa from anon;
revoke truncate on public.logos_empresa from authenticated;
revoke execute on function public.auditar_logo_admin() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- A imagem para a página pública: só quando o link da empresa está no ar.
-- -----------------------------------------------------------------------------
create or replace function public.logo_publica(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select l.imagem
    from public.empresas e
    join public.logos_empresa l on l.empresa_id = e.id
   where e.slug = lower(trim(coalesce(p_slug, '')))
     and e.agendamento_online and e.agenda_ativa
     and (e.status_assinatura = 'ativo' or (e.status_assinatura = 'teste' and e.teste_ate > now()));
$$;

revoke execute on function public.logo_publica(text) from public;
grant execute on function public.logo_publica(text) to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- agenda_publica passa a dizer se a empresa tem logo: `logo_versao` é a hora
-- da última troca (muda o endereço da imagem, então o navegador busca a nova).
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
    'empresa', jsonb_build_object(
      'nome', e.nome, 'nicho', e.nicho, 'mensagem', e.agendamento_mensagem,
      'logo_versao', (select floor(extract(epoch from l.atualizado_em))::bigint
                        from public.logos_empresa l where l.empresa_id = e.id)),
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
