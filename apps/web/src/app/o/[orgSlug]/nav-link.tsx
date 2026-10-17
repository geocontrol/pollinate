"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`border-b-2 px-1 py-3 text-sm font-medium ${
        active ? "border-honey-500 text-stone-900" : "border-transparent text-stone-500 hover:text-stone-800"
      }`}
    >
      {children}
    </Link>
  );
}
