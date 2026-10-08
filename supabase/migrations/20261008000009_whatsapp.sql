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
