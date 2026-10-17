import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { getCurrentUser, safeNextPath } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNextPath((await searchParams).next) ?? undefined;
  if (await getCurrentUser()) redirect(next ?? "/orgs");

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Logo className="text-2xl" />
          <p className="mt-2 text-sm text-stone-500">Sign in to manage your surveys</p>
        </div>
        <div className="card p-6">
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
