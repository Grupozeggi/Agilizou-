import type { MetadataRoute } from "next";

/** Permite instalar o Agilizou na tela inicial do celular. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Agilizou",
    short_name: "Agilizou",
    description: "Seu caixa em dia.",
    start_url: "/app",
    display: "standalone",
    background_color: "#FFFFFF",
    theme_color: "#1E40AF",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icone-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
