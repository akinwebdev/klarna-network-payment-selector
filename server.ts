/**
 * Local dev server: serves static files from public/ and forwards /api/* to the Hono API.
 * Loads .env so PAYTRAIL_MERCHANT_ID / PAYTRAIL_SECRET_KEY work like on Vercel.
 * Run with: npx tsx server.ts  (or npm start)
 */
import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "public");

// Lazy-load API app (avoids circular/load issues)
const getApiApp = async () => {
  const mod = await import("./api/index.ts");
  return mod.default;
};

const MIMES: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".eot": "application/vnd.ms-fontobject",
};

function servePublic(c: import("hono").Context): Response {
  let path = c.req.path === "/" ? "/index.html" : c.req.path;
  path = path.replace(/^\//, "");
  let filePath = join(PUBLIC_DIR, path);
  // If path has no extension and file doesn't exist, try path.html (e.g. /testing -> testing.html)
  if (!path.includes(".") && !existsSync(filePath)) {
    const withHtml = join(PUBLIC_DIR, path + ".html");
    if (existsSync(withHtml)) filePath = withHtml;
  }
  if (!filePath.startsWith(PUBLIC_DIR) || !existsSync(filePath)) {
    return c.notFound();
  }
  try {
    const body = readFileSync(filePath);
    const mime = MIMES[extname(filePath)] ?? "application/octet-stream";
    return new Response(body, {
      headers: { "Content-Type": mime },
    });
  } catch {
    return c.notFound();
  }
}

const app = new Hono();

// Forward /api/* to the API app
app.all("/api/*", async (c) => {
  const apiApp = await getApiApp();
  return apiApp.fetch(c.req.raw);
});

// Serve static files from public/
app.use("*", (c, next) => {
  if (c.req.path.startsWith("/api")) return next();
  return servePublic(c);
});

// Fallback for SPA-style routes (e.g. /product, /payment-complete)
app.get("*", (c) => {
  const path = c.req.path.replace(/^\//, "");
  const withHtml = path.includes(".") ? path : `${path}.html`;
  const filePath = join(PUBLIC_DIR, withHtml);
  if (existsSync(filePath)) {
    const body = readFileSync(filePath);
    return new Response(body, { headers: { "Content-Type": "text/html" } });
  }
  return c.notFound();
});

const defaultPort = Number(process.env.PORT) || 3000;
const maxPort = defaultPort + 10;

function tryServe(port: number) {
  serve({ fetch: app.fetch, port }, (info) => {
    console.log(`\n  Server running at http://localhost:${info.port}\n`);
  }).on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE" && port < maxPort) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      tryServe(port + 1);
    } else {
      console.error("Failed to start server:", err.message);
      process.exit(1);
    }
  });
}

tryServe(defaultPort);
