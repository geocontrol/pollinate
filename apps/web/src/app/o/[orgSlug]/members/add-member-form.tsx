"use client";

import { useActionState, useEffect, useRef } from "react";
import { MIN_PASSWORD_LENGTH } from "@pollinate/auth/password-rules";
import { roleLabels, roles } from "@pollinate/auth/permissions";
import { FormMessage } from "@/components/form-message";
import { addMemberAction } from "./actions";

export function AddMemberForm({ orgSlug }: { orgSlug: string }) {
  const [state, action, pending] = useActionState(addMemberAction.bind(null, orgSlug), undefined);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-4 p-5">
      <h2 className="font-medium">Add a member</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="name" className="label">
            Name <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input id="name" name="name" className="input" />
        </div>
        <div>
          <label htmlFor="role" className="label">
            Role
          </label>
          <select id="role" name="role" defaultValue="analyst" className="input">
            {roles.map((r) => (
              <option key={r} value={r}>
                {roleLabels[r]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="initialPassword" className="label">
            Initial password <span className="font-normal text-stone-400">(new accounts only)</span>
          </label>
          <input
            id="initialPassword"
            name="initialPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            className="input"
          />
        </div>
      </div>
      <p className="text-xs text-stone-500">
        If the person already has a Pollinate account they are added straight away and the password is ignored.
        Email invitations will replace initial passwords in a later phase.
      </p>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Adding…" : "Add member"}
      </button>
    </form>
  );
}
