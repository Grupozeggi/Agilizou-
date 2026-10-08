import { describe, expect, it } from "vitest";
import { adminCom2fa, caminhoSeguro, temPapelAdmin } from "./acesso";

describe("acesso", () => {
  it("admin só pelo app_metadata", () => {
    expect(temPapelAdmin({ sub: "1", app_metadata: { role: "admin" } })).toBe(true);
    expect(temPapelAdmin({ sub: "1", app_metadata: {} })).toBe(false);
    expect(temPapelAdmin(null)).toBe(false);
  });

  it("área admin exige 2FA (aal2)", () => {
    expect(adminCom2fa({ sub: "1", aal: "aal1", app_metadata: { role: "admin" } })).toBe(false);
    expect(adminCom2fa({ sub: "1", aal: "aal2", app_metadata: { role: "admin" } })).toBe(true);
    expect(adminCom2fa({ sub: "1", aal: "aal2", app_metadata: {} })).toBe(false);
  });

  it("não redireciona para fora do site", () => {
    expect(caminhoSeguro("/app/lancamentos")).toBe("/app/lancamentos");
    expect(caminhoSeguro("https://golpe.com")).toBe("/app");
    expect(caminhoSeguro("//golpe.com")).toBe("/app");
    expect(caminhoSeguro("/\\golpe.com")).toBe("/app");
    expect(caminhoSeguro(null)).toBe("/app");
  });
});
