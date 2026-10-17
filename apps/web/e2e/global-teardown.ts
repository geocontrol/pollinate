import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function globalTeardown() {
  execFileSync("npx", ["tsx", fileURLToPath(new URL("./seed.ts", import.meta.url)), "--teardown"], {
    stdio: "inherit",
  });
}
