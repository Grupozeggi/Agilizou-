# Agilizou

**Agilizou. Seu caixa em dia.** Gestão financeira e de estoque simples para pequenos negócios (agilizou.app).

Stack: Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Postgres, Auth, RLS) · Vercel · Asaas.

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com as chaves do Supabase
npm run dev                  # http://localhost:3000
```

## Configurar o Supabase

1. Crie o projeto em supabase.com e copie a URL, a chave `anon` e a `service_role` para o `.env.local`.
2. Rode a migration: cole `supabase/migrations/*.sql` no SQL Editor, em ordem (ou `supabase db push` com a CLI).
3. **Authentication → URL Configuration**: Site URL `https://agilizou.app`; Redirect URLs `http://localhost:3000/**` e `https://agilizou.app/**`.
4. **Authentication → Email Templates**: use os modelos de `supabase/templates/` (confirmação e recuperação de senha).
5. **Authentication → Multi-Factor**: deixe TOTP ativado (obrigatório para o admin).

### Criar um admin (só pelo banco, nunca pelo cadastro)

Crie o usuário em **Authentication → Users → Add user** e depois, no SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'suporte@agilizou.app';
```

No primeiro login, o admin é levado a `/admin/verificacao` para cadastrar o app autenticador (2FA).
Usuários criados pelo painel ganham empresa pelo gatilho de cadastro; para um admin, apague o perfil
criado (`delete from perfis where id = '<id do admin>'`).

## Testes

```bash
npm test             # cálculos (dinheiro, datas, limites) e validações
npm run test:rls     # isolamento entre empresas (precisa de Postgres)
```

Os testes de RLS recriam um banco do zero com um stub do Supabase
(`supabase/tests/supabase_stub.sql`) e aplicam todas as migrations. Defina
`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres` apontando para
um Postgres 15+ local (nunca para o banco de produção).

## Segurança, em resumo

- Toda tabela de negócio tem `empresa_id` + RLS: cada empresa só vê os próprios dados.
- Chaves estrangeiras compostas `(empresa_id, id)` impedem ligar um registro a dados de outra empresa.
- Admin = `app_metadata.role = 'admin'` **e** sessão com 2FA (`aal2`). O usuário não consegue editar `app_metadata`.
- Plano, status e datas da assinatura só mudam pelo servidor (webhook) ou admin (gatilho no banco).
- Toda alteração feita por admin é registrada em `log_admin` por gatilho; o log não pode ser editado nem apagado.
- Tentativas de abrir `/admin` sem permissão são registradas em `log_acesso_negado`.
- A chave `service_role` só é usada em `src/lib/supabase/servico.ts` (marcado `server-only`).
- Dinheiro sempre em centavos (inteiro). Nada é apagado de verdade (`deleted_at`).

## Código e código de barras dos produtos

Todo produto recebe automaticamente um **código sequencial por empresa** (1, 2, 3...) que nunca muda,
e um **código de barras EAN-13 interno** (`20` + código com 10 dígitos + dígito verificador; a faixa
20–29 é reservada pela GS1 para uso interno da loja). Se o produto já tem código na embalagem, basta
digitar ou bipar no cadastro e ele é usado no lugar. Leitores USB/Bluetooth funcionam como teclado,
então bipar = digitar o código + Enter. Regras em `src/lib/codigo-barras.ts` e na migration
`20261008000003_codigo_produto.sql`.

## Estrutura

```
src/app/(auth)        cadastro, login, recuperação de senha
src/app/app           área do cliente
src/app/admin         painel da agência (2FA obrigatório)
src/config/planos.ts  preços e limites dos planos (único lugar)
src/lib               dinheiro, datas, sessão, clientes do Supabase
src/proxy.ts          renova a sessão e protege /app e /admin
supabase/migrations   esquema do banco, RLS e auditoria
```
