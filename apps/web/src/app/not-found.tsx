import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo className="text-xl" />
      <h1 className="text-lg font-semibold">Page not found</h1>
      <p className="text-sm text-stone-500">It may have moved, or you may not have access to it.</p>
      <Link href="/" className="btn-secondary">
        Go home
      </Link>
    </main>
  );
}
