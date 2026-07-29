import assert from "node:assert/strict";
import test from "node:test";

await import("../bead-palettes.js");

const palettes = globalThis.DougaoBeadPalettes;

test("pins the BeadColors source revision and validates every palette", () => {
  assert.equal(
    palettes.SOURCE.commit,
    "29229889daab404fb30531d4bb785fd73f7f58e3",
  );
  assert.equal(palettes.SOURCE.license, "MIT");
  assert.deepEqual(palettes.validate(), []);
});

test("exposes all supported BeadColors series with stable counts", () => {
  const expected = new Map([
    ["mard-221", 221],
    ["mard-291", 291],
    ["hama-midi", 92],
    ["hama-mini", 78],
    ["hama-maxi", 25],
    ["nabbi", 30],
    ["yant", 119],
    ["perler", 103],
    ["perler-mini", 41],
    ["perler-caps", 26],
    ["artkal-a", 145],
    ["artkal-c", 174],
    ["artkal-m", 220],
    ["artkal-r", 89],
    ["artkal-s", 199],
  ]);

  assert.deepEqual(
    new Map(
      palettes
        .listPalettes()
        .map((palette) => [palette.id, palette.count]),
    ),
    expected,
  );
});

test("keeps MARD basic and complete palettes as explicit choices", () => {
  const basic = palettes.getPalette("mard-221");
  const complete = palettes.getPalette("mard-291");

  assert.equal(basic.colors.length, 221);
  assert.equal(complete.colors.length, 291);
  assert.ok(basic.colors.every((color) => /^[A-HM]\d+$/.test(color.code)));
  assert.ok(complete.colors.some((color) => /^P\d+$/.test(color.code)));
  assert.equal(basic.revision, complete.revision);
});

test("returns defensive palette copies", () => {
  const first = palettes.getPalette("hama-midi");
  const second = palettes.getPalette("hama-midi");

  first.colors[0].r = 0;
  assert.notEqual(second.colors[0].r, 0);
});
