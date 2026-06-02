---
name: esbuild binary asset embedding
description: How to embed a binary asset (e.g. image) into the bundled API server, and why the binary loader fails
---

# Embedding binary assets in the esbuild-bundled API server

The api-server bundles to a single ESM file via `build.mjs`. To serve a static
binary asset (e.g. an Open Graph image) from the bundle, import it and configure
an esbuild loader.

**Use the `base64` loader, NOT `binary`.**
- `loader: { ".jpg": "base64" }` → import default is a base64 string; decode at
  runtime with `Buffer.from(str, "base64")`.
- `loader: { ".jpg": "binary" }` emits runtime code that calls
  `Uint8Array.fromBase64(...)`, which is **not available** in the Node runtime
  here (Node 24.13) and throws `TypeError: Uint8Array.fromBase64 is not a function`
  at startup.

**Why:** keeps the asset self-contained in `dist/index.mjs` so no separate file
copy/static-serve step is needed in production.

**How to apply:** also add a `declare module "*.jpg" { const data: string; export default data; }`
ambient declaration under `src/` (it's covered by tsconfig `include: ["src"]`).
