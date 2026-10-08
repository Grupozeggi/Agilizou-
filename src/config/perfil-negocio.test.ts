import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PERGUNTAS, rotuloDaResposta, TELA_DA_PERGUNTA, valoresDe } from "./perfil-negocio";

describe("perguntas do cadastro", () => {
  it("as respostas aceitas são exatamente as do banco", () => {
    const sql = readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261008000014_perfil_negocio.sql"), "utf8");
    for (const p of PERGUNTAS) {
      const m = new RegExp(`check \\(${p.campo} in \\(([^)]+)\\)\\)`).exec(sql);
      expect(m, `faltou o check de ${p.campo} na migration`).not.toBeNull();
      const noBanco = m![1].split(",").map((v) => v.trim().replace(/'/g, ""));
      expect(noBanco).toEqual(valoresDe(p.campo));
    }
  });

  it("toda pergunta tem tela, texto e pelo menos duas respostas sem repetir", () => {
    for (const p of PERGUNTAS) {
      expect(TELA_DA_PERGUNTA[p.campo]).toBeGreaterThanOrEqual(2);
      expect(p.pergunta.endsWith("?")).toBe(true);
      expect(p.opcoes.length).toBeGreaterThanOrEqual(2);
      expect(new Set(valoresDe(p.campo)).size).toBe(p.opcoes.length);
    }
  });

  it("traduz a resposta guardada para o texto", () => {
    expect(rotuloDaResposta("faturamento", "15k_a_30k")).toBe("De R$ 15 mil a R$ 30 mil");
    expect(rotuloDaResposta("equipe", null)).toBeNull();
    expect(rotuloDaResposta("equipe", "valor_antigo")).toBeNull();
  });
});
