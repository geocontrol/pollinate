"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { MIN_PASSWORD_LENGTH } from "@pollinate/auth/password-rules";
import { FormMessage } from "@/components/form-message";
import { createOrganizationAction } from "./actions";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function CreateOrgForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, undefined);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setSlug("");
      setSlugEdited(false);
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card space-y-4 p-5">
      <h2 className="font-medium">New organisation</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="name" className="label">
            Name
          </label>
          <input
            id="name"
            name="name"
            required
            className="input"
            onChange={(e) => !slugEdited && setSlug(slugify(e.target.value))}
          />
        </div>
        <div>
          <label htmlFor="slug" className="label">
            Address
          </label>
          <div className="flex items-center gap-1 text-sm text-stone-500">
            <span>/o/</span>
            <input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugEdited(true);
                setSlug(e.target.value);
              }}
              className="input"
            />
          </div>
        </div>
        <div>
          <label htmlFor="adminEmail" className="label">
            First admin&apos;s email
          </label>
          <input id="adminEmail" name="adminEmail" type="email" required className="input" />
        </div>
        <div>
          <label htmlFor="adminName" className="label">
            First admin&apos;s name <span className="font-normal text-stone-400">(optional)</span>
          </label>
          <input id="adminName" name="adminName" className="input" />
        </div>
        <div>
          <label htmlFor="adminPassword" className="label">
            Initial password <span className="font-normal text-stone-400">(new accounts only)</span>
          </label>
          <input
            id="adminPassword"
            name="adminPassword"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            className="input"
          />
        </div>
      </div>
      <FormMessage state={state} />
      <button type="submit" disabled={pending} className="btn-primary">
        {pending ? "Creating…" : "Create organisation"}
      </button>
    </form>
  );
}
