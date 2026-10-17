import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export default function globalSetup() {
  execFileSync("npx", ["tsx", fileURLToPath(new URL("./seed.ts", import.meta.url))], { stdio: "inherit" });
}
