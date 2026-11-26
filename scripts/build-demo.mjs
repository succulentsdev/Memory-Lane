// Builds a self-contained demo (demo-dist/: index.html + app.js + app.css) from the same
// components, without the Next.js server/router, so it can be hosted as static files anywhere.
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const out = path.join(root, "demo-dist");
await mkdir(out, { recursive: true });

const env = {
  "process.env.NODE_ENV": '"production"',
  "process.env.NEXT_PUBLIC_DEMO": '"1"',
  "process.env.NEXT_PUBLIC_MAPILLARY_TOKEN": '""',
  "process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY": '""',
  "process.env.NEXT_PUBLIC_AI_ASSISTANT_ENABLED": '"false"',
};

await build({
  entryPoints: [path.join(root, "demo/main.tsx")],
  bundle: true,
  minify: true,
  format: "iife",
  target: ["es2020", "safari15"],
  jsx: "automatic",
  outfile: path.join(out, "app.js"),
  define: env,
  alias: {
    "next/link": path.join(root, "demo/shims/next-link.tsx"),
    "next/navigation": path.join(root, "demo/shims/next-navigation.ts"),
    "next/dynamic": path.join(root, "demo/shims/next-dynamic.tsx"),
    "@": root,
  },
  loader: { ".css": "empty" },
  logLevel: "warning",
});

const leafletCss = await readFile(path.join(root, "node_modules/leaflet/dist/leaflet.css"), "utf8");
const globals = await readFile(path.join(root, "app/globals.css"), "utf8");
const result = await postcss([tailwind({ base: root })]).process(globals, { from: path.join(root, "app/globals.css") });
await writeFile(path.join(out, "app.css"), leafletCss.replace(/url\([^)]*\)/g, "none") + "\n" + result.css);

const html = `<title>Memory Lane</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="theme-color" content="#fbf6ee">
<link rel="stylesheet" href="app.css">
<style>html,body{height:100%;background:#fbf6ee;color:#2b2420}</style>
<div id="root"></div>
<script src="app.js"></script>
`;
await writeFile(path.join(out, "index.html"), html);
console.log("demo built ->", out);
