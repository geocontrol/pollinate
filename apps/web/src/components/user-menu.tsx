import Link from "next/link";
import type { SessionUser } from "@pollinate/auth";
import { logout } from "@/app/login/actions";

export function UserMenu({ user, showSwitch }: { user: SessionUser; showSwitch: boolean }) {
  return (
    <div className="flex items-center gap-4 text-sm">
      {showSwitch && (
        <Link href="/orgs" className="text-stone-600 hover:text-stone-900">
          Switch organisation
        </Link>
      )}
      {user.isPlatformAdmin && (
        <Link href="/admin" className="text-stone-600 hover:text-stone-900">
          Platform admin
        </Link>
      )}
      <span className="text-stone-500" title={user.email}>
        {user.name ?? user.email}
      </span>
      <form action={logout}>
        <button type="submit" className="btn-secondary px-3 py-1.5">
          Sign out
        </button>
      </form>
    </div>
  );
}
