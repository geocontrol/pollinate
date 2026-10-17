export const roles = ["org_admin", "analyst", "viewer"] as const;
export type Role = (typeof roles)[number];

export const roleLabels: Record<Role, string> = {
  org_admin: "Admin",
  analyst: "Analyst",
  viewer: "Viewer",
};

/**
 * What each role may do within an organisation. Every server action checks
 * one of these — hiding UI is not access control.
 */
const permissions = {
  "survey:view": ["org_admin", "analyst", "viewer"],
  "survey:edit": ["org_admin", "analyst"],
  "survey:publish": ["org_admin", "analyst"],
  "responses:view": ["org_admin", "analyst", "viewer"],
  "analysis:run": ["org_admin", "analyst"],
  "reports:edit": ["org_admin", "analyst"],
  "members:view": ["org_admin", "analyst", "viewer"],
  "members:manage": ["org_admin"],
  "org:settings": ["org_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: Role, permission: Permission): boolean {
  return (permissions[permission] as readonly Role[]).includes(role);
}

export class ForbiddenError extends Error {
  override name = "ForbiddenError";
}
