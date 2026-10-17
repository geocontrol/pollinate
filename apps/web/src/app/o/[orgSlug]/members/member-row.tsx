"use client";

import { useActionState } from "react";
import { roleLabels, roles, type Role } from "@pollinate/auth/permissions";
import { changeRoleAction, removeMemberAction } from "./actions";

export function MemberRow({
  orgSlug,
  member,
  isSelf,
  canManage,
}: {
  orgSlug: string;
  member: { userId: string; email: string; name: string | null; role: Role };
  isSelf: boolean;
  canManage: boolean;
}) {
  const [roleState, roleAction, rolePending] = useActionState(
    changeRoleAction.bind(null, orgSlug, member.userId),
    undefined,
  );
  const [removeState, removeAction, removePending] = useActionState(
    removeMemberAction.bind(null, orgSlug, member.userId),
    undefined,
  );
  const error = roleState?.error ?? removeState?.error;

  return (
    <tr className="align-top">
      <td className="px-5 py-3">
        <div className="font-medium">
          {member.name ?? member.email}
          {isSelf && <span className="ml-2 text-xs font-normal text-stone-500">(you)</span>}
        </div>
        {member.name && <div className="text-sm text-stone-500">{member.email}</div>}
        {error && (
          <p role="alert" className="mt-1 text-sm text-red-700">
            {error}
          </p>
        )}
      </td>
      <td className="px-5 py-3">
        {canManage ? (
          <form action={roleAction}>
            <select
              name="role"
              defaultValue={member.role}
              disabled={rolePending}
              aria-label={`Role for ${member.email}`}
              className="input w-36 py-1.5"
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </form>
        ) : (
          <span className="text-sm">{roleLabels[member.role]}</span>
        )}
      </td>
      <td className="px-5 py-3 text-right">
        {canManage && !isSelf && (
          <form action={removeAction}>
            <button type="submit" disabled={removePending} className="btn-danger">
              Remove
            </button>
          </form>
        )}
      </td>
    </tr>
  );
}
