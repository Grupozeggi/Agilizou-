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
