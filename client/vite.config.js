import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function locateCesiumPackage() {
  let current = path.dirname(require.resolve("cesium"));
  while (true) {
    const manifest = path.join(current, "package.json");
    if (fs.existsSync(manifest)) {
      try {
        if (JSON.parse(fs.readFileSync(manifest, "utf8")).name === "cesium") return current;
      } catch {}
    }
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Could not locate the installed Cesium package.");
    current = parent;
  }
}

function copyCesiumStaticAssets() {
  let outputDirectory;
  const cesiumBuild = path.join(locateCesiumPackage(), "Build", "Cesium");
  const folders = ["Assets", "ThirdParty", "Workers", "Widgets"];

  return {
    name: "game3-copy-cesium-static-assets",
    configResolved(config) {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    buildStart() {
      for (const folder of folders) {
        const source = path.join(cesiumBuild, folder);
        if (!fs.existsSync(source)) {
          this.error(`Cesium static directory is missing: ${source}`);
        }
      }
    },
    closeBundle() {
      const destination = path.join(outputDirectory, "cesium");
      fs.mkdirSync(destination, { recursive: true });
      for (const folder of folders) {
        fs.cpSync(path.join(cesiumBuild, folder), path.join(destination, folder), { recursive: true });
      }
      console.log(`Copied Cesium static assets to ${destination}`);
    }
  };
}

export default defineConfig({
  plugins: [react(), copyCesiumStaticAssets()],
  define: { CESIUM_BASE_URL: JSON.stringify("/cesium/") },
  server: {
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: "http://127.0.0.1:10000",
        changeOrigin: true
      }
    }
  },
  preview: { host: "0.0.0.0" }
});
