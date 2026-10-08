# Agilizou

**Agilizou. Seu caixa em dia.** Gestão financeira, de estoque e de agenda para pequenos negócios
brasileiros (mecânica, clínica odontológica, salão/barbearia, loja). Site: agilizou.app.

Stack: Next.js 16 (App Router) + TypeScript + Tailwind 4 · Supabase (Postgres, Auth, RLS) · Vercel ·
Asaas (assinatura) · WhatsApp Cloud API (Meta) · Resend (e-mail) · Web Push.

---

## O que o sistema faz

| Módulo | Onde |
| --- | --- |
| Cadastro, login, confirmação de e-mail, recuperação de senha, teste grátis de 7 dias | `src/app/(auth)` |
| Onboarding em 3 telas com categorias prontas por nicho | `src/app/boas-vindas`, `src/config/nichos.ts` |
| Lançamentos em 3 toques, recorrentes e parcelados; contas a pagar/receber | `src/app/app/lancamentos`, `src/app/app/contas` |
| Dashboard: saldo, entradas, saídas, lucro, gráfico, resultado do mês (DRE simples) | `src/app/app/page.tsx` |
| Produtos com código e código de barras automáticos, estoque, etiquetas, vendas | `src/app/app/produtos`, `src/app/app/vendas` |
| Tela "Hoje", lembretes, avisos por e-mail/notificação, cobrança no WhatsApp | `src/app/app/hoje`, `src/app/api/cron/avisos` |
| Agenda de atendimentos, presença, indicadores | `src/app/app/agenda` |
| Mensagens automáticas de confirmação no WhatsApp (régua 5d/2d/1d/dia) | `src/app/app/mensagens`, `src/services/whatsapp` |
| Relatórios e exportação CSV/PDF | `src/app/app/relatorios` |
| Assinatura (Asaas), upgrade/downgrade, somente leitura | `src/app/app/assinatura`, `src/services/asaas.ts` |
| Painel administrativo, modo suporte, auditoria | `src/app/admin` |
| Landing page | `src/app/page.tsx` |

Preços e limites dos planos ficam **só** em `src/config/planos.ts`.

---

## Rodando localmente

```bash
npm install
cp .env.example .env.local   # preencha com as chaves (veja abaixo)
npm run dev                  # http://localhost:3000
```

Sem as chaves do Asaas, WhatsApp, Resend e VAPID o app funciona: pagamento mostra uma mensagem de
"não configurado", WhatsApp e e-mail ficam em **modo simulado** (só registram no log).

## Testes

```bash
npm test             # tudo: cálculos + banco (se TEST_DATABASE_URL estiver definido)
npm run test:rls     # só os testes de banco (RLS, vendas, estoque, assinatura, admin...)
npm run lint && npm run typecheck
```

Os testes de banco recriam um banco do zero com um stub do Supabase
(`supabase/tests/supabase_stub.sql`) e aplicam todas as migrations. Use um Postgres 15+ local:
`TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres` (**nunca** o banco de produção).
O GitHub Actions (`.github/workflows/ci.yml`) roda lint, tipos, todos os testes e o build a cada push.

---

## Modelo para testes (o jeito mais rápido)

1. **Supabase**: crie um projeto → **SQL Editor** → cole `supabase/instalar.sql` → Run.
   Depois cole `supabase/demonstracao.sql` → Run.
2. **Authentication → Sign In / Providers → Email**: desligue **Confirm email** (só no projeto de
   teste; assim o cadastro entra direto, sem esperar e-mail).
3. **Vercel**: importe o repositório e cadastre 4 variáveis: `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `NEXT_PUBLIC_SITE_URL`
   (o endereço que a Vercel der, ex.: `https://agilizou-xxxx.vercel.app`). Deploy.
4. **Supabase → Authentication → URL Configuration**: Site URL = endereço da Vercel; em Redirect
   URLs adicione `https://SEU-ENDERECO.vercel.app/**`.
5. Abra o site, clique em **Testar grátis** e cadastre-se.
6. No **SQL Editor**: `select preencher_demonstracao('seu-email@exemplo.com');` e atualize o app.
   A conta vira a "Barbearia do Zé (demonstração)": 6 meses de vendas, despesas, estoque (2 itens
   abaixo do mínimo), clientes, agenda com presenças e faltas, contas vencidas e a vencer, plano
   Profissional em teste por 30 dias.

Para testar outro nicho do zero, é só cadastrar outro e-mail e não rodar o preenchimento.
Pagamento (Asaas), WhatsApp e e-mails ficam em modo simulado até você configurar as chaves.

## Colocando no ar (passo a passo)

### 1. Supabase

1. Crie o projeto em supabase.com (região São Paulo).
2. **SQL Editor**: cole e rode `supabase/instalar.sql` (todas as migrations juntas; é gerado com
   `npm run sql:juntar` a partir de `supabase/migrations/`, que também podem ser rodadas em ordem).
   Não rode `supabase/tests/supabase_stub.sql` (é só para testes).
   Com a CLI: `supabase link` e `supabase db push`.
3. **Authentication → URL Configuration**: Site URL `https://agilizou.app`; Redirect URLs
   `https://agilizou.app/**` e `http://localhost:3000/**`.
4. **Authentication → Email Templates**: use `supabase/templates/confirmacao.html` (Confirm signup)
   e `supabase/templates/recuperacao.html` (Reset password).
5. **Authentication → SMTP**: configure o Resend (ou outro SMTP) para os e-mails saírem de agilizou.app.
6. **Authentication → Multi-Factor**: deixe **TOTP** ativado (obrigatório para o admin).
7. Copie a URL, a chave `anon` (ou publishable) e a `service_role` (ou secret) para as variáveis.

### 2. Vercel

1. Importe o repositório; framework Next.js (detectado).
2. Cadastre as variáveis de `.env.example` em **Settings → Environment Variables**.
3. Domínio: adicione `agilizou.app` em **Settings → Domains**.
4. Tarefas agendadas:
   - `/api/cron/avisos` todo dia às 8h de Brasília, pela Vercel (`vercel.json`). Avisa vencimentos e
     também encerra assinaturas canceladas cujo período pago acabou.
   - `/api/cron/whatsapp` a cada 10 minutos (fila de mensagens). Ela **não** fica no `vercel.json`,
     porque o plano grátis da Vercel só aceita tarefas 1 vez por dia, e o deploy falharia.
     Agende pelo próprio Supabase, com as extensões `pg_cron` e `pg_net`
     (Database → Extensions):
   ```sql
   select cron.schedule('agilizou-whatsapp', '*/10 * * * *', $$
     select net.http_get('https://agilizou.app/api/cron/whatsapp',
       headers => jsonb_build_object('Authorization', 'Bearer SEU_CRON_SECRET'));
   $$);
   ```

### 3. Asaas (assinaturas)

1. Comece no sandbox (`ASAAS_API_URL=https://sandbox.asaas.com/api/v3`); em produção use
   `https://api.asaas.com/v3`.
2. **Integrações → Chave de API** → `ASAAS_API_KEY`.
3. **Integrações → Webhooks**: URL `https://agilizou.app/api/webhooks/asaas`, token de autenticação
   = `ASAAS_WEBHOOK_TOKEN`, eventos de cobrança e de assinatura.
4. Fluxo: o cliente assina em **Ajustes → Assinatura**; a fatura (Pix, boleto ou cartão) abre no
   Asaas; o webhook ativa a conta. Atraso → inadimplente (somente leitura). Upgrade cobra a diferença
   proporcional; downgrade vale na próxima cobrança.

### 4. WhatsApp (Meta Cloud API)

1. Crie um app no Meta for Developers com o produto WhatsApp e um número.
2. Crie o template **`agilizou_lembrete`** (categoria Utilidade, idioma pt_BR) com o corpo
   `Mensagem da sua agenda: {{1}}` e botões de resposta rápida "1 - Confirmar", "2 - Remarcar",
   "3 - Cancelar". Aguarde a aprovação.
3. Variáveis: `WHATSAPP_PROVEDOR=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`,
   `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`.
4. Webhook do app: `https://agilizou.app/api/webhooks/whatsapp` com o mesmo `WHATSAPP_VERIFY_TOKEN`;
   assine os campos `messages`.
5. Enquanto isso, `WHATSAPP_PROVEDOR=simulado` mantém tudo funcionando com envio só no log.
   Para usar outro provedor, crie um arquivo em `src/services/whatsapp/` que implemente
   `ProvedorWhatsapp` e escolha-o em `index.ts`.

### 5. E-mail e notificações

- `RESEND_API_KEY` e `EMAIL_REMETENTE` (domínio verificado no Resend).
- Notificações no celular: gere as chaves com `npx web-push generate-vapid-keys` e preencha
  `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Cada usuário ativa em
  **Ajustes → Avisos de vencimento** (no iPhone, depois de instalar o app na tela inicial).

### 6. Criar um admin (só pelo banco, nunca pelo cadastro)

Em **Authentication → Users → Add user**, crie o usuário. Depois, no SQL Editor:

```sql
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
 where email = 'suporte@agilizou.app';
-- o cadastro criou uma empresa para ele; admin não precisa dela:
with p as (
  delete from public.perfis where id = (select id from auth.users where email = 'suporte@agilizou.app')
  returning empresa_id
)
delete from public.empresas where id in (select empresa_id from p);
```

No primeiro login, o admin cadastra o app autenticador em `/admin/verificacao` (2FA obrigatória).

---

## Segurança e regras de dados

- **Multi-empresa com RLS** em todas as tabelas (`empresa_id`); chaves estrangeiras compostas
  `(empresa_id, id)` impedem ligar um registro a dados de outra empresa.
- **Admin** = `app_metadata.role = 'admin'` **e** sessão com 2FA (`aal2`). O usuário não edita
  `app_metadata`. Tentativas de abrir `/admin` sem permissão ficam em `log_acesso_negado`.
- **Modo suporte**: o admin entra na conta do cliente com faixa fixa na tela; no banco, a empresa do
  suporte vira a "empresa atual" e o admin só enxerga ela. Toda alteração de admin vai para
  `log_admin` (antes/depois, modo suporte) por gatilho; o log não pode ser editado nem apagado.
- **Somente leitura** (teste vencido, inadimplente, cancelado, suspenso) garantido no banco por
  políticas RLS restritivas. Nenhum dado é apagado: exclusão é lógica (`deleted_at`).
- **Plano, status e datas da assinatura** só mudam pelo servidor (webhook) ou admin (gatilho).
- **Estoque** só muda por movimentação registrada; **venda** registrada não muda (só cancelamento,
  que devolve o estoque).
- **Dinheiro sempre em centavos** (inteiro); quantidades com até 3 casas.
- A chave `service_role` só é usada no servidor (`src/lib/supabase/servico.ts`, marcado
  `server-only`). Webhooks validam token/assinatura; tarefas agendadas exigem `CRON_SECRET`.

## Código e código de barras dos produtos

Todo produto recebe um **código sequencial por empresa** (1, 2, 3...) e um **EAN-13 interno**
(`20` + código com 10 dígitos + dígito verificador; faixa 20–29 reservada pela GS1 para uso interno).
Se o produto já tem código na embalagem, é só bipar no cadastro. Leitores USB/Bluetooth funcionam
como teclado; no celular, o botão da câmera lê o código (navegadores com BarcodeDetector, como o
Chrome no Android). Etiquetas em **Produtos → Etiquetas** (EAN ou Code 128).

## Estrutura

```
src/app/(auth)            cadastro, login, recuperação de senha
src/app/boas-vindas       onboarding
src/app/app               área do cliente (dashboard, lançamentos, vendas, agenda...)
src/app/admin             painel da agência (2FA obrigatório)
src/app/api               webhooks (Asaas, WhatsApp) e tarefas agendadas
src/config                planos/limites e templates por nicho
src/lib                   regras de negócio puras e testadas (dinheiro, estoque, agenda, régua...)
src/services              integrações externas (Asaas, WhatsApp)
src/proxy.ts              renova a sessão e protege /app e /admin
supabase/migrations       esquema, RLS, funções e auditoria (rodar em ordem)
tests/rls                 testes de banco (isolamento, vendas, estoque, assinatura, admin)
```
