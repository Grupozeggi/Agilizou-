/**
 * Traduz erros do Supabase Auth para mensagens claras em português.
 * Nunca mostramos a mensagem técnica original para o usuário.
 */
export function mensagemDeErroAuth(erro: { code?: string; message?: string } | null | undefined): string {
  const codigo = erro?.code ?? "";
  const msg = (erro?.message ?? "").toLowerCase();

  if (codigo === "invalid_credentials" || msg.includes("invalid login credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (codigo === "email_not_confirmed" || msg.includes("email not confirmed")) {
    return "Falta confirmar seu e-mail. Abra o link que enviamos para sua caixa de entrada.";
  }
  if (codigo === "user_already_exists" || msg.includes("already registered")) {
    return "Já existe uma conta com este e-mail. Tente entrar ou recuperar a senha.";
  }
  if (codigo === "weak_password" || msg.includes("password should")) {
    return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
  }
  if (codigo === "same_password") {
    return "A nova senha precisa ser diferente da atual.";
  }
  if (codigo === "over_email_send_rate_limit" || codigo === "over_request_rate_limit" || msg.includes("rate limit")) {
    return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  }
  if (codigo === "otp_expired" || msg.includes("expired")) {
    return "Este link expirou. Peça um novo.";
  }
  if (codigo === "signup_disabled") {
    return "Cadastros estão temporariamente fechados.";
  }
  if (codigo === "mfa_verification_failed" || codigo === "mfa_challenge_expired") {
    return "Código inválido ou expirado. Confira o app autenticador e tente de novo.";
  }
  return "Não foi possível concluir agora. Tente de novo em instantes.";
}
