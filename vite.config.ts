import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import fs from "node:fs";
import path from "node:path";

function devContentPlugin(): Plugin {
  return {
    name: "dev-content-middleware",
    apply: "serve", // Dev mode only; never included in production builds
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/mock-content")) {
          return next();
        }

        const cleanUrl = req.url.replace(/^\/mock-content/, "").split("?")[0];
        // Serve ./dev-content (local ingest target); fallback to ./.sample-content if generated
        const candidates = [
          path.resolve(import.meta.dirname, "dev-content", cleanUrl.replace(/^\/+/, "")),
          path.resolve(import.meta.dirname, ".sample-content", cleanUrl.replace(/^\/+/, "")),
        ];

        let filePath: string | null = null;
        for (const candidate of candidates) {
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            filePath = candidate;
            break;
          }
        }

        if (filePath) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes: Record<string, string> = {
            ".json": "application/json; charset=utf-8",
            ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ".md": "text/markdown; charset=utf-8",
            ".txt": "text/plain; charset=utf-8",
            ".webp": "image/webp",
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".svg": "image/svg+xml",
            ".pdf": "application/pdf",
            ".ipynb": "application/x-ipynb+json",
          };
          res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
          fs.createReadStream(filePath).pipe(res);
          return;
        }

        // Return a clean 404 for missing content files rather than falling through to SPA HTML
        res.statusCode = 404;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ error: "Not Found", path: cleanUrl }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devContentPlugin()],
  resolve: {
    alias: {
      "@": import.meta.dirname + "/src",
    },
  },
});
