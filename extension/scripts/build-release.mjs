import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--") && all[index + 1] && !all[index + 1].startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
function origin(value, label) {
  if (!value) throw new Error(`Missing --${label} HTTPS origin.`);
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password || parsed.port)
    throw new Error(`--${label} must be an HTTPS origin without a path, port, query, or credentials.`);
  return parsed.origin;
}
const site = origin(args.site, "site"), canvas = origin(args.canvas, "canvas");
const output = resolve(args.out || join(source, "release"));
if (output === source || source.startsWith(output + "/")) throw new Error("Choose a separate output directory.");
const files = ["manifest.json", "icon16.png", "icon32.png", "icon48.png", "icon128.png", "background.js", "sidepanel.html", "sidepanel.js", "sidepanel.css", "content.js", "insights-model.js", "course-health.js", "palette.js", "course-image.js", "insights.js", "insights.css", "canvas-app.js", "canvas-app.css", "appearance.css", "appearance-frame.js", "appearance-frame.css", "chat-format.js", "vendor/libheif-without-unsafe-eval.js", "vendor/LICENSE-heic-to.txt"];
for (const file of files) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  if (!/\.(?:js|html|json)$/.test(file)) { await copyFile(join(source, file), target); continue; }
  let text = await readFile(join(source, file), "utf8");
  text = text.replaceAll("http://localhost:5173", site)
    .replaceAll("https://canvas.upenn.edu", canvas)
    .replaceAll("canvas.upenn.edu", new URL(canvas).hostname)
    .replaceAll("local Coursewise workspace", "Coursewise workspace")
    .replaceAll("local Coursewise", "Coursewise")
    .replaceAll("local backend", "Coursewise service");
  if (file === "manifest.json") {
    const manifest = JSON.parse(text);
    manifest.name = "Coursewise Canvas Bridge";
    manifest.description = "Plan Canvas coursework and use your Coursewise study workspace.";
    manifest.host_permissions = [`${canvas}/*`, `${site}/*`];
    for (const script of manifest.content_scripts) script.matches = [`${canvas}/*`];
    text = JSON.stringify(manifest, null, 2) + "\n";
  }
  if (file === "sidepanel.html") text = text.replace("Canvas bridge · local prototype", "Canvas bridge");
  await writeFile(target, text);
}
console.log(`Release extension staged at ${output}\nCanvas: ${canvas}\nCoursewise: ${site}`);
