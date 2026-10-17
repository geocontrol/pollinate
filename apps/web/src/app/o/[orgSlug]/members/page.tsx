import type { Metadata } from "next";
import { can, listMembers } from "@pollinate/auth";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { AddMemberForm } from "./add-member-form";
import { MemberRow } from "./member-row";

export const metadata: Metadata = { title: "Members" };

export default async function MembersPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { user, organization, role } = await requirePermission(orgSlug, "members:view");
  const members = await listMembers(db, organization.id);
  const canManage = can(role, "members:manage");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Members</h1>
        <p className="mt-1 text-sm text-stone-500">
          Admins manage members and settings. Analysts build surveys and run analysis. Viewers have read-only access.
        </p>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left">
          <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-5 py-2 font-medium">Person</th>
              <th className="px-5 py-2 font-medium">Role</th>
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {members.map(({ joinedAt: _joinedAt, ...member }) => (
              <MemberRow
                key={member.userId}
                orgSlug={organization.slug}
                member={member}
                isSelf={member.userId === user.id}
                canManage={canManage}
              />
            ))}
          </tbody>
        </table>
      </div>

      {canManage && <AddMemberForm orgSlug={organization.slug} />}
    </div>
  );
}
