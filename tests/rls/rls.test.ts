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
    await db.query("reset role");
    return r;
  } catch (e) {
    await db.query("rollback to savepoint como");
    await db.query("reset role");
    throw e;
  }
}

async function comoServidor(sql: string, params: unknown[] = []) {
  await db.query("savepoint srv");
  try {
    await db.query("set local role service_role");
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ role: "service_role" })]);
    const r = await db.query(sql, params);
    await db.query("release savepoint srv");
    await db.query("reset role");
    return r;
  } catch (e) {
    await db.query("rollback to savepoint srv");
    await db.query("reset role");
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
});
