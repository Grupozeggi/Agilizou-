// Junta todas as migrations num arquivo só (supabase/instalar.sql), para
// instalar o banco colando um único arquivo no SQL Editor do Supabase.
// Uso: npm run sql:juntar
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..");

export function montarInstalacao() {
  const pasta = path.join(raiz, "supabase/migrations");
  const arquivos = readdirSync(pasta).filter((f) => f.endsWith(".sql")).sort();
  const partes = arquivos.map((f) => `-- >>> ${f}\n${readFileSync(path.join(pasta, f), "utf8").trimEnd()}\n`);
  return [
    "-- =============================================================================",
    "-- Agilizou — instalação completa do banco (gerado por scripts/juntar-sql.mjs)",
    "-- Supabase → SQL Editor → cole este arquivo inteiro → Run. Rode uma vez só,",
    "-- num projeto novo. NÃO edite à mão: altere as migrations e rode",
    "-- `npm run sql:juntar`.",
    "-- =============================================================================",
    "",
    ...partes,
  ].join("\n");
}

if (process.argv[1] === import.meta.filename) {
  writeFileSync(path.join(raiz, "supabase/instalar.sql"), montarInstalacao());
  console.log("supabase/instalar.sql atualizado.");
}
