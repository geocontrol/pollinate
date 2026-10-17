import { describe, expect, it } from "vitest";
import { can, hashPassword, needsRehash, validatePasswordStrength, verifyPassword } from "../src/index";

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).toMatch(/^scrypt\$65536\$8\$2\$/);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("correct horse batterY", hash)).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same password!")).not.toBe(await hashPassword("same password!"));
  });

  it("normalises unicode so visually identical passwords match", async () => {
    const composed = "café-password";
    const decomposed = "café-password";
    expect(await verifyPassword(decomposed, await hashPassword(composed))).toBe(true);
  });

  it("rejects malformed stored hashes", async () => {
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "bcrypt$1$2$3$4$5")).toBe(false);
  });

  it("flags hashes made with old parameters", async () => {
    expect(needsRehash(await hashPassword("whatever pass"))).toBe(false);
    expect(needsRehash("scrypt$16384$8$1$c2FsdA==$a2V5")).toBe(true);
  });

  it("enforces minimum length", () => {
    expect(validatePasswordStrength("short")).toMatch(/at least 12/);
    expect(validatePasswordStrength("long enough pw")).toBeNull();
  });
});

describe("permissions", () => {
  it("lets only admins manage members", () => {
    expect(can("org_admin", "members:manage")).toBe(true);
    expect(can("analyst", "members:manage")).toBe(false);
    expect(can("viewer", "members:manage")).toBe(false);
  });

  it("keeps viewers read-only", () => {
    expect(can("viewer", "survey:view")).toBe(true);
    expect(can("viewer", "survey:edit")).toBe(false);
    expect(can("viewer", "analysis:run")).toBe(false);
    expect(can("analyst", "survey:edit")).toBe(true);
  });
});
