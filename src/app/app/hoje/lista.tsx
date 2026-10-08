"use client";

import { useState, useTransition } from "react";
import { ArrowDownLeft, ArrowUpRight, Bell, Check, Clock, MessageCircle, X } from "lucide-react";
import { Aviso, Botao, Cartao } from "@/components/ui";
import type { DiaAgenda, ItemAgenda } from "@/lib/agenda-dia";
import { formatarData } from "@/lib/datas";
import { formatarReais } from "@/lib/dinheiro";
import { textoVencimento } from "@/lib/lancamentos";
import { linkWhatsapp, MODELO_COBRANCA, normalizarWhatsapp, preencher } from "@/lib/mensagens";
import { marcarComoPago } from "../lancamentos/acoes";
import { marcarLembrete } from "../lembretes/acoes";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const SEM_CONEXAO = "Não foi possível salvar. Confira sua internet e tente de novo.";

export function ListaHoje({
  agenda,
  hoje,
  empresa,
}: {
  agenda: { atrasados: ItemAgenda[]; porDia: DiaAgenda[]; total: number };
  hoje: string;
  empresa: string;
}) {
  const [feitos, setFeitos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string>();
  const [cobrando, setCobrando] = useState<ItemAgenda | null>(null);
  const [, iniciar] = useTransition();

  function concluir(item: ItemAgenda) {
    setErro(undefined);
    setFeitos((s) => new Set(s).add(item.id));
    iniciar(async () => {
      const r = await (item.tipo === "lembrete" ? marcarLembrete(item.id, true) : marcarComoPago(item.id)).catch(() => ({
        erro: SEM_CONEXAO,
      }));
      if (r.erro) {
        setErro(r.erro);
        setFeitos((s) => {
          const n = new Set(s);
          n.delete(item.id);
          return n;
        });
      }
    });
  }

  const visiveis = (lista: ItemAgenda[]) => lista.filter((i) => !feitos.has(i.id));
  const restantes = visiveis(agenda.atrasados).length + agenda.porDia.reduce((s, d) => s + visiveis(d.itens).length, 0);

  if (restantes === 0) {
    return (
      <Cartao className="text-center">
        <Check className="mx-auto size-8 text-entrada" />
        <p className="mt-2 font-semibold text-tinta">Tudo em dia!</p>
        <p className="text-sm text-suave">Nada para pagar, cobrar ou atender por aqui.</p>
      </Cartao>
    );
  }

  const grupo = (titulo: string, itens: ItemAgenda[], destaque?: boolean) =>
    visiveis(itens).length > 0 && (
      <section key={titulo}>
        <h2 className={`mb-2 px-1 text-sm font-semibold ${destaque ? "text-saida" : "text-suave"}`}>{titulo}</h2>
        <ul className={`divide-y divide-borda overflow-hidden rounded-cartao bg-white shadow-suave ${destaque ? "ring-1 ring-saida/30" : ""}`}>
          {visiveis(itens).map((i) => (
            <Linha key={i.id} item={i} hoje={hoje} concluir={() => concluir(i)} cobrar={() => setCobrando(i)} />
          ))}
        </ul>
      </section>
    );

  return (
    <div className="space-y-4">
      {erro && <Aviso>{erro}</Aviso>}
      {grupo("Atrasados", agenda.atrasados, true)}
      {agenda.porDia.map((d) =>
        grupo(
          d.data === hoje
            ? "Hoje"
            : `${DIAS[new Date(`${d.data}T12:00:00Z`).getUTCDay()]}, ${formatarData(d.data).slice(0, 5)}`,
          d.itens,
        ),
      )}
      {cobrando && <ModalCobranca item={cobrando} empresa={empresa} fechar={() => setCobrando(null)} />}
    </div>
  );
}

function Linha({ item, hoje, concluir, cobrar }: { item: ItemAgenda; hoje: string; concluir: () => void; cobrar: () => void }) {
  const icone = {
    pagar: <ArrowUpRight className="size-4 text-saida" />,
    receber: <ArrowDownLeft className="size-4 text-entrada" />,
    lembrete: <Bell className="size-4 text-dourado" />,
    atendimento: <Clock className="size-4 text-royal" />,
  }[item.tipo];
  const podeCobrar = item.tipo === "receber" || item.subtipo === "cobrar";
  const rotulo = { pagar: "Paguei", receber: "Recebi", lembrete: "Feito", atendimento: "" }[item.tipo];

  return (
    <li className="flex items-center gap-3 py-3 pl-4 pr-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-cartao">{icone}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-tinta">
          {item.hora && <span className="numero mr-1.5 text-royal">{item.hora}</span>}
          {item.titulo}
        </span>
        <span className="block truncate text-xs text-suave">
          {[item.detalhe, item.tipo !== "atendimento" && item.data < hoje ? textoVencimento(item.data, hoje) : null, item.valor_centavos ? formatarReais(item.valor_centavos) : null]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </span>
      {podeCobrar && (
        <button
          type="button"
          onClick={cobrar}
          className="grid size-10 place-items-center rounded-xl bg-entrada/10 text-entrada"
          aria-label={`Cobrar ${item.titulo} pelo WhatsApp`}
        >
          <MessageCircle className="size-5" strokeWidth={1.75} />
        </button>
      )}
      {item.tipo === "atendimento" ? (
        <a href={`/app/agenda?dia=${item.data}`} className="text-sm font-semibold text-royal-vivo">
          Ver
        </a>
      ) : (
        <button
          type="button"
          onClick={concluir}
          className="flex h-10 items-center gap-1 rounded-xl bg-royal-claro px-3 text-sm font-semibold text-royal hover:bg-royal-vivo hover:text-white"
        >
          <Check className="size-4" strokeWidth={2} /> {rotulo}
        </button>
      )}
    </li>
  );
}

/** Abre o WhatsApp com mensagem de cobrança pronta e editável. */
function ModalCobranca({ item, empresa, fechar }: { item: ItemAgenda; empresa: string; fechar: () => void }) {
  const [numero, setNumero] = useState(item.cliente?.whatsapp ?? "");
  const [mensagem, setMensagem] = useState(
    preencher(MODELO_COBRANCA, {
      nome: item.cliente?.nome?.split(" ")[0] ?? "",
      valor: item.valor_centavos ? formatarReais(item.valor_centavos) : "",
      data: formatarData(item.data),
      empresa,
    })
      .replace("Oi, , tudo", "Oi, tudo")
      .replace(" de , com", ", com"),
  );
  const normalizado = normalizarWhatsapp(numero);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-royal-escuro/40 sm:items-center sm:justify-center" onClick={fechar}>
      <div className="w-full rounded-t-3xl bg-white p-5 sm:max-w-md sm:rounded-3xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Cobrar pelo WhatsApp">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold text-tinta">Cobrar pelo WhatsApp</p>
          <button type="button" onClick={fechar} className="grid size-10 place-items-center text-suave" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-tinta">WhatsApp do cliente</span>
          <input
            value={numero}
            onChange={(e) => setNumero(e.target.value)}
            inputMode="tel"
            placeholder="(11) 99999-8888"
            className="h-12 w-full rounded-xl border border-borda px-4 text-base"
          />
        </label>
        <label className="mt-3 block text-sm">
          <span className="mb-1.5 block font-medium text-tinta">Mensagem (pode editar)</span>
          <textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={5} className="w-full rounded-xl border border-borda px-4 py-3 text-base" />
        </label>
        <a
          href={linkWhatsapp(normalizado, mensagem)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={fechar}
          className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-entrada font-semibold text-white"
        >
          <MessageCircle className="size-5" /> Abrir WhatsApp
        </a>
        {!normalizado && numero && <p className="mt-2 text-sm text-saida">Número inválido. Use DDD + número.</p>}
        <Botao type="button" variante="secundario" className="mt-2" onClick={fechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}
