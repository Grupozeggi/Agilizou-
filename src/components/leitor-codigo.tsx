"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, ScanBarcode, X } from "lucide-react";
import { normalizarCodigo } from "@/lib/codigo-barras";

type BarcodeDetectorLike = { detect(src: CanvasImageSource): Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  }
}

/**
 * Campo para bipar. Leitor USB/Bluetooth "digita" o código e dá Enter;
 * no celular, o botão da câmera lê o código (Chrome/Android e navegadores
 * com BarcodeDetector). Chama onCodigo com o código lido.
 */
export function LeitorCodigo({
  onCodigo,
  placeholder = "Bipe ou digite o código",
  autoFocus,
  onTexto,
}: {
  onCodigo: (codigo: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Recebe o texto a cada tecla (para busca por nome). */
  onTexto?: (texto: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [camera, setCamera] = useState(false);
  const [temCamera, setTemCamera] = useState(false);

  useEffect(() => {
    // Só depois de montar: no servidor não existe window.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- detecção de recurso do navegador
    setTemCamera(typeof window !== "undefined" && "BarcodeDetector" in window && !!navigator.mediaDevices);
  }, []);

  function enviar(valor: string) {
    const codigo = normalizarCodigo(valor);
    if (!codigo) return;
    onCodigo(codigo);
    setTexto("");
    onTexto?.("");
  }

  return (
    <div>
      <div className="flex gap-2">
        <label className="flex h-12 flex-1 items-center gap-2 rounded-xl border border-borda bg-white px-3 focus-within:border-royal-vivo focus-within:ring-2 focus-within:ring-royal-vivo/20">
          <ScanBarcode className="size-5 shrink-0 text-suave" strokeWidth={1.75} />
          <span className="sr-only">Código de barras ou nome</span>
          <input
            value={texto}
            autoFocus={autoFocus}
            onChange={(e) => {
              setTexto(e.target.value);
              onTexto?.(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                enviar(texto);
              }
            }}
            placeholder={placeholder}
            autoComplete="off"
            enterKeyHint="search"
            className="h-full w-full bg-transparent text-base outline-none"
          />
        </label>
        {temCamera && (
          <button
            type="button"
            onClick={() => setCamera(true)}
            className="grid size-12 place-items-center rounded-xl border border-borda bg-white text-royal"
            aria-label="Ler código com a câmera"
          >
            <Camera className="size-5" strokeWidth={1.75} />
          </button>
        )}
      </div>
      {camera && (
        <LeitorCamera
          onFechar={() => setCamera(false)}
          onCodigo={(c) => {
            setCamera(false);
            enviar(c);
          }}
        />
      )}
    </div>
  );
}

function LeitorCamera({ onCodigo, onFechar }: { onCodigo: (c: string) => void; onFechar: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [erro, setErro] = useState<string>();
  // Guarda o callback num ref para a câmera não reiniciar a cada render.
  const aoLer = useRef(onCodigo);
  useEffect(() => {
    aoLer.current = onCodigo;
  }, [onCodigo]);

  useEffect(() => {
    let parar = false;
    let stream: MediaStream | undefined;
    (async () => {
      try {
        const Detector = window.BarcodeDetector!;
        const detector = new Detector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        while (!parar) {
          const lidos = await detector.detect(video.current).catch(() => []);
          if (lidos[0]?.rawValue) {
            navigator.vibrate?.(80);
            aoLer.current(lidos[0].rawValue);
            return;
          }
          await new Promise((r) => setTimeout(r, 200));
        }
      } catch {
        setErro("Não foi possível abrir a câmera. Confira a permissão ou digite o código.");
      }
    })();
    return () => {
      parar = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-label="Ler código de barras">
      <button type="button" onClick={onFechar} className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white/20 text-white" aria-label="Fechar">
        <X className="size-6" />
      </button>
      {erro ? (
        <p className="m-auto max-w-xs text-center text-white">{erro}</p>
      ) : (
        <>
          <video ref={video} className="h-full w-full object-cover" playsInline muted />
          <div className="pointer-events-none absolute inset-x-8 top-1/2 h-32 -translate-y-1/2 rounded-xl border-2 border-dourado" />
          <p className="absolute inset-x-0 bottom-10 text-center text-white">Aponte para o código de barras</p>
        </>
      )}
    </div>
  );
}
