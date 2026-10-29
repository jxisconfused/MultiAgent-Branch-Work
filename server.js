import { stat } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

const links = new Map();
const port = Number.parseInt(process.env.PORT || "3000", 10);
const publicRoot = process.env.PUBLIC_DIR ? resolve(process.env.PUBLIC_DIR) : null;

function getBaseUrl() {
  const configuredUrl = process.env.BASE_URL;
  const origin = configuredUrl || (process.env.RAILWAY_PUBLIC_DOMAIN
    ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
    : `http://localhost:${port}`);

  return new URL(origin).origin;
}

const baseUrl = getBaseUrl();
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function createCode() {
  const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
  let code = "";

  while (code.length < 6) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte < 248) code += alphabet[byte % alphabet.length];
      if (code.length === 6) break;
    }
  }

  return code;
}

async function serveStaticFile(request, pathname) {
  if (!publicRoot || (request.method !== "GET" && request.method !== "HEAD")) return null;

  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  const requestedFile = decodedPath === "/" ? "index.html" : decodedPath.replace(/^[/\\]+/, "");
  const filePath = resolve(publicRoot, requestedFile);
  const relativePath = relative(publicRoot, filePath);
  if (relativePath === ".." || relativePath.startsWith(`..${sep}`) || isAbsolute(relativePath)) {
    return null;
  }

  try {
    if (!(await stat(filePath)).isFile()) return null;
  } catch {
    return null;
  }

  const file = Bun.file(filePath);
  return new Response(request.method === "HEAD" ? null : file, {
    headers: {
      ...corsHeaders,
      "Content-Type": file.type || "application/octet-stream",
    },
  });
}

const server = Bun.serve({
  port,
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const requestUrl = new URL(request.url);
    const pathname = requestUrl.pathname;

    if (request.method === "POST" && pathname === "/api/links") {
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (!payload || typeof payload.url !== "string") {
        return jsonResponse({ error: "A URL is required" }, 400);
      }

      const originalUrl = payload.url.trim();
      let parsedUrl;
      try {
        parsedUrl = new URL(originalUrl);
      } catch {
        return jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400);
      }

      if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ error: "A valid HTTP or HTTPS URL is required" }, 400);
      }

      let code;
      do {
        code = createCode();
      } while (links.has(code));

      const link = {
        code,
        url: originalUrl,
        shortUrl: `${baseUrl}/${code}`,
        hits: 0,
        createdAt: new Date().toISOString(),
      };
      links.set(code, link);
      return jsonResponse(link, 201);
    }

    if (request.method === "GET" && pathname === "/api/links") {
      return jsonResponse(Array.from(links.values()));
    }

    const staticResponse = await serveStaticFile(request, pathname);
    if (staticResponse) return staticResponse;

    if (request.method === "GET" && pathname.startsWith("/") && !pathname.slice(1).includes("/")) {
      const link = links.get(pathname.slice(1));
      if (link) {
        link.hits += 1;
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders, Location: link.url },
        });
      }
    }

    return jsonResponse({ error: "Not found" }, 404);
  },
});

console.log(`Snip backend listening on ${server.url}`);