/**
 * Testes de isolamento entre empresas (RLS) e de permissões de admin.
 *
 * Rodam contra um Postgres de verdade: o banco é recriado do zero, recebe o
 * stub do Supabase (supabase/tests/supabase_stub.sql) e todas as migrations.
 * Cada teste roda dentro de uma transação desfeita no final (rollback).
 *
 * Para rodar: TEST_DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:rls
 * Sem TEST_DATABASE_URL os testes são pulados.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from "vitest";

const URL_ADMIN = process.env.TEST_DATABASE_URL;
const NOME_BANCO = "agilizou_rls_test";
const raiz = path.resolve(import.meta.dirname, "../..");

type Claims = Record<string, unknown>;

let db: Client;

const ids = {
  donoA: "00000000-0000-0000-0000-00000000000a",
  donoB: "00000000-0000-0000-0000-00000000000b",
  admin: "00000000-0000-0000-0000-0000000000ad",
  espertinho: "00000000-0000-0000-0000-0000000000ee",
};
let empresaA: string;
let empresaB: string;
let categoriaB: string;

const claimsDe = (sub: string, extra: Claims = {}): Claims => ({
  sub,
  role: "authenticated",
  aal: "aal1",
  app_metadata: {},
  ...extra,
});
const claimsAdmin = (aal: "aal1" | "aal2" = "aal2"): Claims =>
  claimsDe(ids.admin, { aal, email: "suporte@agilizou.app", app_metadata: { role: "admin" } });

/** Executa SQL como um usuário logado (papel authenticated + JWT simulado). */
async function como(claims: Claims, sql: string, params: unknown[] = [], headers: Record<string, string> = {}) {
  await db.query("savepoint como");
  try {
    await db.query("set local role authenticated");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    await db.query("select set_config('request.headers', $1, true)", [JSON.stringify(headers)]);
    const r = await db.query(sql, params);
    await db.query("release savepoint como");
    await limparSessao();
    return r;
  } catch (e) {
    await db.query("rollback to savepoint como");
    await limparSessao();
    throw e;
  }
}

/** Volta a ser o "dono do banco" sem JWT (como o SQL Editor do Supabase). */
async function limparSessao() {
  await db.query("reset role");
  await db.query("select set_config('request.jwt.claims', '', true), set_config('request.headers', '', true)");
}

async function comoServidor(sql: string, params: unknown[] = []) {
  await db.query("savepoint srv");
  try {
    await db.query("set local role service_role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    const r = await db.query(sql, params);
    await db.query("release savepoint srv");
    await limparSessao();
    return r;
  } catch (e) {
    await db.query("rollback to savepoint srv");
    await limparSessao();
    throw e;
  }
}

/** Executa SQL como visitante sem login (papel anon), como a página pública do link. */
async function comoVisitante(sql: string, params: unknown[] = []) {
  await db.query("savepoint visitante");
  try {
    await db.query("set local role anon");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "anon" })]);
    const r = await db.query(sql, params);
    await db.query("release savepoint visitante");
    await limparSessao();
    return r;
  } catch (e) {
    await db.query("rollback to savepoint visitante");
    await limparSessao();
    throw e;
  }
}

describe.skipIf(!URL_ADMIN)("RLS: isolamento entre empresas", () => {
  beforeAll(async () => {
    const adm = new Client({ connectionString: URL_ADMIN });
    await adm.connect();
    await adm.query(`drop database if exists ${NOME_BANCO} with (force)`);
    await adm.query(`create database ${NOME_BANCO}`);
    await adm.end();

    const url = new URL(URL_ADMIN!);
    url.pathname = `/${NOME_BANCO}`;
    db = new Client({ connectionString: url.toString() });
    await db.connect();

    await db.query(readFileSync(path.join(raiz, "supabase/tests/supabase_stub.sql"), "utf8"));
    const pasta = path.join(raiz, "supabase/migrations");
    for (const arq of readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort()) {
      await db.query(readFileSync(path.join(pasta, arq), "utf8"));
    }

    // Cadastro público: o gatilho cria empresa + perfil.
    await db.query(
      `insert into auth.users (id, email, raw_user_meta_data) values
        ($1, 'a@teste.com', '{"nome_empresa":"Oficina A"}'),
        ($2, 'b@teste.com', '{"nome_empresa":"Clínica B"}'),
        -- tenta se dar papel de admin pelos metadados do cadastro
        ($3, 'esperto@teste.com', '{"role":"admin","nome_empresa":"Esperto"}')`,
      [ids.donoA, ids.donoB, ids.espertinho],
    );
    // Admin criado manualmente, direto no banco.
    await db.query(
      `insert into auth.users (id, email, raw_app_meta_data) values ($1, 'suporte@agilizou.app', '{"role":"admin"}')`,
      [ids.admin],
    );

    empresaA = (await db.query("select empresa_id from perfis where id = $1", [ids.donoA])).rows[0].empresa_id;
    empresaB = (await db.query("select empresa_id from perfis where id = $1", [ids.donoB])).rows[0].empresa_id;
    categoriaB = (
      await db.query(
        `insert into categorias (empresa_id, tipo, grupo, nome) values ($1, 'entrada', 'receita', 'Consulta') returning id`,
        [empresaB],
      )
    ).rows[0].id;
    await db.query(
      `insert into lancamentos (empresa_id, tipo, valor_centavos, categoria_id) values ($1, 'entrada', 15000, $2)`,
      [empresaB, categoriaB],
    );
  });

  afterAll(async () => {
    await db?.end();
  });

  beforeEach(async () => {
    await db.query("begin");
  });
  afterEach(async () => {
    await db.query("rollback");
  });

  it("cadastro cria empresa em teste de 7 dias e perfil comum", async () => {
    const r = await db.query(
      `select e.nome, e.status_assinatura, e.plano,
              round(extract(epoch from (e.teste_ate - e.criado_em)) / 86400) as dias
         from empresas e where e.id = $1`,
      [empresaA],
    );
    expect(r.rows[0]).toMatchObject({ nome: "Oficina A", status_assinatura: "teste", plano: "essencial" });
    expect(Number(r.rows[0].dias)).toBe(7);
  });

  it("admin criado no banco não ganha empresa", async () => {
    const r = await db.query("select count(*)::int as n from perfis where id = $1", [ids.admin]);
    expect(r.rows[0].n).toBe(0);
  });

  it("cadastro com role=admin nos metadados continua sendo cliente comum", async () => {
    const r = await como(claimsDe(ids.espertinho), "select eh_admin() as admin, count(*)::int as n from empresas");
    expect(r.rows[0]).toEqual({ admin: false, n: 1 });
  });

  it("cliente só enxerga a própria empresa", async () => {
    const r = await como(claimsDe(ids.donoA), "select id from empresas");
    expect(r.rows.map((x) => x.id)).toEqual([empresaA]);
  });

  it("cliente não lê lançamentos nem categorias de outra empresa", async () => {
    const l = await como(claimsDe(ids.donoA), "select count(*)::int as n from lancamentos");
    const c = await como(claimsDe(ids.donoA), "select count(*)::int as n from categorias");
    expect(l.rows[0].n).toBe(0);
    expect(c.rows[0].n).toBe(0);
  });

  it("cliente não insere dado na empresa de outro", async () => {
    await expect(
      como(
        claimsDe(ids.donoA),
        `insert into lancamentos (empresa_id, tipo, valor_centavos) values ($1, 'saida', 100)`,
        [empresaB],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cliente insere na própria empresa sem informar empresa_id", async () => {
    const r = await como(
      claimsDe(ids.donoA),
      `insert into lancamentos (tipo, valor_centavos) values ('saida', 2590) returning empresa_id`,
    );
    expect(r.rows[0].empresa_id).toBe(empresaA);
  });

  it("cliente não usa categoria de outra empresa no próprio lançamento", async () => {
    await expect(
      como(
        claimsDe(ids.donoA),
        `insert into lancamentos (tipo, valor_centavos, categoria_id) values ('entrada', 100, $1)`,
        [categoriaB],
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("cliente não altera nem move dados de outra empresa", async () => {
    const r = await como(claimsDe(ids.donoA), "update lancamentos set valor_centavos = 1 where empresa_id = $1", [
      empresaB,
    ]);
    expect(r.rowCount).toBe(0);
    await expect(
      como(claimsDe(ids.donoA), "update empresas set id = $1 where id = $2", [empresaB, empresaA]),
    ).rejects.toThrow();
  });

  it("cliente não apaga lançamentos de verdade (só exclusão lógica)", async () => {
    await expect(como(claimsDe(ids.donoA), "delete from lancamentos")).rejects.toThrow(/permission denied/);
  });

  it("cliente edita nome e nicho, mas não plano, status ou teste", async () => {
    const ok = await como(claimsDe(ids.donoA), "update empresas set nome = 'Oficina do Zé', nicho = 'mecanica'");
    expect(ok.rowCount).toBe(1);
    for (const campo of ["plano = 'profissional'", "status_assinatura = 'ativo'", "teste_ate = now() + interval '1 year'"]) {
      await expect(como(claimsDe(ids.donoA), `update empresas set ${campo}`)).rejects.toThrow(/assinatura/);
    }
  });

  it("cliente não lê nem escreve no log de admin", async () => {
    const r = await como(claimsDe(ids.donoA), "select count(*)::int as n from log_admin");
    expect(r.rows[0].n).toBe(0);
    await expect(
      como(claimsDe(ids.donoA), `insert into log_admin (admin_id, acao) values ($1, 'falso')`, [ids.donoA]),
    ).rejects.toThrow(/permission denied/);
  });

  it("visitante sem login não lê nada", async () => {
    await db.query("savepoint anon");
    await db.query("set local role anon");
    await expect(db.query("select * from empresas")).rejects.toThrow(/permission denied/);
    await db.query("rollback to savepoint anon");
    await db.query("reset role");
  });

  it("admin sem 2FA não enxerga dados de clientes", async () => {
    const r = await como(claimsAdmin("aal1"), "select count(*)::int as n from empresas");
    expect(r.rows[0].n).toBe(0);
  });

  it("admin com 2FA enxerga todas as empresas", async () => {
    const r = await como(claimsAdmin(), "select count(*)::int as n from empresas");
    expect(r.rows[0].n).toBe(3);
  });

  it("toda alteração de admin vai para o log, com valor anterior, novo e modo suporte", async () => {
    await como(claimsAdmin(), "update lancamentos set valor_centavos = 16000 where empresa_id = $1", [empresaB], {
      "x-modo-suporte": "1",
    });
    await como(claimsAdmin(), "update empresas set plano = 'profissional' where id = $1", [empresaB]);

    const log = await db.query(
      `select tabela, acao, empresa_id, modo_suporte, admin_email,
              valor_anterior->>'valor_centavos' as antes, valor_novo->>'valor_centavos' as depois,
              valor_anterior->>'plano' as plano_antes, valor_novo->>'plano' as plano_depois
         from log_admin order by id`,
    );
    expect(log.rows).toEqual([
      expect.objectContaining({ tabela: "lancamentos", acao: "update", empresa_id: empresaB, modo_suporte: true, antes: "15000", depois: "16000", admin_email: "suporte@agilizou.app" }),
      expect.objectContaining({ tabela: "empresas", acao: "update", empresa_id: empresaB, modo_suporte: false, plano_antes: "essencial", plano_depois: "profissional" }),
    ]);
  });

  it("alteração feita pelo próprio cliente não vai para o log de admin", async () => {
    await como(claimsDe(ids.donoA), `insert into lancamentos (tipo, valor_centavos) values ('saida', 100)`);
    const r = await db.query("select count(*)::int as n from log_admin");
    expect(r.rows[0].n).toBe(0);
  });

  it("ninguém edita ou apaga o log de admin, nem o servidor", async () => {
    await comoServidor(`insert into log_admin (admin_id, acao) values ($1, 'redefinir_senha')`, [ids.admin]);
    await expect(comoServidor("update log_admin set acao = 'x'")).rejects.toThrow(/permission denied/);
    await expect(comoServidor("delete from log_admin")).rejects.toThrow(/permission denied/);
    // nem o dono do banco
    await expect(db.query("delete from log_admin")).rejects.toThrow(/não podem ser alterados/);
  });

  it("agenda impede dois horários sobrepostos para o mesmo profissional", async () => {
    const cli = (
      await como(claimsDe(ids.donoA), `insert into clientes (nome) values ('Maria') returning id`)
    ).rows[0].id;
    const prof = (
      await como(claimsDe(ids.donoA), `insert into profissionais (nome) values ('Ana') returning id`)
    ).rows[0].id;
    const agendar = (inicio: string, fim: string) =>
      como(
        claimsDe(ids.donoA),
        `insert into agendamentos (cliente_id, profissional_id, inicio, fim) values ($1, $2, $3, $4)`,
        [cli, prof, inicio, fim],
      );
    await agendar("2026-10-10T13:00:00Z", "2026-10-10T14:00:00Z");
    await agendar("2026-10-10T14:00:00Z", "2026-10-10T14:30:00Z"); // encostado: pode
    await expect(agendar("2026-10-10T13:30:00Z", "2026-10-10T14:15:00Z")).rejects.toThrow(/agendamentos_sem_conflito/);
  });

  describe("onboarding", () => {
    const categorias = JSON.stringify([
      { tipo: "entrada", grupo: "receita", nome: "Serviço" },
      { tipo: "entrada", grupo: "receita", nome: "Peça" },
      { tipo: "saida", grupo: "custo", nome: "Peças" },
      { tipo: "saida", grupo: "despesa", nome: "Aluguel" },
    ]);
    const concluir = (sub: string, nome = "Oficina do Zé", saldo = 150000) =>
      como(claimsDe(sub), "select concluir_onboarding($1, 'mecanica', $2, false, $3::jsonb)", [nome, saldo, categorias]);

    it("salva os dados e cria as categorias do nicho na empresa do usuário", async () => {
      await concluir(ids.donoA);
      const e = await db.query(
        "select nome, nicho, saldo_inicial_centavos, agenda_ativa, onboarding_concluido from empresas where id = $1",
        [empresaA],
      );
      expect(e.rows[0]).toEqual({
        nome: "Oficina do Zé",
        nicho: "mecanica",
        saldo_inicial_centavos: "150000",
        agenda_ativa: false,
        onboarding_concluido: true,
      });
      const c = await db.query("select tipo, grupo, nome from categorias where empresa_id = $1 order by ordem", [empresaA]);
      expect(c.rows.map((r) => r.nome)).toEqual(["Serviço", "Peça", "Peças", "Aluguel"]);
    });

    it("clique duplo não duplica categorias nem sobrescreve os dados", async () => {
      await concluir(ids.donoA);
      await concluir(ids.donoA, "Outro nome", 1);
      const c = await db.query("select count(*)::int as n from categorias where empresa_id = $1", [empresaA]);
      expect(c.rows[0].n).toBe(4);
      const e = await db.query("select nome, saldo_inicial_centavos from empresas where id = $1", [empresaA]);
      expect(e.rows[0]).toEqual({ nome: "Oficina do Zé", saldo_inicial_centavos: "150000" });
    });

    it("não mexe na empresa de outro usuário", async () => {
      await concluir(ids.donoA);
      const b = await db.query("select onboarding_concluido, nome from empresas where id = $1", [empresaB]);
      expect(b.rows[0]).toEqual({ onboarding_concluido: false, nome: "Clínica B" });
    });

    it("rejeita nicho inválido e categoria com grupo errado", async () => {
      await expect(
        como(claimsDe(ids.donoA), "select concluir_onboarding('X', 'padaria', 0, false, '[]'::jsonb)"),
      ).rejects.toThrow(/nicho_check/);
      await expect(
        como(
          claimsDe(ids.donoA),
          `select concluir_onboarding('X', 'outro', 0, false, '[{"tipo":"entrada","grupo":"custo","nome":"Y"}]'::jsonb)`,
        ),
      ).rejects.toThrow(/check/);
    });

    it("visitante sem login não executa o onboarding", async () => {
      await db.query("savepoint anon2");
      await db.query("set local role anon");
      await expect(db.query("select concluir_onboarding('X', 'outro', 0, false, '[]'::jsonb)")).rejects.toThrow(
        /permission denied/,
      );
      await db.query("rollback to savepoint anon2");
      await db.query("reset role");
    });
  });

  describe("código e código de barras dos produtos", () => {
    const cadastrar = (sub: string, nome: string, codigoBarras?: string) =>
      como(
        claimsDe(sub),
        "insert into produtos (nome, codigo_barras) values ($1, $2) returning codigo, codigo_barras",
        [nome, codigoBarras ?? null],
      ).then((r) => r.rows[0]);

    it("numera em sequência por empresa e gera o EAN-13 interno", async () => {
      const a1 = await cadastrar(ids.donoA, "Óleo 5W30");
      const a2 = await cadastrar(ids.donoA, "Filtro de ar");
      const b1 = await cadastrar(ids.donoB, "Resina");
      expect([a1.codigo, a2.codigo, b1.codigo].map(Number)).toEqual([1, 2, 1]);
      expect(a1.codigo_barras).toBe("2000000000015");
      expect(a2.codigo_barras).toBe("2000000000022");
      expect(b1.codigo_barras).toBe("2000000000015"); // outra empresa: pode repetir
    });

    it("usa o código da embalagem quando informado", async () => {
      const p = await cadastrar(ids.donoA, "Caneta", "4006381333931");
      expect(p.codigo_barras).toBe("4006381333931");
      expect(Number(p.codigo)).toBe(1);
    });

    it("ignora número enviado pelo app", async () => {
      const r = await como(
        claimsDe(ids.donoA),
        "insert into produtos (nome, codigo) values ('Pneu', 999) returning codigo",
      );
      expect(Number(r.rows[0].codigo)).toBe(1);
    });

    it("não deixa dois produtos ativos com o mesmo código de barras", async () => {
      await cadastrar(ids.donoA, "Caneta", "4006381333931");
      await expect(cadastrar(ids.donoA, "Caneta azul", "4006381333931")).rejects.toThrow(/codigo_barras_unico/);
    });

    it("código de barras de produto excluído pode ser reaproveitado", async () => {
      await cadastrar(ids.donoA, "Caneta", "4006381333931");
      await como(claimsDe(ids.donoA), "update produtos set deleted_at = now() where codigo_barras = '4006381333931'");
      const p = await cadastrar(ids.donoA, "Caneta nova", "4006381333931");
      expect(Number(p.codigo)).toBe(2);
    });

    it("código não muda; apagar o código de barras volta para o interno", async () => {
      await cadastrar(ids.donoA, "Caneta", "4006381333931");
      await expect(como(claimsDe(ids.donoA), "update produtos set codigo = 50")).rejects.toThrow(/não pode ser alterado/);
      const r = await como(claimsDe(ids.donoA), "update produtos set codigo_barras = '' returning codigo_barras");
      expect(r.rows[0].codigo_barras).toBe("2000000000015");
    });

    it("cliente não lê nem mexe nos contadores", async () => {
      await cadastrar(ids.donoA, "Óleo");
      await expect(como(claimsDe(ids.donoA), "select * from sequencias")).rejects.toThrow(/permission denied/);
      await expect(
        como(claimsDe(ids.donoA), "select proximo_numero($1, 'produto')", [empresaB]),
      ).rejects.toThrow(/permission denied/);
    });
  });

  describe("lançamentos", () => {
    const categoria = async (sub: string, tipo: "entrada" | "saida", nome: string) =>
      (
        await como(
          claimsDe(sub),
          "insert into categorias (tipo, grupo, nome) values ($1, $2, $3) returning id",
          [tipo, tipo === "entrada" ? "receita" : "despesa", nome],
        )
      ).rows[0].id as string;

    it("recusa categoria de entrada num lançamento de saída", async () => {
      const cat = await categoria(ids.donoA, "entrada", "Serviço");
      await expect(
        como(claimsDe(ids.donoA), "insert into lancamentos (tipo, valor_centavos, categoria_id) values ('saida', 100, $1)", [cat]),
      ).rejects.toThrow(/não combina/);
    });

    it("pago ganha data de pagamento; pendente ganha vencimento e perde pago_em", async () => {
      const pago = await como(
        claimsDe(ids.donoA),
        "insert into lancamentos (tipo, valor_centavos, data) values ('saida', 100, '2026-10-05') returning pago_em::text",
      );
      expect(pago.rows[0].pago_em).toBe("2026-10-05");
      const pend = await como(
        claimsDe(ids.donoA),
        `insert into lancamentos (tipo, valor_centavos, data, status, pago_em)
         values ('saida', 100, '2026-10-20', 'pendente', '2026-10-01') returning pago_em, vencimento::text`,
      );
      expect(pend.rows[0]).toEqual({ pago_em: null, vencimento: "2026-10-20" });
    });

    it("parcelado ou recorrente conta como 1 lançamento no limite do mês", async () => {
      await como(
        claimsDe(ids.donoA),
        `insert into lancamentos (tipo, valor_centavos, data, status, grupo_id, parcela_numero, parcela_total)
         select 'saida', 1000, current_date + (n || ' month')::interval, 'pendente', '11111111-1111-1111-1111-111111111111', n + 1, 12
           from generate_series(0, 11) n`,
      );
      await como(claimsDe(ids.donoA), "insert into lancamentos (tipo, valor_centavos) values ('entrada', 500)");
      const r = await como(claimsDe(ids.donoA), "select uso_lancamentos_mes() as n");
      expect(r.rows[0].n).toBe(2);
      // a outra empresa não entra na conta
      const b = await como(claimsDe(ids.donoB), "select uso_lancamentos_mes() as n");
      expect(b.rows[0].n).toBe(1);
    });
  });

  describe("resumo financeiro (saldo, lucro e resultado do mês)", () => {
    it("calcula saldo, entradas, saídas e DRE só com o que foi pago", async () => {
      const A = claimsDe(ids.donoA);
      await db.query("update empresas set saldo_inicial_centavos = 100000 where id = $1", [empresaA]);
      const cat = async (tipo: string, grupo: string, nome: string) =>
        (await como(A, "insert into categorias (tipo, grupo, nome) values ($1, $2, $3) returning id", [tipo, grupo, nome])).rows[0].id;
      const servico = await cat("entrada", "receita", "Serviço");
      const pecas = await cat("saida", "custo", "Peças");
      const aluguel = await cat("saida", "despesa", "Aluguel");
      const lanc = (tipo: string, v: number, data: string, categoria: string | null, status = "pago") =>
        como(A, "insert into lancamentos (tipo, valor_centavos, data, categoria_id, status) values ($1, $2, $3, $4, $5)", [
          tipo, v, data, categoria, status,
        ]);
      const hoje = (await db.query("select hoje_sp()::text as d")).rows[0].d as string;
      const mes = hoje.slice(0, 7);
      await lanc("entrada", 50000, `${mes}-01`, servico); // +500
      await lanc("entrada", 25050, `${mes}-01`, servico); // +250,50
      await lanc("saida", 20000, `${mes}-01`, pecas); // custo 200
      await lanc("saida", 15000, `${mes}-01`, aluguel); // despesa 150
      await lanc("saida", 990, `${mes}-01`, null); // despesa sem categoria 9,90
      await lanc("saida", 99999, `${mes}-01`, aluguel, "pendente"); // pendente: fora do saldo
      await lanc("entrada", 70000, "2020-01-10", servico); // outro mês: entra no saldo, não no período
      await como(A, "update lancamentos set deleted_at = now() where valor_centavos = 990"); // excluído não conta
      await lanc("saida", 990, `${mes}-01`, null);

      const r = (
        await como(A, "select resumo_financeiro($1::date, (date_trunc('month', $1::date) + interval '1 month - 1 day')::date) as r", [
          `${mes}-01`,
        ])
      ).rows[0].r;

      expect(r.entradas).toBe(75050);
      expect(r.saidas).toBe(35990);
      expect(r.receitas).toBe(75050);
      expect(r.custos).toBe(20000);
      expect(r.despesas).toBe(15990);
      expect(r.receitas - r.custos - r.despesas).toBe(39060); // lucro R$ 390,60
      expect(r.a_pagar_periodo).toBe(99999);
      // saldo = inicial 1000 + 500 + 250,50 + 700 (2020) - 200 - 150 - 9,90
      expect(r.saldo_atual).toBe(100000 + 50000 + 25050 + 70000 - 20000 - 15000 - 990);
      expect(r.serie).toHaveLength(6);
      expect(r.serie.at(-1)).toEqual({ mes, entradas: 75050, saidas: 35990 });
    });

    it("não mistura dados de outra empresa", async () => {
      await como(claimsDe(ids.donoA), "insert into lancamentos (tipo, valor_centavos) values ('entrada', 123456)");
      const r = (await como(claimsDe(ids.donoB), "select resumo_financeiro(current_date - 30, current_date) as r")).rows[0].r;
      expect(r.entradas).toBe(15000); // só o lançamento da própria empresa B
    });
  });

  describe("estoque e vendas", () => {
    const A = () => claimsDe(ids.donoA);
    const produto = async (nome: string, custo: number, preco: number, estoque: number) =>
      (
        await como(
          A(),
          "insert into produtos (nome, custo_centavos, preco_centavos, estoque) values ($1, $2, $3, $4) returning id",
          [nome, custo, preco, estoque],
        )
      ).rows[0].id as string;
    const estoque = async (id: string) => Number((await db.query("select estoque from produtos where id = $1", [id])).rows[0].estoque);

    it("estoque inicial vira movimentação e não pode ser alterado direto", async () => {
      const p = await produto("Óleo", 2000, 3500, 10);
      const m = await db.query("select tipo, quantidade::float as q from movimentacoes_estoque where produto_id = $1", [p]);
      expect(m.rows).toEqual([{ tipo: "ajuste", q: 10 }]);
      await expect(como(A(), "update produtos set estoque = 99 where id = $1", [p])).rejects.toThrow(/registre uma entrada/);
      // outros campos continuam editáveis
      await como(A(), "update produtos set preco_centavos = 3900 where id = $1", [p]);
    });

    it("entrada, perda e ajuste mudam o estoque e registram o histórico", async () => {
      const p = await produto("Filtro", 1000, 2500, 5);
      await como(A(), "select movimentar_estoque($1, 'entrada', 10, 1200)", [p]);
      expect(await estoque(p)).toBe(15);
      expect(Number((await db.query("select custo_centavos from produtos where id = $1", [p])).rows[0].custo_centavos)).toBe(1200);
      await como(A(), "select movimentar_estoque($1, 'perda', 2)", [p]);
      expect(await estoque(p)).toBe(13);
      await como(A(), "select movimentar_estoque($1, 'ajuste', 20)", [p]); // contou 20
      expect(await estoque(p)).toBe(20);
      const soma = await db.query("select sum(quantidade)::float as s from movimentacoes_estoque where produto_id = $1", [p]);
      expect(soma.rows[0].s).toBe(20); // histórico explica o estoque
      await expect(como(A(), "select movimentar_estoque($1, 'perda', -1)", [p])).rejects.toThrow(/Quantidade inválida/);
    });

    it("compra paga lança a saída no caixa", async () => {
      const p = await produto("Pastilha", 0, 9000, 0);
      await como(A(), "select movimentar_estoque($1, 'entrada', 4, 4550, true, null, 'pix')", [p]);
      const l = await db.query("select tipo, valor_centavos::int as v, descricao from lancamentos where empresa_id = $1", [empresaA]);
      expect(l.rows).toEqual([{ tipo: "saida", v: 18200, descricao: "Compra: Pastilha" }]);
    });

    it("venda dá baixa no estoque, registra custo e gera a entrada no caixa", async () => {
      const p1 = await produto("Óleo 5W30", 2000, 3500, 10);
      const p2 = await produto("Arruela", 13, 50, 100);
      const servico = (
        await como(A(), "insert into servicos (nome, preco_centavos, custo_centavos) values ('Troca de óleo', 8000, 0) returning id")
      ).rows[0].id;
      const venda = {
        forma_pagamento: "pix",
        desconto_centavos: 500,
        itens: [
          { produto_id: p1, quantidade: 4, preco_unitario_centavos: 3500 }, // 140,00 custo 80,00
          { produto_id: p2, quantidade: 1.5, preco_unitario_centavos: 33 }, // 49,5 → 0,50; custo 19,5 → 0,20
          { servico_id: servico, quantidade: 1, preco_unitario_centavos: 8000 }, // 80,00
          { descricao: "Mão de obra extra", quantidade: 1, preco_unitario_centavos: 2000 },
        ],
      };
      const id = (await como(A(), "select registrar_venda($1::jsonb) as id", [JSON.stringify(venda)])).rows[0].id;

      const v = (
        await db.query(
          "select numero::int, subtotal_centavos::int s, desconto_centavos::int d, total_centavos::int t, custo_total_centavos::int c from vendas where id = $1",
          [id],
        )
      ).rows[0];
      expect(v).toEqual({ numero: 1, s: 24050, d: 500, t: 23550, c: 8020 });
      expect(v.t - v.c).toBe(15530); // lucro da venda R$ 155,30

      expect(await estoque(p1)).toBe(6);
      expect(await estoque(p2)).toBe(98.5);
      const l = await db.query("select tipo, valor_centavos::int v, descricao, status from lancamentos where venda_id = $1", [id]);
      expect(l.rows).toEqual([{ tipo: "entrada", v: 23550, descricao: "Venda #1", status: "pago" }]);
    });

    it("venda não pode ser editada; cancelar devolve o estoque e tira do caixa", async () => {
      const p = await produto("Óleo", 2000, 3500, 10);
      const id = (
        await como(A(), "select registrar_venda($1::jsonb) as id", [
          JSON.stringify({ itens: [{ produto_id: p, quantidade: 3, preco_unitario_centavos: 3500 }] }),
        ])
      ).rows[0].id;
      await expect(como(A(), "update vendas set total_centavos = 1 where id = $1", [id])).rejects.toThrow(/não pode ser alterada/);
      const itens = await como(A(), "update itens_venda set subtotal_centavos = 1 where venda_id = $1", [id]);
      expect(itens.rowCount).toBe(0); // itens de venda não têm política de update
      await como(A(), "select cancelar_venda($1)", [id]);
      expect(await estoque(p)).toBe(10);
      const l = await db.query("select count(*)::int n from lancamentos where venda_id = $1 and deleted_at is null", [id]);
      expect(l.rows[0].n).toBe(0);
    });

    it("recusa venda vazia, desconto maior que o total e produto de outra empresa", async () => {
      await expect(como(A(), `select registrar_venda('{"itens": []}'::jsonb)`)).rejects.toThrow(/pelo menos um item/);
      const p = await produto("Óleo", 2000, 3500, 10);
      await expect(
        como(A(), "select registrar_venda($1::jsonb)", [
          JSON.stringify({ desconto_centavos: 5000, itens: [{ produto_id: p, quantidade: 1, preco_unitario_centavos: 3500 }] }),
        ]),
      ).rejects.toThrow(/Desconto maior/);
      const deB = (
        await como(claimsDe(ids.donoB), "insert into produtos (nome, estoque) values ('Resina', 5) returning id")
      ).rows[0].id;
      await expect(
        como(A(), "select registrar_venda($1::jsonb)", [
          JSON.stringify({ itens: [{ produto_id: deB, quantidade: 1, preco_unitario_centavos: 100 }] }),
        ]),
      ).rejects.toThrow(/Produto não encontrado/);
      expect(Number((await db.query("select estoque from produtos where id = $1", [deB])).rows[0].estoque)).toBe(5);
    });
  });

  describe("agenda e indicadores", () => {
    it("calcula comparecimento, faltas, receita perdida e retorno", async () => {
      const A = claimsDe(ids.donoA);
      const um = async (sql: string, params: unknown[] = []) => (await como(A, sql, params)).rows[0].id as string;
      const ana = await um("insert into clientes (nome) values ('Ana') returning id");
      const bia = await um("insert into clientes (nome) values ('Bia') returning id");
      const prof = await um("insert into profissionais (nome) values ('Carla') returning id");
      const corte = await um("insert into servicos (nome, preco_centavos, duracao_minutos) values ('Corte', 5000, 30) returning id");
      const ag = (cliente: string, dia: string, hora: string, status: string) =>
        como(
          A,
          `insert into agendamentos (cliente_id, profissional_id, servico_id, inicio, fim, status)
           values ($1, $2, $3, ($4 || ' ' || $5 || ' America/Sao_Paulo')::timestamptz,
                   ($4 || ' ' || $5 || ' America/Sao_Paulo')::timestamptz + interval '30 min', $6)`,
          [cliente, prof, corte, dia, hora, status],
        );
      await ag(ana, "2026-09-02", "09:00", "compareceu");
      await ag(ana, "2026-09-10", "09:00", "compareceu");
      await ag(ana, "2026-09-15", "10:00", "faltou");
      await ag(bia, "2026-09-15", "11:00", "faltou");
      await ag(bia, "2026-09-16", "11:00", "faltou");
      await ag(bia, "2026-09-20", "11:00", "cancelado");
      await ag(bia, "2026-09-20", "11:00", "agendado"); // mesmo horário de um cancelado: pode

      const r = (await como(A, "select indicadores_agenda('2026-09-01', '2026-09-30') as r")).rows[0].r;
      expect(r.compareceu).toBe(2);
      expect(r.faltou).toBe(3);
      expect(r.receita_perdida).toBe(15000);
      expect(r.total).toBe(6); // cancelado fora
      expect(r.minutos_ocupados).toBe(180);
      expect(r.faltas_por_cliente).toEqual([
        { cliente: "Bia", faltas: 2 },
        { cliente: "Ana", faltas: 1 },
      ]);
      expect(r.clientes_atendidos_90d).toBe(1);
      expect(r.clientes_que_voltaram_90d).toBe(1);
    });
  });

  describe("WhatsApp: segurança da fila", () => {
    it("cliente não lê, não escreve e não cancela mensagens de outra empresa", async () => {
      const A = claimsDe(ids.donoA);
      const um = async (sql: string) => (await como(A, sql)).rows[0].id as string;
      const cli = await um("insert into clientes (nome, whatsapp) values ('Ana', '5511999998888') returning id");
      const prof = await um("insert into profissionais (nome) values ('Carla') returning id");
      const ag = await um(
        `insert into agendamentos (cliente_id, profissional_id, inicio, fim) values ('${cli}', '${prof}', now() + interval '3 days', now() + interval '3 days 30 min') returning id`,
      );
      await comoServidor(
        `insert into mensagens_whatsapp (empresa_id, agendamento_id, cliente_id, etapa, telefone, conteudo, agendado_para)
         values ($1, $2, $3, '1d', '5511999998888', 'Oi', now() + interval '2 days')`,
        [empresaA, ag, cli],
      );

      // B não vê, não insere e não cancela
      const v = await como(claimsDe(ids.donoB), "select count(*)::int n from mensagens_whatsapp");
      expect(v.rows[0].n).toBe(0);
      await expect(
        como(claimsDe(ids.donoB), "select cancelar_mensagens_agendamento($1)", [ag]),
      ).rejects.toThrow(/não encontrado/);
      await expect(
        como(A, `insert into mensagens_whatsapp (empresa_id, etapa, telefone, conteudo, agendado_para) values ($1, 'x', '1', 'x', now())`, [empresaA]),
      ).rejects.toThrow(/row-level security/);
      await expect(como(A, "select * from pegar_mensagens_para_envio(10)")).rejects.toThrow(/permission denied/);

      // o dono cancela as próprias; confirmar mantém só a do dia
      const n = await como(A, "select cancelar_mensagens_agendamento($1, true) as n", [ag]);
      expect(n.rows[0].n).toBe(1);
    });

    it("eh_servidor() é falso para cliente mesmo dentro de função security definer", async () => {
      const r = await como(claimsDe(ids.donoA), "select eh_servidor() as s");
      expect(r.rows[0].s).toBe(false);
    });
  });

  describe("relatórios", () => {
    it("mais vendidos agrupa itens e calcula lucro; lucro mensal bate com o resultado", async () => {
      const A = claimsDe(ids.donoA);
      const p1 = (await como(A, "insert into produtos (nome, custo_centavos, preco_centavos, estoque) values ('Óleo', 2000, 3500, 50) returning id")).rows[0].id;
      const venda = (itens: object[]) => como(A, "select registrar_venda($1::jsonb)", [JSON.stringify({ itens })]);
      await venda([{ produto_id: p1, quantidade: 2, preco_unitario_centavos: 3500 }, { descricao: "Mão de obra", quantidade: 1, preco_unitario_centavos: 8000 }]);
      await venda([{ produto_id: p1, quantidade: 1, preco_unitario_centavos: 3000 }]);
      const mv = (await como(A, "select relatorio_mais_vendidos(hoje_sp() - 1, hoje_sp() + 1) as r")).rows[0].r;
      expect(mv).toEqual([
        { descricao: "Óleo", tipo: "produto", quantidade: 3, receita: 10000, custo: 6000, lucro: 4000, vendas: 2 },
        { descricao: "Mão de obra", tipo: "avulso", quantidade: 1, receita: 8000, custo: 0, lucro: 8000, vendas: 1 },
      ]);

      await como(A, "insert into lancamentos (tipo, valor_centavos, data) values ('saida', 5000, hoje_sp())");
      const lm = (await como(A, "select relatorio_lucro_mensal(hoje_sp(), 3) as r")).rows[0].r;
      expect(lm).toHaveLength(3);
      expect(lm.at(-1)).toMatchObject({ receitas: 18000, despesas: 5000, lucro: 13000 });
      const b = (await como(claimsDe(ids.donoB), "select relatorio_mais_vendidos(hoje_sp() - 1, hoje_sp() + 1) as r")).rows[0].r;
      expect(b).toEqual([]);
    });
  });

  describe("assinatura: somente leitura", () => {
    it("teste vencido ou inadimplente: lê tudo, não grava nada; ativo volta a gravar", async () => {
      const A = claimsDe(ids.donoA);
      const lanc = await como(A, "insert into lancamentos (tipo, valor_centavos) values ('entrada', 1000) returning id");
      const id = lanc.rows[0].id;

      await db.query("update empresas set teste_ate = now() - interval '1 minute' where id = $1", [empresaA]);
      expect((await como(A, "select count(*)::int n from lancamentos")).rows[0].n).toBe(1); // continua lendo
      await expect(como(A, "insert into lancamentos (tipo, valor_centavos) values ('entrada', 1)")).rejects.toThrow(/row-level security/);
      const upd = await como(A, "update lancamentos set valor_centavos = 2 where id = $1", [id]);
      expect(upd.rowCount).toBe(0);
      await expect(como(A, "select registrar_venda($1::jsonb)", [JSON.stringify({ itens: [{ descricao: "x", quantidade: 1, preco_unitario_centavos: 100 }] })])).rejects.toThrow(
        /row-level security/,
      );
      expect((await como(A, "update empresas set nome = 'Outro' where id = $1", [empresaA])).rowCount).toBe(0);

      await db.query("update empresas set status_assinatura = 'inadimplente' where id = $1", [empresaA]);
      await expect(como(A, "insert into clientes (nome) values ('Ana')")).rejects.toThrow(/row-level security/);

      // pagamento confirmado (feito pelo servidor/webhook)
      await comoServidor("update empresas set status_assinatura = 'ativo' where id = $1", [empresaA]);
      await como(A, "insert into clientes (nome) values ('Ana')");

      // admin com 2FA continua podendo corrigir dados de conta bloqueada
      await db.query("update empresas set status_assinatura = 'suspenso' where id = $1", [empresaA]);
      const adm = await como(claimsAdmin(), "update lancamentos set valor_centavos = 3 where id = $1", [id]);
      expect(adm.rowCount).toBe(1);
    });
  });

  describe("admin e modo suporte", () => {
    const suporte = (empresa: string) => ({ "x-modo-suporte": "1", "x-empresa-suporte": empresa });

    it("no modo suporte o admin vê e grava só a empresa escolhida, com log", async () => {
      const adm = claimsAdmin();
      const empresas = await como(adm, "select id from empresas", [], suporte(empresaB));
      expect(empresas.rows.map((r) => r.id)).toEqual([empresaB]);
      const lanc = await como(adm, "select count(*)::int n from lancamentos", [], suporte(empresaB));
      expect(lanc.rows[0].n).toBe(1);
      // inserção sem empresa_id cai na empresa do suporte
      const novo = await como(adm, "insert into lancamentos (tipo, valor_centavos) values ('saida', 700) returning empresa_id", [], suporte(empresaB));
      expect(novo.rows[0].empresa_id).toBe(empresaB);
      const log = await db.query("select tabela, acao, empresa_id, modo_suporte from log_admin");
      expect(log.rows).toEqual([{ tabela: "lancamentos", acao: "insert", empresa_id: empresaB, modo_suporte: true }]);
    });

    it("cliente que forja os cabeçalhos de suporte não vê nada de outra empresa", async () => {
      const r = await como(claimsDe(ids.donoA), "select id from empresas", [], suporte(empresaB));
      expect(r.rows.map((x) => x.id)).toEqual([empresaA]);
      const l = await como(claimsDe(ids.donoA), "select count(*)::int n from lancamentos", [], suporte(empresaB));
      expect(l.rows[0].n).toBe(0);
    });

    it("admin sem 2FA com cabeçalho de suporte também não vê", async () => {
      const r = await como(claimsAdmin("aal1"), "select count(*)::int n from empresas", [], suporte(empresaB));
      expect(r.rows[0].n).toBe(0);
    });

    it("painel e lista de empresas só para admin fora do modo suporte", async () => {
      const lista = await como(claimsAdmin(), "select nome, emails from admin_empresas('clínica')");
      expect(lista.rows).toEqual([{ nome: "Clínica B", emails: "b@teste.com" }]);
      const painel = (await como(claimsAdmin(), "select admin_painel() as p")).rows[0].p;
      expect(painel.total).toBe(3);
      await expect(como(claimsDe(ids.donoA), "select * from admin_empresas()")).rejects.toThrow(/Acesso negado/);
      await expect(como(claimsAdmin(), "select admin_painel()", [], suporte(empresaB))).rejects.toThrow(/Acesso negado/);
    });

    it("registra o último acesso do cliente, mas não o do admin em suporte", async () => {
      await como(claimsDe(ids.donoA), "select registrar_acesso()");
      const r = await db.query("select ultimo_acesso_em is not null as ok from empresas where id = $1", [empresaA]);
      expect(r.rows[0].ok).toBe(true);
    });
  });
  describe("link público de agendamento", () => {
    const A = claimsDe(ids.donoA);
    const AGENDAR = "select agendar_online($1, $2, $3, $4, $5, $6, $7) as r";
    let servico: string;
    let ana: string;
    /** Próximo dia útil (seg a sáb) daqui a pelo menos 2 dias, às HH:MM de São Paulo. */
    const horario = async (hora: string, pular = 0) =>
      (
        await db.query(
          `select ((d::date + $1::time) at time zone 'America/Sao_Paulo') as t, d::date::text as dia
             from generate_series((now() at time zone 'America/Sao_Paulo')::date + 2,
                                  (now() at time zone 'America/Sao_Paulo')::date + 12, interval '1 day') d
            where extract(dow from d) between 1 and 6
            order by d offset $2 limit 1`,
          [hora, pular],
        )
      ).rows[0] as { t: Date; dia: string };

    beforeEach(async () => {
      await como(A, "update empresas set agenda_ativa = true, agendamento_online = true where id = $1", [empresaA]);
      servico = (await como(A, "insert into servicos (nome, preco_centavos, duracao_minutos) values ('Corte', 4000, 30) returning id")).rows[0].id;
      ana = (await como(A, "insert into profissionais (nome) values ('Ana') returning id")).rows[0].id;
      await como(A, "insert into profissionais (nome) values ('Bia')");
    });

    it("cada empresa ganha um endereço com o próprio nome, sem repetir", async () => {
      const r = await db.query("select nome, slug from empresas where id = any($1) order by nome", [[empresaA, empresaB]]);
      expect(r.rows).toEqual([
        { nome: "Clínica B", slug: "clinica-b" },
        { nome: "Oficina A", slug: "oficina-a" },
      ]);
      await db.query(`insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'c@teste.com', '{"nome_empresa":"Oficina A"}')`);
      const repetida = await db.query("select slug from empresas where nome = 'Oficina A' order by criado_em, slug");
      expect(repetida.rows.map((x) => x.slug).sort()).toEqual(["oficina-a", "oficina-a-2"]);
      expect((await db.query("select gerar_slug('  Barbearia do Zé (demonstração) ') as s, gerar_slug('Zé') as curto, gerar_slug('!!!') as vazio")).rows[0]).toEqual({
        s: "barbearia-do-ze-demonstracao",
        curto: "empresa-ze",
        vazio: "empresa",
      });
    });

    it("empresa sem nome ainda não tem endereço; ganha quando o dono dá o nome", async () => {
      const id = "00000000-0000-0000-0000-0000000000c1";
      await db.query("insert into auth.users (id, email) values ($1, 'semnome@teste.com')", [id]);
      const C = claimsDe(id);
      expect((await como(C, "select slug from empresas")).rows[0].slug).toBeNull();
      await como(C, "update empresas set nome = 'Salão da Cida'");
      expect((await como(C, "select slug from empresas")).rows[0].slug).toBe("salao-da-cida");
    });

    it("trocar o nome não muda o endereço; o dono troca, mas não repete nem inventa formato", async () => {
      await como(A, "update empresas set nome = 'Oficina do Zé' where id = $1", [empresaA]);
      expect((await como(A, "select slug from empresas")).rows[0].slug).toBe("oficina-a");
      await como(A, "update empresas set slug = ' Oficina-do-Ze ' where id = $1", [empresaA]);
      expect((await como(A, "select slug from empresas")).rows[0].slug).toBe("oficina-do-ze");
      await expect(como(A, "update empresas set slug = 'clinica-b' where id = $1", [empresaA])).rejects.toThrow(/empresas_slug_unico/);
      await expect(como(A, "update empresas set slug = 'com espaço' where id = $1", [empresaA])).rejects.toThrow(/empresas_slug_formato/);
      await expect(como(A, "update empresas set slug = 'ab' where id = $1", [empresaA])).rejects.toThrow(/empresas_slug_formato/);
    });

    it("visitante só enxerga a página de quem ligou o agendamento online", async () => {
      expect((await comoVisitante("select agenda_publica('clinica-b') as p")).rows[0].p).toBeNull();
      expect((await comoVisitante("select agenda_publica('nao-existe') as p")).rows[0].p).toBeNull();
      const p = (await comoVisitante("select agenda_publica(' Oficina-A ') as p")).rows[0].p;
      expect(p.empresa).toEqual({ nome: "Oficina A", nicho: "outro", mensagem: null, logo_versao: null });
      expect(p.horario).toMatchObject({ abertura: "08:00", fechamento: "18:00", dias: [1, 2, 3, 4, 5, 6], dias_adiante: 30, antecedencia_horas: 1, datas_fechadas: [] });
      expect(p.profissionais.map((x: { nome: string }) => x.nome)).toEqual(["Ana", "Bia"]);
      expect(p.servicos).toEqual([{ id: servico, nome: "Corte", duracao_minutos: 30, preco_centavos: 4000 }]);
      expect(p.ocupados).toEqual([]);
      // continua sem ler nenhuma tabela
      await expect(comoVisitante("select * from empresas")).rejects.toThrow(/permission denied/);
      await expect(comoVisitante("select * from agendamentos")).rejects.toThrow(/permission denied/);
      await expect(comoVisitante("select * from clientes")).rejects.toThrow(/permission denied/);
    });

    it("some com a agenda desligada, o link desligado ou a conta bloqueada; preço pode ficar escondido", async () => {
      const visivel = async () => (await comoVisitante("select agenda_publica('oficina-a') as p")).rows[0].p;
      await como(A, "update empresas set agendamento_mostrar_precos = false where id = $1", [empresaA]);
      expect((await visivel()).servicos[0].preco_centavos).toBeNull();
      await como(A, "update empresas set agenda_ativa = false where id = $1", [empresaA]);
      expect(await visivel()).toBeNull();
      await como(A, "update empresas set agenda_ativa = true, agendamento_online = false where id = $1", [empresaA]);
      expect(await visivel()).toBeNull();
      await como(A, "update empresas set agendamento_online = true where id = $1", [empresaA]);
      await db.query("update empresas set teste_ate = now() - interval '1 minute' where id = $1", [empresaA]);
      expect(await visivel()).toBeNull();
      const { t } = await horario("10:00");
      await expect(comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "Maria", "5511999998888", null])).rejects.toThrow(/não está disponível/);
    });

    it("visitante marca: nasce o cliente e o horário entra direto na agenda do dono", async () => {
      const { t } = await horario("10:00");
      const r = (await comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "  Maria Souza ", "5511999998888", "Primeira vez"])).rows[0].r;
      expect(r).toMatchObject({ empresa: "Oficina A", profissional: "Ana", servico: "Corte", empresa_id: empresaA });
      expect(new Date(r.fim).getTime() - new Date(r.inicio).getTime()).toBe(30 * 60_000);

      const ag = await como(A, "select a.status, a.origem, a.observacao, a.profissional_id, c.nome, c.whatsapp from agendamentos a join clientes c on c.id = a.cliente_id");
      expect(ag.rows).toEqual([{ status: "agendado", origem: "link", observacao: "Primeira vez", profissional_id: ana, nome: "Maria Souza", whatsapp: "5511999998888" }]);
      // a outra empresa não vê nada disso
      expect((await como(claimsDe(ids.donoB), "select count(*)::int n from agendamentos")).rows[0].n).toBe(0);
      expect((await como(claimsDe(ids.donoB), "select count(*)::int n from clientes")).rows[0].n).toBe(0);
      // o horário aparece como ocupado na página, sem dizer de quem é
      const p = (await comoVisitante("select agenda_publica('oficina-a') as p")).rows[0].p;
      expect(p.ocupados).toHaveLength(1);
      expect(Object.keys(p.ocupados[0]).sort()).toEqual(["fim", "inicio", "profissional"]);
      expect(p.ocupados[0].profissional).toBe(ana);
    });

    it("mesmo WhatsApp reaproveita o cadastro e não troca o nome que o dono salvou", async () => {
      const cli = (await como(A, "insert into clientes (nome, whatsapp) values ('Dona Maria', '5511999998888') returning id")).rows[0].id;
      const { t } = await horario("11:00");
      await comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "Maria", "5511999998888", null]);
      const r = await como(A, "select c.id, c.nome from agendamentos a join clientes c on c.id = a.cliente_id");
      expect(r.rows).toEqual([{ id: cli, nome: "Dona Maria" }]);
      expect((await como(A, "select count(*)::int n from clientes")).rows[0].n).toBe(1);
    });

    it("não deixa dois clientes no mesmo horário do mesmo profissional", async () => {
      const { t } = await horario("14:00");
      const depois = new Date(t.getTime() + 15 * 60_000);
      await comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "Maria", "5511999998888", null]);
      await expect(comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "João", "5511988887777", null])).rejects.toThrow(/acabou de ser ocupado/);
      await expect(comoVisitante(AGENDAR, ["oficina-a", servico, ana, depois, "João", "5511988887777", null])).rejects.toThrow(/acabou de ser ocupado/);
      // a recusa não deixa cliente "fantasma" cadastrado
      expect((await como(A, "select count(*)::int n from clientes")).rows[0].n).toBe(1);
    });

    it("sem preferência de profissional: pega quem estiver livre; lotado, recusa", async () => {
      const { t } = await horario("15:00");
      const quem = async (nome: string, zap: string) => (await comoVisitante(AGENDAR, ["oficina-a", servico, null, t, nome, zap, null])).rows[0].r.profissional;
      expect(await quem("Maria", "5511999998888")).toBe("Ana");
      expect(await quem("João", "5511988887777")).toBe("Bia");
      await expect(quem("Pedro", "5511977776666")).rejects.toThrow(/acabou de ser ocupado/);
    });

    it("recusa dia fechado, data bloqueada, fora do expediente, passado e longe demais", async () => {
      const ok = await horario("10:00");
      const tentar = (t: Date | string) => comoVisitante(AGENDAR, ["oficina-a", servico, ana, t, "Maria", "5511999998888", null]);
      const sp = async (expr: string) => (await db.query(`select ((${expr}) at time zone 'America/Sao_Paulo') as t`)).rows[0].t as Date;
      const hoje = "(now() at time zone 'America/Sao_Paulo')::date";

      // domingo (a empresa atende de seg a sáb)
      const domingo = await sp(`(select d::date from generate_series(${hoje} + 2, ${hoje} + 9, interval '1 day') d where extract(dow from d) = 0 limit 1) + time '10:00'`);
      await expect(tentar(domingo)).rejects.toThrow(/Não há atendimento nesse dia/);
      // data que o dono fechou (feriado, folga)
      await como(A, "update empresas set datas_fechadas = array[$2::date] where id = $1", [empresaA, ok.dia]);
      await expect(tentar(ok.t)).rejects.toThrow(/Não há atendimento nesse dia/);
      await como(A, "update empresas set datas_fechadas = '{}' where id = $1", [empresaA]);
      // antes de abrir e terminando depois de fechar (17:45 + 30 min passa das 18:00)
      await expect(tentar((await horario("07:45")).t)).rejects.toThrow(/fora do período/);
      await expect(tentar((await horario("17:45")).t)).rejects.toThrow(/fora do período/);
      // horário quebrado
      await expect(tentar((await horario("10:07")).t)).rejects.toThrow(/Horário inválido/);
      // passado e além da janela de dias
      await expect(tentar(await sp(`${hoje} - 1 + time '10:00'`))).rejects.toThrow(/já passou/);
      await como(A, "update empresas set agendamento_dias_adiante = 1 where id = $1", [empresaA]);
      await expect(tentar(ok.t)).rejects.toThrow(/ainda não está aberta/);
      await como(A, "update empresas set agendamento_dias_adiante = 30 where id = $1", [empresaA]);
      // no fim, o horário certo passa
      await tentar(ok.t);
    });

    it("respeita a antecedência mínima escolhida pelo dono", async () => {
      await como(A, "update empresas set agendamento_antecedencia_horas = 72, horario_abertura = '00:00', horario_fechamento = '23:59', dias_funcionamento = '{0,1,2,3,4,5,6}' where id = $1", [empresaA]);
      const emDoisDias = (await db.query("select date_trunc('hour', now() + interval '48 hours') as t")).rows[0].t;
      await expect(comoVisitante(AGENDAR, ["oficina-a", servico, ana, emDoisDias, "Maria", "5511999998888", null])).rejects.toThrow(/muito em cima da hora/);
    });

    it("recusa serviço e profissional de outra empresa, nome vazio e WhatsApp inválido", async () => {
      const B = claimsDe(ids.donoB);
      const servicoB = (await como(B, "insert into servicos (nome) values ('Limpeza') returning id")).rows[0].id;
      const profB = (await como(B, "insert into profissionais (nome) values ('Dr. Caio') returning id")).rows[0].id;
      const { t } = await horario("09:00");
      const tentar = (s: string | null, p: string | null, nome: string, zap: string) => comoVisitante(AGENDAR, ["oficina-a", s, p, t, nome, zap, null]);
      await expect(tentar(servicoB, ana, "Maria", "5511999998888")).rejects.toThrow(/Serviço não encontrado/);
      await expect(tentar(servico, profB, "Maria", "5511999998888")).rejects.toThrow(/Profissional não encontrado/);
      await expect(tentar(null, ana, "Maria", "5511999998888")).rejects.toThrow(/Escolha o serviço/);
      await expect(tentar(servico, ana, " ", "5511999998888")).rejects.toThrow(/Digite o seu nome/);
      await expect(tentar(servico, ana, "Maria", "(11) 99999-8888")).rejects.toThrow(/WhatsApp inválido/);
      expect((await como(A, "select count(*)::int n from agendamentos")).rows[0].n).toBe(0);
      expect((await como(B, "select count(*)::int n from agendamentos")).rows[0].n).toBe(0);
    });

    it("empresa sem serviço cadastrado: marca um atendimento de 30 minutos", async () => {
      await como(A, "update servicos set deleted_at = now() where id = $1", [servico]);
      const { t } = await horario("16:00");
      const r = (await comoVisitante(AGENDAR, ["oficina-a", null, ana, t, "Maria", "5511999998888", null])).rows[0].r;
      expect(r.servico).toBeNull();
      expect(new Date(r.fim).getTime() - new Date(r.inicio).getTime()).toBe(30 * 60_000);
    });

    it("o mesmo WhatsApp não enche a agenda: no máximo 3 horários futuros", async () => {
      for (const h of ["09:00", "10:00", "11:00"]) {
        await comoVisitante(AGENDAR, ["oficina-a", servico, ana, (await horario(h)).t, "Maria", "5511999998888", null]);
      }
      await expect(comoVisitante(AGENDAR, ["oficina-a", servico, ana, (await horario("12:00")).t, "Maria", "5511999998888", null])).rejects.toThrow(/já tem horários marcados/);
      // outra pessoa continua marcando normalmente
      await comoVisitante(AGENDAR, ["oficina-a", servico, ana, (await horario("12:00")).t, "João", "5511988887777", null]);
    });

    it("visitante não chama as funções internas do endereço", async () => {
      await expect(comoVisitante("select slug_livre('oficina-a', null)")).rejects.toThrow(/permission denied/);
      await expect(comoVisitante("select gerar_slug('x')")).rejects.toThrow(/permission denied/);
      await expect(como(A, "select slug_livre('oficina-a', null)")).rejects.toThrow(/permission denied/);
    });
  });

  describe("perguntas do cadastro e pedido de marketing", () => {
    const A = claimsDe(ids.donoA);
    const B = claimsDe(ids.donoB);

    it("o dono responde e só ele (e o admin) enxerga", async () => {
      await como(A, "insert into perfil_negocio (tempo_negocio, equipe, faturamento, controle_caixa, dificuldade, origem) values ('3_a_5', '2_a_5', '15k_a_30k', 'planilha', 'saber_lucro', 'instagram')");
      const meu = await como(A, "select empresa_id, tempo_negocio, quer_marketing, marketing_pedido_em from perfil_negocio");
      expect(meu.rows).toEqual([{ empresa_id: empresaA, tempo_negocio: "3_a_5", quer_marketing: false, marketing_pedido_em: null }]);
      expect((await como(B, "select count(*)::int n from perfil_negocio")).rows[0].n).toBe(0);
      expect((await como(claimsAdmin(), "select count(*)::int n from perfil_negocio")).rows[0].n).toBe(1);
      await expect(comoVisitante("select * from perfil_negocio")).rejects.toThrow(/permission denied/);
    });

    it("ninguém grava o perfil de outra empresa nem inventa resposta fora da lista", async () => {
      await expect(como(A, "insert into perfil_negocio (empresa_id, equipe) values ($1, 'so_eu')", [empresaB])).rejects.toThrow(/row-level security/);
      await expect(como(A, "insert into perfil_negocio (faturamento) values ('um_milhao')")).rejects.toThrow(/perfil_negocio_faturamento_check/);
      await como(B, "insert into perfil_negocio (equipe) values ('so_eu')");
      expect((await como(A, "update perfil_negocio set equipe = 'mais_10' where empresa_id = $1", [empresaB])).rowCount).toBe(0);
      await expect(como(A, "delete from perfil_negocio")).rejects.toThrow(/permission denied/);
    });

    it("pedido de marketing guarda a data do pedido e aparece para o admin", async () => {
      await como(A, "insert into perfil_negocio (quer_marketing, whatsapp_contato) values (true, '5543999990000')");
      const pedido = (await como(A, "select marketing_pedido_em from perfil_negocio")).rows[0].marketing_pedido_em;
      expect(pedido).not.toBeNull();
      // responder outra pergunta depois não mexe na data do pedido
      await como(A, "update perfil_negocio set equipe = 'so_eu', marketing_pedido_em = now() + interval '1 day'");
      expect((await como(A, "select marketing_pedido_em from perfil_negocio")).rows[0].marketing_pedido_em).toEqual(pedido);

      const lista = await como(claimsAdmin(), "select nome, quer_marketing, whatsapp_contato, slug, agendamento_online from admin_empresas('oficina')");
      expect(lista.rows).toEqual([{ nome: "Oficina A", quer_marketing: true, whatsapp_contato: "5543999990000", slug: "oficina-a", agendamento_online: false }]);
      const painel = (await como(claimsAdmin(), "select admin_painel() as p")).rows[0].p;
      expect(painel).toMatchObject({ querem_marketing: 1, agendamento_online: 0, testes_acabando: 0, testes_vencidos: 0 });

      // desistiu: some da lista de pedidos
      await como(A, "update perfil_negocio set quer_marketing = false");
      expect((await como(A, "select marketing_pedido_em from perfil_negocio")).rows[0].marketing_pedido_em).toBeNull();
    });

    it("conta em somente leitura ainda consegue pedir contato", async () => {
      await db.query("update empresas set status_assinatura = 'inadimplente' where id = $1", [empresaA]);
      await como(A, "insert into perfil_negocio (quer_marketing) values (true)");
      expect((await como(A, "select quer_marketing from perfil_negocio")).rows[0].quer_marketing).toBe(true);
    });

    it("painel conta testes acabando e vencidos", async () => {
      await db.query("update empresas set teste_ate = now() + interval '2 days' where id = $1", [empresaA]);
      await db.query("update empresas set teste_ate = now() - interval '1 day' where id = $1", [empresaB]);
      const painel = (await como(claimsAdmin(), "select admin_painel() as p")).rows[0].p;
      expect(painel).toMatchObject({ testes_acabando: 1, testes_vencidos: 1 });
    });
  });
  describe("logo da empresa no link de agendamento", () => {
    const A = claimsDe(ids.donoA);
    const B = claimsDe(ids.donoB);
    const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    const WEBP = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
    const SALVAR = "insert into logos_empresa (imagem) values ($1) on conflict (empresa_id) do update set imagem = excluded.imagem";

    it("o dono guarda, troca e apaga a própria logo; só ele (e o admin) lê a tabela", async () => {
      await como(A, SALVAR, [PNG]);
      await como(A, SALVAR, [WEBP]);
      expect((await como(A, "select empresa_id, imagem from logos_empresa")).rows).toEqual([{ empresa_id: empresaA, imagem: WEBP }]);
      expect((await como(B, "select count(*)::int n from logos_empresa")).rows[0].n).toBe(0);
      expect((await como(claimsAdmin(), "select count(*)::int n from logos_empresa")).rows[0].n).toBe(1);
      await expect(comoVisitante("select * from logos_empresa")).rejects.toThrow(/permission denied/);
      expect((await como(A, "delete from logos_empresa")).rowCount).toBe(1);
    });

    it("ninguém mexe na logo de outra empresa", async () => {
      await como(B, SALVAR, [PNG]);
      await expect(como(A, "insert into logos_empresa (empresa_id, imagem) values ($1, $2)", [empresaB, WEBP])).rejects.toThrow(/row-level security/);
      expect((await como(A, "update logos_empresa set imagem = $1", [WEBP])).rowCount).toBe(0);
      expect((await como(A, "delete from logos_empresa")).rowCount).toBe(0);
      expect((await como(B, "select imagem from logos_empresa")).rows[0].imagem).toBe(PNG);
    });

    it("só entra PNG, JPEG ou WebP dentro do limite de tamanho", async () => {
      for (const ruim of [
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "https://exemplo.com/logo.png",
        "data:image/png;base64,",
        "data:image/png;base64,AAAA\"><script>",
        `data:image/png;base64,${"A".repeat(300000)}`,
      ]) {
        await expect(como(A, SALVAR, [ruim])).rejects.toThrow(/logos_empresa_imagem_check/);
      }
    });

    it("o visitante só recebe a logo com o link no ar, e a página avisa quando ela muda", async () => {
      await como(A, SALVAR, [PNG]);
      const logo = async () => (await comoVisitante("select logo_publica(' Oficina-A ') as l")).rows[0].l;
      const versao = async () => (await comoVisitante("select agenda_publica('oficina-a') as p")).rows[0].p?.empresa.logo_versao;
      // link ainda desligado: nada de logo
      expect(await logo()).toBeNull();
      await como(A, "update empresas set agenda_ativa = true, agendamento_online = true where id = $1", [empresaA]);
      expect(await logo()).toBe(PNG);
      const v1 = await versao();
      expect(typeof v1).toBe("number");
      // trocar a logo muda a versão (o navegador busca a imagem nova)
      // (o teste roda numa transação só, onde now() não anda: recua a hora da primeira logo)
      await db.query("alter table logos_empresa disable trigger logos_empresa_atualizado_em");
      await db.query("update logos_empresa set atualizado_em = now() - interval '1 hour' where empresa_id = $1", [empresaA]);
      await db.query("alter table logos_empresa enable trigger logos_empresa_atualizado_em");
      const antiga = await versao();
      expect(antiga).toBeLessThan(v1);
      await como(A, SALVAR, [WEBP]);
      expect(await logo()).toBe(WEBP);
      expect(await versao()).toBeGreaterThan(antiga);
      // empresa sem logo e empresa que não existe
      expect((await comoVisitante("select logo_publica('clinica-b') as l")).rows[0].l).toBeNull();
      expect((await comoVisitante("select logo_publica('nao-existe') as l")).rows[0].l).toBeNull();
      // conta bloqueada: o link sai do ar e a logo também
      await db.query("update empresas set status_assinatura = 'inadimplente' where id = $1", [empresaA]);
      expect(await logo()).toBeNull();
    });

    it("conta em somente leitura não troca a logo, mas consegue apagar", async () => {
      await como(A, SALVAR, [PNG]);
      await db.query("update empresas set status_assinatura = 'inadimplente' where id = $1", [empresaA]);
      await expect(como(A, SALVAR, [WEBP])).rejects.toThrow(/row-level security/);
      expect((await como(A, "select imagem from logos_empresa")).rows[0].imagem).toBe(PNG);
      expect((await como(A, "delete from logos_empresa")).rowCount).toBe(1);
    });

    it("troca feita pelo admin em modo suporte fica no log, sem copiar a imagem", async () => {
      await como(A, SALVAR, [PNG]);
      const suporte = { "x-modo-suporte": "1", "x-empresa-suporte": empresaA };
      await como(claimsAdmin(), "update logos_empresa set imagem = $1 where empresa_id = $2", [WEBP, empresaA], suporte);
      const log = (await db.query("select acao, tabela, empresa_id, valor_anterior, valor_novo from log_admin where tabela = 'logos_empresa'")).rows;
      expect(log).toEqual([
        { acao: "update", tabela: "logos_empresa", empresa_id: empresaA, valor_anterior: { empresa_id: empresaA, tamanho: PNG.length }, valor_novo: { empresa_id: empresaA, tamanho: WEBP.length } },
      ]);
    });
  });
});
