import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { montarInstalacao } from "../scripts/juntar-sql.mjs";

describe("supabase/instalar.sql", () => {
  it("está igual à soma das migrations (rode `npm run sql:juntar` se falhar)", () => {
    const atual = readFileSync(path.resolve(import.meta.dirname, "../supabase/instalar.sql"), "utf8");
    expect(atual).toBe(montarInstalacao());
  });
});
