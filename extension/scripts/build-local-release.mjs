import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => {
  if (value.startsWith("--") && all[index + 1] && !all[index + 1].startsWith("--")) pairs.push([value.slice(2), all[index + 1]]);
  return pairs;
}, []));
const output = resolve(args.out || join(source, "local-release"));
if (output === source || source.startsWith(output + "/")) throw new Error("Choose a separate output directory.");
const files = ["icon16.png", "icon32.png", "icon48.png", "icon128.png", "insights-model.js", "course-health.js", "palette.js", "course-image.js", "insights.js", "insights.css", "appearance.css", "appearance-frame.js", "appearance-frame.css", "vendor/libheif-without-unsafe-eval.js", "vendor/LICENSE-heic-to.txt"];
for (const file of files) {
  const target = join(output, file);
  await mkdir(dirname(target), { recursive: true });
  if (!file.endsWith(".js")) { await copyFile(join(source, file), target); continue; }
  let content = await readFile(join(source, file), "utf8");
  if (file === "insights-model.js") content = content.replace('const ORIGIN = "https://canvas.upenn.edu";', "const ORIGIN = location.origin;");
  if (file === "course-health.js") content = content.replaceAll('"https://canvas.upenn.edu"', "location.origin");
  if (file === "appearance-frame.js") content = content.replaceAll('"https://canvas.upenn.edu"', "location.ancestorOrigins?.[0]");
  if (file === "insights.js") {
    const anchor = "      render();\n      for (let offset = 0; offset < ids.length; offset += 3) {";
    if (!content.includes(anchor)) throw new Error("Could not add local course appearance sync.");
    content = content.replace(anchor, "      await broker(\"syncCourses\", { courses: [...state.courses.values()].map(course => ({ canvasId: course.id, name: course.name })) }).catch(() => {});\n      state.workspace = await broker(\"getWorkspace\").catch(() => state.workspace);\n" + anchor);
    content = content.replace('const READ_KEY = "cwReadAssignmentsV1";', 'const READ_KEY = "cwReadAssignmentsV1:" + location.origin;');
    content = content.replace("Nothing here is sent to Coursewise or OpenAI when you browse.", "Coursewise keeps your choices in this browser.");
  }
  if (/canvas\.upenn\.edu|localhost:5173/.test(content)) throw new Error(`Hard-coded host remains in ${file}.`);
  await writeFile(target, content);
}
for (const file of ["background.js", "sidepanel.html", "sidepanel.js", "privacy.html"]) {
  const content = await readFile(join(source, "local", file), "utf8");
  await writeFile(join(output, file), content);
}
await copyFile(join(source, "sidepanel.css"), join(output, "sidepanel.css"));
const manifest = JSON.parse(await readFile(join(source, "manifest.json"), "utf8"));
manifest.name = "Coursewise for Canvas";
manifest.description = "Customize Canvas and view local course deadlines, grades, and announcements.";
manifest.minimum_chrome_version = "119";
delete manifest.key;
manifest.permissions = ["sidePanel", "storage", "scripting"];
manifest.host_permissions = [];
manifest.optional_host_permissions = ["https://*/*"];
delete manifest.content_scripts;
await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`School-independent local extension staged at ${output}`);
