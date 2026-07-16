import test from "node:test";
import assert from "node:assert/strict";
import { tokenRegenerationFields } from "./performance.js";

test("self token regeneration resets only self edit count", () => {
  const data = tokenRegenerationFields(
    { regenerateSelfToken: true },
    () => "new-public-token",
  );

  assert.deepEqual(data, {
    selfToken: "new-public-token",
    selfEditCount: 0,
  });
  assert.equal(
    Object.keys(data).some((key) => /AccessKey|FailCount|LockedUntil/.test(key)),
    false,
  );
});

test("manager token regeneration resets only manager edit count", () => {
  const data = tokenRegenerationFields(
    { regenerateManagerToken: true },
    () => "new-public-token",
  );

  assert.deepEqual(data, {
    managerToken: "new-public-token",
    managerEditCount: 0,
  });
  assert.equal(
    Object.keys(data).some((key) => /AccessKey|FailCount|LockedUntil/.test(key)),
    false,
  );
});
