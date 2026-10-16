import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outIndex = process.argv.indexOf("--out");
const output = resolve(outIndex < 0 ? join(source, "local-release") : process.argv[outIndex + 1]);
const storeIcons = process.argv.includes("--store-icons");
if (output === source || source.startsWith(output + "/")) throw new Error("Choose a separate output directory.");

const files = [
  "manifest.json", "icon16.png", "icon32.png", "icon48.png", "icon128.png",
  "background.js", "sidepanel.html", "sidepanel.js", "sidepanel.css", "privacy.html",
  "insights-model.js", "course-health.js", "palette.js", "theme-bootstrap.js",
  "theme-bootstrap.css", "course-image.js", "insights.js", "insights.css",
  "appearance.css", "appearance-frame.js", "appearance-frame.css",
  "vendor/libheif-without-unsafe-eval.js", "vendor/LICENSE-heic-to.txt"
];
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
if (manifest.content_scripts || manifest.host_permissions?.some(origin => origin.includes("localhost")))
  throw new Error("The main extension manifest must contain only the local edition.");
for (const file of files) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  if (file === "manifest.json" && !storeIcons) {
    await writeFile(target, JSON.stringify({ ...manifest, name: "Coursewise local" }, null, 2) + "\n");
    continue;
  }
  const icon = /^icon(?:16|32|48|128)\.png$/.test(file);
  await copyFile(join(source, icon && !storeIcons ? "testing-icons" : "", file), target);
}
console.log(`Coursewise extension with ${storeIcons ? "store" : "local outline"} icons staged at ${output}`);
