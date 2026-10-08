import { describe, expect, it } from "vitest";
import { caminhoDaLogo, lerLogo, medidasReduzidas, TAMANHO_MAXIMO } from "./logo";

const base64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const enchimento = Array.from({ length: 24 }, () => 0);
const PNG = `data:image/png;base64,${base64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...enchimento])}`;
const JPEG = `data:image/jpeg;base64,${base64([0xff, 0xd8, 0xff, 0xe0, ...enchimento])}`;
const WEBP = `data:image/webp;base64,${base64([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, ...enchimento])}`;

describe("logo da empresa", () => {
  it("aceita PNG, JPEG e WebP e devolve os bytes", () => {
    expect(lerLogo(PNG)).toMatchObject({ tipo: "image/png" });
    expect(lerLogo(JPEG)).toMatchObject({ tipo: "image/jpeg" });
    const webp = lerLogo(WEBP)!;
    expect(webp.tipo).toBe("image/webp");
    expect(webp.bytes.length).toBe(36);
    expect(webp.bytes[0]).toBe(0x52);
  });

  it("recusa SVG, texto solto, tipo trocado e conteúdo que não é imagem", () => {
    expect(lerLogo("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=")).toBeNull();
    expect(lerLogo("https://exemplo.com/logo.png")).toBeNull();
    expect(lerLogo(null)).toBeNull();
    expect(lerLogo(undefined)).toBeNull();
    // diz que é PNG, mas o conteúdo é de JPEG
    expect(lerLogo(JPEG.replace("image/jpeg", "image/png"))).toBeNull();
    expect(lerLogo(`data:image/png;base64,${base64(Array.from({ length: 40 }, () => 65))}`)).toBeNull();
    expect(lerLogo("data:image/png;base64,###")).toBeNull();
    expect(lerLogo(`${PNG}"><script>`)).toBeNull();
  });

  it("recusa imagem acima do limite", () => {
    const grande = `data:image/png;base64,${base64([0x89, 0x50, 0x4e, 0x47])}${"A".repeat(TAMANHO_MAXIMO)}`;
    expect(lerLogo(grande)).toBeNull();
  });

  it("reduz mantendo a proporção e nunca aumenta", () => {
    expect(medidasReduzidas(2000, 1000)).toEqual({ largura: 400, altura: 200 });
    expect(medidasReduzidas(900, 1800)).toEqual({ largura: 200, altura: 400 });
    expect(medidasReduzidas(120, 80)).toEqual({ largura: 120, altura: 80 });
    expect(medidasReduzidas(3000, 10, 240)).toEqual({ largura: 240, altura: 1 });
    expect(medidasReduzidas(0, 0)).toEqual({ largura: 0, altura: 0 });
  });

  it("o endereço da imagem leva a versão", () => {
    expect(caminhoDaLogo("barbearia-do-ze", 1791485000)).toBe("/agendar/barbearia-do-ze/logo?v=1791485000");
  });
});
