import Link from "next/link";
import { Logo } from "@/components/logo";

export default function LayoutAcesso({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center bg-cartao px-4 py-10">
      <Link href="/" className="mb-8">
        <Logo className="text-3xl" />
      </Link>
      <div className="w-full max-w-md">{children}</div>
    </main>
  );
}
