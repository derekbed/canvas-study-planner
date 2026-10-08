import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("release package uses only the configured school and HTTPS site", () => {
  const out = mkdtempSync(join(tmpdir(), "coursewise-extension-"));
  try {
    const result = spawnSync(process.execPath, [new URL("../scripts/build-release.mjs", import.meta.url).pathname,
      "--site", "https://study.example.edu", "--canvas", "https://canvas.example.edu", "--out", out], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    assert.deepEqual(manifest.host_permissions, ["https://canvas.example.edu/*", "https://study.example.edu/*"]);
    assert.ok(manifest.icons["128"]);
    for (const file of ["background.js", "sidepanel.js", "sidepanel.html", "content.js", "canvas-app.js", "insights-model.js", "course-health.js", "appearance-frame.js"]) {
      const code = readFileSync(join(out, file), "utf8");
      assert.doesNotMatch(code, /localhost:5173|canvas\.upenn\.edu|local prototype/, file);
    }
  } finally { rmSync(out, { recursive: true, force: true }); }
});

test("release builder rejects insecure site origins", () => {
  const result = spawnSync(process.execPath, [new URL("../scripts/build-release.mjs", import.meta.url).pathname,
    "--site", "http://study.example.edu", "--canvas", "https://canvas.example.edu"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
});
