import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const distDir = path.join(root, "dist");
const serverDir = path.join(distDir, "server");
const distOpenAiDir = path.join(distDir, ".openai");

if (!fs.existsSync(path.join(distDir, "index.html"))) {
  throw new Error("Vite output is missing dist/index.html.");
}

fs.copyFileSync(path.join(distDir, "index.html"), path.join(distDir, "404.html"));
fs.mkdirSync(serverDir, { recursive: true });
fs.mkdirSync(distOpenAiDir, { recursive: true });
fs.copyFileSync(path.join(root, ".openai", "hosting.json"), path.join(distOpenAiDir, "hosting.json"));

function collectFiles(dir, rel = "") {
  const entries = [];
  for (const entry of fs.readdirSync(path.join(dir, rel))) {
    if ((rel === "" && entry === "server") || (rel === "" && entry === ".openai")) {
      continue;
    }

    const childRel = rel ? `${rel}/${entry}` : entry;
    const childAbs = path.join(dir, childRel);
    const stat = fs.statSync(childAbs);
    if (stat.isDirectory()) {
      entries.push(...collectFiles(dir, childRel));
    } else if (stat.isFile()) {
      entries.push(childRel);
    }
  }
  return entries;
}

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".html") return "text/html; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".json" || ext === ".map") return "application/json; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  return "application/octet-stream";
}

const assetEntries = collectFiles(distDir).map((filePath) => ({
  path: `/${filePath.replaceAll("\\", "/")}`,
  contentType: contentTypeFor(filePath),
  body: fs.readFileSync(path.join(distDir, filePath)).toString("base64")
}));

const serverSource = `const INDEX_PATH = "/index.html";
const ASSET_LIST = ${JSON.stringify(assetEntries)};
const ASSETS = new Map(ASSET_LIST.map((asset) => [asset.path, asset]));

function hasFileExtension(pathname) {
  return /\\.[a-zA-Z0-9]+$/.test(pathname);
}

function decodeBase64(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function assetResponse(asset) {
  return new Response(decodeBase64(asset.body), {
    headers: {
      "content-type": asset.contentType,
      "cache-control": asset.path === INDEX_PATH ? "no-cache" : "public, max-age=31536000, immutable"
    }
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const pathname = url.pathname === "/" ? INDEX_PATH : url.pathname;
    const asset = ASSETS.get(pathname);

    if (asset) {
      return assetResponse(asset);
    }

    if (!hasFileExtension(pathname)) {
      const indexAsset = ASSETS.get(INDEX_PATH);
      return indexAsset ? assetResponse(indexAsset) : new Response("Not found", { status: 404 });
    }

    return new Response("Not found", { status: 404 });
  }
};
`;

fs.writeFileSync(path.join(serverDir, "index.js"), serverSource);
