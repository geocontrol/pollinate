import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { memberships, organizations } from "@pollinate/db";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { requirePlatformAdmin } from "@/lib/auth";
import { db } from "@/lib/db";
import { CreateOrgForm } from "./create-org-form";

export const metadata: Metadata = { title: "Platform admin" };

export default async function AdminPage() {
  const user = await requirePlatformAdmin();
  const orgs = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      slug: organizations.slug,
      createdAt: organizations.createdAt,
      members: count(memberships.userId),
    })
    .from(organizations)
    .leftJoin(memberships, eq(memberships.organizationId, organizations.id))
    .groupBy(organizations.id)
    .orderBy(asc(organizations.name));

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-stone-200 bg-white px-6 py-3">
        <Link href="/orgs">
          <Logo />
        </Link>
        <UserMenu user={user} showSwitch />
      </header>
      <main className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <h1 className="text-xl font-semibold">Platform admin</h1>
          <p className="mt-1 text-sm text-stone-500">
            Create client organisations. Platform admins cannot see an organisation&apos;s surveys or responses unless
            they are also a member.
          </p>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-5 py-2 font-medium">Organisation</th>
                <th className="px-5 py-2 font-medium">Address</th>
                <th className="px-5 py-2 font-medium">Members</th>
                <th className="px-5 py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {orgs.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-6 text-center text-stone-500">
                    No organisations yet.
                  </td>
                </tr>
              )}
              {orgs.map((o) => (
                <tr key={o.id}>
                  <td className="px-5 py-3 font-medium">{o.name}</td>
                  <td className="px-5 py-3 font-mono text-stone-600">/o/{o.slug}</td>
                  <td className="px-5 py-3">{o.members}</td>
                  <td className="px-5 py-3 text-stone-500">{o.createdAt.toLocaleDateString("en-GB")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CreateOrgForm />
      </main>
    </div>
  );
}
