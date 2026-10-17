"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  addMember,
  can,
  changeRole,
  ForbiddenError,
  getOrgAccess,
  MembershipError,
  removeMember,
  roles,
  validatePasswordStrength,
} from "@pollinate/auth";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { str, type FormState } from "@/lib/form";

/** Every action re-checks access: server actions are public endpoints. */
async function requireMemberAdmin(orgSlug: string) {
  const user = await requireUser();
  const access = await getOrgAccess(db, user.id, orgSlug);
  if (!access || !can(access.role, "members:manage")) throw new ForbiddenError("You don't have permission to do that");
  return { user, organizationId: access.organization.id };
}

async function run(orgSlug: string, fn: () => Promise<string>): Promise<FormState> {
  try {
    const success = await fn();
    revalidatePath(`/o/${orgSlug}/members`);
    return { success };
  } catch (err) {
    if (err instanceof MembershipError || err instanceof ForbiddenError) return { error: err.message };
    throw err;
  }
}

const roleSchema = z.enum(roles);

const addSchema = z.object({
  email: z.email("Enter a valid email address"),
  name: z.string().max(200).optional(),
  role: roleSchema,
  initialPassword: z.string().optional(),
});

export async function addMemberAction(orgSlug: string, _prev: FormState, form: FormData): Promise<FormState> {
  const parsed = addSchema.safeParse({
    email: str(form, "email"),
    name: str(form, "name") || undefined,
    role: str(form, "role"),
    initialPassword: (form.get("initialPassword") as string | null) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { email, name, role, initialPassword } = parsed.data;
  if (initialPassword) {
    const weak = validatePasswordStrength(initialPassword);
    if (weak) return { error: weak };
  }

  return run(orgSlug, async () => {
    const { organizationId } = await requireMemberAdmin(orgSlug);
    const { created } = await addMember(db, { organizationId, email, name, role, initialPassword });
    return created
      ? `Created an account for ${email}. Share the initial password with them securely.`
      : `Added ${email}.`;
  });
}

export async function changeRoleAction(
  orgSlug: string,
  userId: string,
  _prev: FormState,
  form: FormData,
): Promise<FormState> {
  const role = roleSchema.safeParse(str(form, "role"));
  if (!role.success) return { error: "Unknown role" };
  return run(orgSlug, async () => {
    const { organizationId } = await requireMemberAdmin(orgSlug);
    await changeRole(db, organizationId, userId, role.data);
    return "Role updated.";
  });
}

export async function removeMemberAction(orgSlug: string, userId: string, _prev: FormState): Promise<FormState> {
  return run(orgSlug, async () => {
    const { user, organizationId } = await requireMemberAdmin(orgSlug);
    if (user.id === userId) throw new MembershipError("You can't remove yourself");
    await removeMember(db, organizationId, userId);
    return "Member removed.";
  });
}
