"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { UserPlus } from "lucide-react";
import { Aviso, Botao, Campo, Cartao } from "@/components/ui";
import { horariosLivres, paraMinutos, partesSp } from "@/lib/agenda";
import { formatarReais } from "@/lib/dinheiro";
import { agendar } from "../acoes";
import { Formulario } from "@/components/formulario";

type Cadastros = {
  profissionais: { id: string; nome: string }[];
  servicos: { id: string; nome: string; preco_centavos: number; duracao_minutos: number }[];
  clientes: { id: string; nome: string }[];
  horario: { abertura: string; fechamento: string; dias: number[] };
};

export function FormAgendamento({
  cadastros,
  termos,
  hoje,
  ocupados,
  inicial,
}: {
  cadastros: Cadastros;
  termos: { cliente: string; profissional: string };
  hoje: string;
  ocupados: { profissional: string; inicio: string; fim: string }[];
  inicial: { dia?: string; hora?: string; profissional?: string; cliente?: string };
}) {
  const [estado, acao, salvando] = useActionState(agendar, {});
  const [cliente, setCliente] = useState(inicial.cliente ?? "");
  const [busca, setBusca] = useState("");
  const [prof, setProf] = useState(inicial.profissional ?? cadastros.profissionais[0]?.id ?? "");
  const [servico, setServico] = useState("");
  const [dia, setDia] = useState(inicial.dia ?? hoje);
  const [hora, setHora] = useState(inicial.hora ?? "");
  const s = cadastros.servicos.find((x) => x.id === servico);
  const [duracao, setDuracao] = useState(30);
  const dur = s?.duracao_minutos ?? duracao;
  const erros = estado.erros ?? {};

  const abre = cadastros.horario.dias.includes(new Date(`${dia}T12:00:00Z`).getUTCDay());
  const ocupadosDia = ocupados
    .filter((o) => o.profissional === prof && partesSp(o.inicio).data === dia)
    .map((o) => ({ inicio: paraMinutos(partesSp(o.inicio).hora), fim: paraMinutos(partesSp(o.fim).hora) }));
  const agora = partesSp(new Date().toISOString());
  const livres = horariosLivres({
    abertura: cadastros.horario.abertura,
    fechamento: cadastros.horario.fechamento,
    duracao: dur,
    ocupados: ocupadosDia,
    aPartirDe: dia === hoje ? paraMinutos(agora.hora) : undefined,
  });
  const termo = busca.trim().toLowerCase();
  const filtrados = termo ? cadastros.clientes.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 6) : [];
  const escolhido = cadastros.clientes.find((c) => c.id === cliente);

  return (
    <Formulario acao={acao} className="space-y-4">
      {estado.erro && <Aviso>{estado.erro}</Aviso>}
      <Cartao className="space-y-3 p-4">
        <span className="block text-sm font-medium capitalize text-tinta">{termos.cliente}</span>
        <input type="hidden" name="cliente_id" value={cliente} />
        {escolhido ? (
          <div className="flex items-center justify-between rounded-xl bg-royal-claro px-4 py-3">
            <span className="font-semibold text-royal">{escolhido.nome}</span>
            <button type="button" onClick={() => setCliente("")} className="text-sm font-semibold text-royal-vivo underline">
              Trocar
            </button>
          </div>
        ) : (
          <>
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={`Buscar ${termos.cliente} pelo nome`}
              className="h-12 w-full rounded-xl border border-borda bg-white px-4 text-base outline-none focus:border-royal-vivo"
            />
            {filtrados.length > 0 && (
              <ul className="divide-y divide-borda rounded-xl border border-borda">
                {filtrados.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setCliente(c.id)} className="w-full px-4 py-3 text-left hover:bg-cartao">
                      {c.nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href={`/app/clientes/novo?voltar=${encodeURIComponent(`/app/agenda/novo?dia=${dia}&hora=${hora}&profissional=${prof}&cliente={id}`)}`}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-royal-vivo"
            >
              <UserPlus className="size-4" /> Cadastrar novo {termos.cliente}
            </Link>
          </>
        )}
        {erros.cliente_id && <p className="text-sm text-saida">{erros.cliente_id}</p>}
      </Cartao>

      <Cartao className="space-y-3 p-4">
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium capitalize text-tinta">{termos.profissional}</span>
          <select name="profissional_id" value={prof} onChange={(e) => setProf(e.target.value)} className="h-12 w-full rounded-xl border border-borda bg-white px-3">
            {cadastros.profissionais.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-tinta">Serviço</span>
          <select name="servico_id" value={servico} onChange={(e) => setServico(e.target.value)} className="h-12 w-full rounded-xl border border-borda bg-white px-3">
            <option value="">Sem serviço definido</option>
            {cadastros.servicos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.nome} · {x.duracao_minutos} min · {formatarReais(x.preco_centavos)}
              </option>
            ))}
          </select>
        </label>
        {!s && (
          <Campo
            rotulo="Duração (minutos)"
            nome="duracao_manual"
            type="number"
            min={5}
            max={720}
            step={5}
            value={duracao}
            onChange={(e) => setDuracao(Math.max(5, Number(e.target.value) || 30))}
          />
        )}
        <input type="hidden" name="duracao" value={dur} />
      </Cartao>

      <Cartao className="space-y-3 p-4">
        <Campo rotulo="Dia" nome="data" type="date" value={dia} min={hoje} onChange={(e) => setDia(e.target.value)} erro={erros.data} />
        <input type="hidden" name="hora" value={hora} />
        <div>
          <span className="mb-1.5 block text-sm font-medium text-tinta">Horário</span>
          {!abre && <p className="mb-2 text-sm text-suave">Fechado neste dia (pela configuração). Você ainda pode digitar um horário.</p>}
          {abre && livres.length === 0 && <p className="mb-2 text-sm text-suave">Sem horários livres neste dia para esse tempo de serviço.</p>}
          <div className="flex flex-wrap gap-1.5">
            {livres.map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setHora(h)}
                aria-pressed={hora === h}
                className={`numero rounded-lg border px-2.5 py-1.5 text-sm ${hora === h ? "border-royal-vivo bg-royal-vivo text-white" : "border-borda text-texto"}`}
              >
                {h}
              </button>
            ))}
          </div>
          <label className="mt-3 flex items-center gap-2 text-sm text-suave">
            Outro horário:
            <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className="h-10 rounded-lg border border-borda px-2" />
          </label>
          {erros.hora && <p className="mt-1 text-sm text-saida">{erros.hora}</p>}
        </div>
        <label className="block text-sm">
          <span className="mb-1.5 block font-medium text-tinta">Observação (opcional)</span>
          <input name="observacao" maxLength={500} className="h-12 w-full rounded-xl border border-borda px-4" />
        </label>
      </Cartao>

      <Botao type="submit" disabled={salvando || !cliente || !hora}>
        {salvando ? "Agendando..." : hora ? `Agendar às ${hora}` : "Escolha o horário"}
      </Botao>
    </Formulario>
  );
}
