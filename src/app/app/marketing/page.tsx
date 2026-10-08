import type { Metadata } from "next";
import { CheckCircle2, Megaphone } from "lucide-react";
import { Cartao } from "@/components/ui";
import { Voltar } from "@/components/voltar";
import { dataSp, formatarData } from "@/lib/datas";
import { formatarWhatsapp } from "@/lib/mensagens";
import { exigirCliente } from "@/lib/sessao";
import { cancelarPedidoMarketing } from "./acoes";
import { FormMarketing } from "./form";

export const metadata: Metadata = { title: "Marketing" };

export default async function Marketing() {
  const { supabase, empresa } = await exigirCliente();
  const { data: perfil } = await supabase
    .from("perfil_negocio")
    .select("quer_marketing, whatsapp_contato, marketing_pedido_em")
    .eq("empresa_id", empresa.id)
    .maybeSingle();

  return (
    <div className="space-y-4">
      <Voltar href="/app/menu">Menu</Voltar>
      <div>
        <h1 className="text-2xl">Marketing para o seu negócio</h1>
        <p className="mt-1 text-sm text-suave">
          Precisa de ajuda para atrair mais clientes? Temos um time de marketing que pode ajudar o seu negócio a crescer.
        </p>
      </div>

      {perfil?.quer_marketing ? (
        <Cartao className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-entrada" strokeWidth={1.75} />
            <div>
              <h2 className="text-base">Pedido recebido</h2>
              <p className="mt-1 text-sm text-suave">
                {perfil.marketing_pedido_em ? `Você pediu o contato em ${formatarData(dataSp(perfil.marketing_pedido_em))}. ` : ""}
                Nosso time vai falar com você
                {perfil.whatsapp_contato ? ` pelo WhatsApp ${formatarWhatsapp(perfil.whatsapp_contato)}` : ""}.
              </p>
            </div>
          </div>
          <form action={cancelarPedidoMarketing}>
            <button type="submit" className="text-sm font-medium text-suave underline">
              Não quero mais o contato
            </button>
          </form>
        </Cartao>
      ) : (
        <Cartao className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-royal-claro text-royal">
              <Megaphone className="size-5" strokeWidth={1.75} />
            </span>
            <p className="text-sm text-texto">
              Deixe o seu WhatsApp e a gente entra em contato para entender o seu negócio e conversar sobre como divulgar melhor. Sem compromisso.
            </p>
          </div>
          <FormMarketing whatsapp={perfil?.whatsapp_contato ? formatarWhatsapp(perfil.whatsapp_contato) : ""} />
        </Cartao>
      )}
    </div>
  );
}
