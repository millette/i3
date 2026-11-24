import { strict as assert } from "node:assert";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { test } from "node:test";
import { generated } from "../tools/vendor.ts";

const root = join(import.meta.dirname, "..");

test("polybar/scripts and i3status-rust/scripts match lib/ (run `npm run vendor`)", async () => {
  for (const [rel, expected] of await generated()) {
    assert.equal(await readFile(join(root, rel), "utf8"), expected, `${rel} is out of date`);
    if (/scripts\/[a-z-]+\.ts$/.test(rel)) {
      assert.ok((await stat(join(root, rel))).mode & 0o100, `${rel} must be executable`);
    }
  }
});
