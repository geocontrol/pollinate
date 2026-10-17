import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listUserOrgs, roleLabels } from "@pollinate/auth";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Organisations" };

export default async function OrgsPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(db, user.id);

  // Most staff belong to one organisation: skip the picker.
  if (orgs.length === 1 && !user.isPlatformAdmin) redirect(`/o/${orgs[0]!.organization.slug}`);

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <Logo />
        <UserMenu user={user} showSwitch={false} />
      </header>
      <main className="mx-auto max-w-xl px-4 py-12">
        <h1 className="mb-6 text-xl font-semibold">Choose an organisation</h1>
        {orgs.length === 0 ? (
          <div className="card p-6 text-sm text-stone-600">
            You are not a member of any organisation yet. Ask an organisation admin to add you.
          </div>
        ) : (
          <ul className="card divide-y divide-stone-100">
            {orgs.map(({ organization, role }) => (
              <li key={organization.id}>
                <Link
                  href={`/o/${organization.slug}`}
                  className="flex items-center justify-between px-5 py-4 hover:bg-stone-50"
                >
                  <span className="font-medium">{organization.name}</span>
                  <span className="text-sm text-stone-500">{roleLabels[role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
