import type { Metadata } from "next";
import { PaginaTexto } from "@/components/pagina-texto";

export const metadata: Metadata = { title: "Política de Privacidade" };

// Rascunho em linha com a LGPD. Revisar com um advogado antes do lançamento.
export default function Privacidade() {
  return (
    <PaginaTexto titulo="Política de Privacidade">
      <p>Esta política explica como o Agilizou trata os dados pessoais, conforme a Lei 13.709/2018 (LGPD).</p>
      <h2>Quais dados coletamos</h2>
      <p>
        Dados da conta (nome, e-mail, nome do negócio) e os dados que você cadastra no sistema, como lançamentos,
        produtos, vendas, clientes e agendamentos.
      </p>
      <h2>Para que usamos</h2>
      <p>
        Para prestar o serviço, cobrar a assinatura, enviar avisos e lembretes que você configurou e dar suporte.
      </p>
      <h2>Acesso pela equipe de suporte</h2>
      <p>
        A equipe de suporte pode acessar os dados da sua conta para atendimento, correção de erros e ajustes que
        você solicitar. Esse acesso é restrito a pessoas autorizadas, exige verificação em duas etapas e fica
        registrado em histórico de auditoria que não pode ser alterado.
      </p>
      <h2>Com quem compartilhamos</h2>
      <p>
        Apenas com fornecedores necessários para o serviço funcionar: hospedagem e banco de dados, processador de
        pagamentos (Asaas), envio de e-mails e WhatsApp (quando você ativa as mensagens).
      </p>
      <h2>Seus direitos</h2>
      <p>
        Você pode pedir acesso, correção, exportação ou exclusão dos seus dados pelo e-mail
        privacidade@agilizou.app.
      </p>
    </PaginaTexto>
  );
}
