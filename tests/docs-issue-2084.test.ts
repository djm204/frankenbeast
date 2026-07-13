import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readDoc = (path: string) => readFileSync(resolve(ROOT, path), "utf8");

describe("issue #2084 ADR-019 local-encrypted operator guidance", () => {
  it("uses the current local-encrypted storage paths and passphrase env var", () => {
    const adr = readDoc("docs/adr/019-secret-backend-comparison.md");

    expect(adr).toContain(".fbeast/secrets.enc");
    expect(adr).toContain(".fbeast/secrets.meta.json");
    expect(adr).toContain("FRANKENBEAST_PASSPHRASE");
    expect(adr).not.toContain(".frankenbeast/secrets.enc");
    expect(adr).not.toContain("FRANKENBEAST_STORE_PASSPHRASE");
  });
});
