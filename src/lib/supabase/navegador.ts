"use client";

import { createBrowserClient } from "@supabase/ssr";

/** Cliente do Supabase para componentes do navegador. Sempre sujeito à RLS. */
export function criarClienteNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
