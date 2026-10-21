import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const version = randomUUID();
  return {
    base: process.env.VITE_BASE_PATH || "/",
    define: { __APP_VERSION__: JSON.stringify(version) },
    plugins: [
      react(),
      {
        name: "app-version",
        apply: "build",
        generateBundle(_options, bundle) {
          this.emitFile({
            type: "asset",
            fileName: "version.json",
            source: JSON.stringify({ version }),
          });
          this.emitFile({
            type: "asset",
            fileName: "sw.js",
            source: readFileSync(
              new URL("./service-worker.js", import.meta.url),
              "utf8",
            )
              .replaceAll("__APP_VERSION__", version)
              .replace(
                "__PRECACHE_ASSETS__",
                JSON.stringify(
                  Object.keys(bundle).filter((name) =>
                    /\.(js|css|woff2)$/.test(name),
                  ),
                ),
              ),
          });
        },
      },
    ],
  };
});
