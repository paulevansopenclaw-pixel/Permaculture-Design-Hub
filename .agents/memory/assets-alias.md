---
name: "@assets alias needs tsconfig path too"
description: Importing files from attached_assets in permaculture-app requires both the vite alias and a tsconfig paths entry.
---
# `@assets` import alias

The Vite alias `@assets` -> `../../attached_assets` is defined in `artifacts/permaculture-app/vite.config.ts`, but `tsc` resolves modules independently of Vite.

**Rule:** To `import x from "@assets/foo.png"` in this app, the same `@assets/*` mapping must also exist in `artifacts/permaculture-app/tsconfig.json` `compilerOptions.paths` (pointing at `../../attached_assets/*`), or `pnpm run typecheck` fails with module-not-found even though the app runs fine in dev.

**Why:** Vite (runtime/bundler) and TypeScript (typecheck) use separate resolution configs; adding the alias in only one place passes one check and fails the other. PNG/asset module typing itself comes from `vite/client` types already in `tsconfig.json`.
