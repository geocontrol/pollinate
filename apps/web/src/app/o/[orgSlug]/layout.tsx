import Link from "next/link";
import { listUserOrgs, roleLabels } from "@pollinate/auth";
import { Logo } from "@/components/logo";
import { UserMenu } from "@/components/user-menu";
import { getOrgContext } from "@/lib/auth";
import { db } from "@/lib/db";
import { NavLink } from "./nav-link";

export default async function OrgLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const { user, organization, role } = await getOrgContext(orgSlug);
  const orgCount = (await listUserOrgs(db, user.id)).length;
  const base = `/o/${organization.slug}`;

  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="flex items-center justify-between px-6 py-3">
          <div className="flex items-center gap-4">
            <Link href={base}>
              <Logo />
            </Link>
            <span className="text-stone-300">/</span>
            <span className="font-medium">{organization.name}</span>
            <span className="rounded-full bg-honey-100 px-2 py-0.5 text-xs font-medium text-honey-700">
              {roleLabels[role]}
            </span>
          </div>
          <UserMenu user={user} showSwitch={orgCount > 1 || user.isPlatformAdmin} />
        </div>
        <nav className="flex gap-6 px-6">
          <NavLink href={base} exact>
            Surveys
          </NavLink>
          <NavLink href={`${base}/members`}>Members</NavLink>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
