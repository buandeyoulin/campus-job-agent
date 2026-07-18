import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../extension");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const approvedHosts = ["https://offerbiu.com/*", "http://127.0.0.1:4317/*"];
if (manifest.manifest_version !== 3) throw new Error("Extension must use Manifest V3");
if (JSON.stringify(manifest.host_permissions) !== JSON.stringify(approvedHosts)) {
  throw new Error("Extension host permissions exceed the approved boundary");
}
if ((manifest.permissions ?? []).length !== 0) throw new Error("Extension must not request privileged permissions");

const referenced = new Set([manifest.background.service_worker]);
for (const script of manifest.content_scripts) {
  for (const file of script.js ?? []) referenced.add(file);
  for (const file of script.css ?? []) referenced.add(file);
}
for (const file of referenced) await access(path.join(root, file));

const forbidden = ["chrome.cookies", "document.cookie", "localStorage", "sessionStorage"];
for (const file of [...referenced].filter((name) => name.endsWith(".js"))) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const term of forbidden) if (source.includes(term)) throw new Error(`${file} references forbidden API ${term}`);
}

console.log(`Verified OfferBiu bridge extension (${referenced.size} files).`);
