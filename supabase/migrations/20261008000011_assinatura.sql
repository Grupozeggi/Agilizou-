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
