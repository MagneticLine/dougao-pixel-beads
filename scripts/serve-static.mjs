import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const publicRoot = resolve(import.meta.dirname, "..", "public");
const host = process.env.HOST || "127.0.0.1";
const parsedPort = Number.parseInt(process.env.PORT || "4173", 10);
const port = Number.isFinite(parsedPort) ? parsedPort : 4173;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
  [".bmp", "image/bmp"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
]);

const securityHeaders = {
  "Cache-Control": "no-store",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), web-share=(self)",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
};

async function resolveRequestFile(requestUrl) {
  const url = new URL(requestUrl || "/", `http://${host}:${port}`);
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { status: 400 };
  }

  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const candidate = resolve(publicRoot, relativePath);
  if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${sep}`)) {
    return { status: 403 };
  }

  try {
    const fileStat = await stat(candidate);
    if (fileStat.isFile()) return { path: candidate, status: 200 };
    if (fileStat.isDirectory()) {
      const directoryIndex = resolve(candidate, "index.html");
      const indexStat = await stat(directoryIndex);
      if (indexStat.isFile()) {
        return { path: directoryIndex, status: 200 };
      }
    }
  } catch {
    // Cloudflare Pages serves index.html as the fallback when no 404.html exists.
  }

  return { path: resolve(publicRoot, "index.html"), status: 200 };
}

const server = createServer(async (request, response) => {
  if (!["GET", "HEAD"].includes(request.method || "")) {
    response.writeHead(405, { ...securityHeaders, Allow: "GET, HEAD" });
    response.end();
    return;
  }

  const resolved = await resolveRequestFile(request.url);
  if (!resolved.path) {
    response.writeHead(resolved.status, securityHeaders);
    response.end();
    return;
  }

  response.writeHead(resolved.status, {
    ...securityHeaders,
    "Content-Type": contentTypes.get(extname(resolved.path)) || "application/octet-stream",
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  createReadStream(resolved.path).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Static site ready at http://${host}:${port}/`);
});
