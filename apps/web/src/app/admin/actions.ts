"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createOrganization, MembershipError, SLUG_PATTERN, validatePasswordStrength } from "@pollinate/auth";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { str, type FormState } from "@/lib/form";

const schema = z.object({
  name: z.string().min(1, "Enter an organisation name").max(200),
  slug: z.string().regex(SLUG_PATTERN, "Address: lowercase letters, numbers and hyphens (max 48)"),
  adminEmail: z.email("Enter a valid admin email address"),
  adminName: z.string().max(200).optional(),
  adminPassword: z.string().optional(),
});

export async function createOrganizationAction(_prev: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user?.isPlatformAdmin) return { error: "You don't have permission to do that" };

  const parsed = schema.safeParse({
    name: str(form, "name"),
    slug: str(form, "slug").toLowerCase(),
    adminEmail: str(form, "adminEmail"),
    adminName: str(form, "adminName") || undefined,
    adminPassword: (form.get("adminPassword") as string | null) || undefined,
  });
  if (!parsed.success) return { error: parsed.error.issues[0]!.message };
  const { name, slug, adminEmail, adminName, adminPassword } = parsed.data;
  if (adminPassword) {
    const weak = validatePasswordStrength(adminPassword);
    if (weak) return { error: weak };
  }

  try {
    await createOrganization(db, {
      name,
      slug,
      admin: { email: adminEmail, name: adminName, initialPassword: adminPassword },
    });
  } catch (err) {
    if (err instanceof MembershipError) return { error: err.message };
    throw err;
  }
  revalidatePath("/admin");
  return { success: `Created ${name} at /o/${slug} with ${adminEmail} as admin.` };
}
