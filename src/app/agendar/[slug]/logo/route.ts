import { lerLogo } from "@/lib/logo";
import { criarClientePublico } from "@/lib/supabase/publico";

/**
 * Entrega a logo da empresa para a página pública do link de agendamento.
 * Não exige login. O banco só devolve a imagem quando o link está no ar.
 * O endereço leva "?v=<versão>": quando a logo é trocada o endereço muda,
 * por isso o navegador pode guardar a imagem por bastante tempo.
 */
export async function GET(_: Request, { params }: RouteContext<"/agendar/[slug]/logo">) {
  const slug = (await params).slug.toLowerCase();
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return new Response(null, { status: 404 });

  const { data, error } = await criarClientePublico().rpc("logo_publica", { p_slug: slug });
  if (error) {
    console.error("[agendar online] logo", error);
    return new Response(null, { status: 404 });
  }
  const logo = lerLogo(data);
  if (!logo) return new Response(null, { status: 404 });

  return new Response(logo.bytes, {
    headers: {
      "Content-Type": logo.tipo,
      "Content-Length": String(logo.bytes.length),
      "Cache-Control": "public, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
