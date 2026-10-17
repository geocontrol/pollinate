import type { Metadata } from "next";
import { desc } from "drizzle-orm";
import { can } from "@pollinate/auth";
import { surveys, withTenant } from "@pollinate/db";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Surveys" };

const statusStyles = {
  draft: "bg-stone-100 text-stone-700",
  active: "bg-green-100 text-green-800",
  closed: "bg-blue-100 text-blue-800",
  archived: "bg-stone-100 text-stone-500",
} as const;

export default async function SurveysPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { organization, role } = await requirePermission(orgSlug, "survey:view");
  const rows = await withTenant(db, organization.id, (tx) =>
    tx.select().from(surveys).orderBy(desc(surveys.updatedAt)),
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Surveys</h1>
        {can(role, "survey:edit") && (
          <button type="button" disabled className="btn-primary" title="The survey builder arrives in Phase 2">
            New survey
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="card px-6 py-16 text-center">
          <p className="font-medium">No surveys yet</p>
          <p className="mt-1 text-sm text-stone-500">
            Surveys created in {organization.name} will appear here.
          </p>
        </div>
      ) : (
        <ul className="card divide-y divide-stone-100">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-5 py-4">
              <span className="font-medium">{s.title}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusStyles[s.status]}`}>
                {s.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
