/** Result returned by server actions to forms using useActionState. */
export type FormState = { error?: string; success?: string } | undefined;

export function str(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}
