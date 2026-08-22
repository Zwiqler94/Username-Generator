import {strict as assert} from "node:assert";
import {readFileSync} from "node:fs";
import {test} from "node:test";

test("callable does not serialize request or error details", () => {
  const source = readFileSync("src/index.ts", "utf8");

  assert.doesNotMatch(source, /debug\s*\(/);
  assert.doesNotMatch(source, /error\(err\)/);
});
