import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    // Migrations run as the owner role; the app connects as pollinate_app.
    url: process.env.DATABASE_OWNER_URL ?? "postgres://pollinate_owner:pollinate_owner@localhost:5432/pollinate",
  },
  strict: true,
  verbose: true,
});
