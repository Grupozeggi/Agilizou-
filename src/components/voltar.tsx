import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function Voltar({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-royal-vivo">
      <ChevronLeft className="size-4" /> {children}
    </Link>
  );
}
