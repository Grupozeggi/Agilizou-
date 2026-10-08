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
});
