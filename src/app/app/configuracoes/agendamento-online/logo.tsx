"use client";

import { useRef, useState, useTransition } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Aviso, Cartao } from "@/components/ui";
import { ARQUIVO_MAXIMO, LADO_MAXIMO, lerLogo, medidasReduzidas, TIPOS_ACEITOS } from "@/lib/logo";
import { removerLogo, salvarLogo } from "./acoes";

/**
 * Reduz a imagem escolhida para caber no limite. Tenta lados cada vez
 * menores; WebP primeiro (mais leve, mantém fundo transparente), depois PNG
 * e, se ainda ficar grande, JPEG com fundo branco.
 */
async function reduzir(arquivo: File): Promise<string | null> {
  const bitmap = await createImageBitmap(arquivo);
  try {
    const tela = document.createElement("canvas");
    const desenhar = (lado: number, fundoBranco: boolean) => {
      const { largura, altura } = medidasReduzidas(bitmap.width, bitmap.height, lado);
      if (!largura || !altura) return false;
      tela.width = largura;
      tela.height = altura;
      const ctx = tela.getContext("2d");
      if (!ctx) return false;
      ctx.clearRect(0, 0, largura, altura);
      if (fundoBranco) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, largura, altura);
      }
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bitmap, 0, 0, largura, altura);
      return true;
    };

    for (const lado of [LADO_MAXIMO, 320, 240]) {
      if (!desenhar(lado, false)) return null;
      for (const tipo of ["image/webp", "image/png"] as const) {
        // Navegador que não gera WebP devolve PNG; lerLogo confere o que veio.
        const texto = tela.toDataURL(tipo, 0.9);
        if (lerLogo(texto)) return texto;
      }
    }
    if (!desenhar(240, true)) return null;
    const jpeg = tela.toDataURL("image/jpeg", 0.85);
    return lerLogo(jpeg) ? jpeg : null;
  } finally {
    bitmap.close();
  }
}

/** Cartão da logo nos ajustes do link de agendamento. Salva ao escolher. */
export function LogoDaEmpresa({ empresa, inicial }: { empresa: string; inicial: string | null }) {
  const [logo, setLogo] = useState(inicial);
  const [mensagem, setMensagem] = useState<{ tipo: "sucesso" | "erro"; texto: string }>();
  const [ocupado, iniciar] = useTransition();
  const entrada = useRef<HTMLInputElement>(null);

  function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setMensagem(undefined);
    if (!(TIPOS_ACEITOS as readonly string[]).includes(arquivo.type)) {
      return setMensagem({ tipo: "erro", texto: "Use uma imagem PNG ou JPG." });
    }
    if (arquivo.size > ARQUIVO_MAXIMO) {
      return setMensagem({ tipo: "erro", texto: "Essa imagem é grande demais. Use um arquivo de até 10 MB." });
    }
    iniciar(async () => {
      let reduzida: string | null = null;
      try {
        reduzida = await reduzir(arquivo);
      } catch {
        // arquivo corrompido ou formato que o navegador não abre
      }
      if (!reduzida) {
        setMensagem({ tipo: "erro", texto: "Não foi possível abrir essa imagem. Tente outro arquivo PNG ou JPG." });
        return;
      }
      const r = await salvarLogo(reduzida);
      if (r.erro) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      setLogo(reduzida);
      setMensagem({ tipo: "sucesso", texto: r.sucesso ?? "Logo salva." });
    });
  }

  function remover() {
    setMensagem(undefined);
    iniciar(async () => {
      const r = await removerLogo();
      if (r.erro) {
        setMensagem({ tipo: "erro", texto: r.erro });
        return;
      }
      setLogo(null);
      setMensagem({ tipo: "sucesso", texto: r.sucesso ?? "Logo removida." });
    });
  }

  return (
    <Cartao className="space-y-3 p-4">
      <h2 className="text-base">Logo da empresa</h2>
      {mensagem && <Aviso tipo={mensagem.tipo}>{mensagem.texto}</Aviso>}
      <div className="flex items-center gap-4">
        {logo ? (
          // Imagem guardada como texto (data:), não passa pelo otimizador do Next.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={`Logo de ${empresa}`} className="size-20 shrink-0 rounded-2xl border border-borda bg-white object-contain" />
        ) : (
          <span className="grid size-20 shrink-0 place-items-center rounded-2xl bg-royal text-3xl font-bold text-white" aria-hidden="true">
            {empresa.trim().charAt(0).toUpperCase()}
          </span>
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm text-suave">
            {logo ? "Essa é a logo que aparece no topo do seu link." : "Sem logo, o link mostra a primeira letra do nome da empresa."}
          </p>
          <div className="flex flex-wrap gap-2 text-sm font-semibold">
            <button
              type="button"
              onClick={() => entrada.current?.click()}
              disabled={ocupado}
              className="flex h-11 items-center gap-1.5 rounded-xl border border-borda px-4 text-royal hover:bg-cartao disabled:opacity-60"
            >
              <ImagePlus className="size-4" /> {ocupado ? "Enviando..." : logo ? "Trocar logo" : "Enviar logo"}
            </button>
            {logo && (
              <button
                type="button"
                onClick={remover}
                disabled={ocupado}
                className="flex h-11 items-center gap-1.5 rounded-xl border border-borda px-4 text-saida hover:bg-cartao disabled:opacity-60"
              >
                <Trash2 className="size-4" /> Remover
              </button>
            )}
          </div>
        </div>
      </div>
      <input
        ref={entrada}
        type="file"
        accept={TIPOS_ACEITOS.join(",")}
        className="sr-only"
        aria-label="Arquivo da logo"
        tabIndex={-1}
        onChange={(e) => {
          escolher(e.target.files?.[0]);
          // permite escolher o mesmo arquivo de novo
          e.target.value = "";
        }}
      />
      <p className="text-xs text-suave">PNG ou JPG. De preferência quadrada. A imagem é reduzida automaticamente.</p>
    </Cartao>
  );
}
