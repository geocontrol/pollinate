/**
 * Creates (or promotes) a platform admin, and optionally a first organisation.
 *
 *   npm run bootstrap -w @pollinate/web -- --email you@example.com [--name "Your Name"] \
 *     [--org-name "Acme Ltd" --org-slug acme]
 *
 * The password is read from BOOTSTRAP_PASSWORD, or prompted for (hidden) —
 * never from argv, so it stays out of shell history.
 */
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";
import { eq } from "drizzle-orm";
import {
  createOrganization,
  findUserByEmail,
  hashPassword,
  SLUG_PATTERN,
  validatePasswordStrength,
} from "@pollinate/auth";
import { createDb, users } from "@pollinate/db";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    "org-name": { type: "string" },
    "org-slug": { type: "string" },
  },
});

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { _writeToOutput: (s: string) => void };
    process.stdout.write(question);
    output._writeToOutput = () => {};
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const email = values.email?.trim();
  if (!email) fail("--email is required");
  const orgName = values["org-name"]?.trim();
  const orgSlug = values["org-slug"]?.trim();
  if (Boolean(orgName) !== Boolean(orgSlug)) fail("--org-name and --org-slug go together");
  if (orgSlug && !SLUG_PATTERN.test(orgSlug)) fail("--org-slug: lowercase letters, numbers and hyphens");

  const url = process.env.DATABASE_URL ?? "postgres://pollinate_app:pollinate_app@localhost:5432/pollinate";
  const { db, pool } = createDb(url);
  try {
    const existing = await findUserByEmail(db, email);
    if (existing) {
      await db.update(users).set({ isPlatformAdmin: true }).where(eq(users.id, existing.id));
      console.log(`${email} already exists; granted platform admin.`);
    } else {
      const password = process.env.BOOTSTRAP_PASSWORD ?? (await promptHidden(`Password for ${email}: `));
      const weak = validatePasswordStrength(password);
      if (weak) fail(weak);
      await db.insert(users).values({
        email,
        name: values.name?.trim() || null,
        passwordHash: await hashPassword(password),
        isPlatformAdmin: true,
      });
      console.log(`Created platform admin ${email}.`);
    }

    if (orgName && orgSlug) {
      await createOrganization(db, { name: orgName, slug: orgSlug, admin: { email } });
      console.log(`Created organisation ${orgName} at /o/${orgSlug} with ${email} as admin.`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
