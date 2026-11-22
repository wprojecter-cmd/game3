import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "cesium");
const clientModules = path.join(root, "client", "node_modules");
const target = path.join(clientModules, "cesium");

if (!fs.existsSync(source)) {
  throw new Error("Cesium is not installed at the workspace root. Run npm install first.");
}
fs.mkdirSync(clientModules, { recursive: true });

try {
  const stat = fs.lstatSync(target);
  if (stat.isSymbolicLink()) fs.unlinkSync(target);
  else if (stat.isDirectory()) fs.rmSync(target, { recursive: true, force: true });
  else fs.rmSync(target, { force: true });
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

// vite-plugin-cesium resolves its static assets relative to the client workspace.
// npm workspaces hoist Cesium to the repository root, so expose it at the path
// expected by the plugin without duplicating the large package.
fs.symlinkSync(path.relative(clientModules, source), target, "dir");
console.log("Prepared Cesium workspace path:", target, "->", source);
