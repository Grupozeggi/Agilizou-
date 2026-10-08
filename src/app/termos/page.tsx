import type { Metadata } from "next";
import { PaginaTexto } from "@/components/pagina-texto";

export const metadata: Metadata = { title: "Termos de Uso" };

// Rascunho. Revisar com um advogado antes do lançamento.
export default function Termos() {
  return (
    <PaginaTexto titulo="Termos de Uso">
      <p>Ao criar uma conta no Agilizou (agilizou.app), você concorda com estes termos.</p>
      <h2>O serviço</h2>
      <p>
        O Agilizou ajuda pequenos negócios a organizar caixa, contas, estoque, vendas e agenda. Não emite nota
        fiscal, não faz conciliação bancária nem cálculo de impostos.
      </p>
      <h2>Teste e assinatura</h2>
      <p>
        O teste grátis dura 7 dias, sem cartão. Depois disso, a conta fica somente leitura até o pagamento de um
        dos planos. Seus dados nunca são apagados por falta de pagamento.
      </p>
      <h2>Acesso da equipe de suporte</h2>
      <p>
        Para prestar atendimento, corrigir erros ou ajustar lançamentos a seu pedido, a equipe de suporte do
        Agilizou pode acessar os dados da sua conta. Todo acesso e toda alteração feitos pelo suporte ficam
        registrados em histórico de auditoria.
      </p>
      <h2>Responsabilidades</h2>
      <p>Você é responsável pelas informações que cadastra e por manter sua senha em segredo.</p>
    </PaginaTexto>
  );
}
