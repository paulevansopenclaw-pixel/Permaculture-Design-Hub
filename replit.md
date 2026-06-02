# PermaMap — Permaculture Design Studio

A collaborative permaculture design web app where designers draw property boundaries, generate terrain contours, and collect geo-located client feedback in real time.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000/8080)
- `pnpm --filter @workspace/permaculture-app run dev` — run the Vite frontend (port from `PORT`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `MAPBOX_PUBLIC_KEY`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec at `lib/api-spec/openapi.yaml`)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, Tailwind CSS v4, shadcn/ui
- Map: Mapbox GL JS v3 + Mapbox Draw + Turf.js
- State: Zustand (`useAppStore`)
- Data fetching: React Query (Orval-generated hooks)

## Where things live

- `lib/db/src/schema/` — Drizzle table definitions (`propertiesTable`, `commentsTable`)
- `lib/api-spec/openapi.yaml` — OpenAPI 3.0 contract (source of truth for routes)
- `lib/api-client-react/src/generated/` — Orval-generated React Query hooks & Zod schemas
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/permaculture-app/src/pages/MapPage.tsx` — Main map workspace
- `artifacts/permaculture-app/src/pages/PropertiesPage.tsx` — Property list/management
- `artifacts/permaculture-app/src/lib/contourEngine.ts` — Terrain-RGB tile fetching + d3-contour generation
- `artifacts/permaculture-app/src/store/useAppStore.ts` — Zustand store (role, activePropertyId)

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives Zod validation on both server (route handlers) and client (hooks + types). Never write types by hand for API shapes.
- **Mapbox token exposure**: `MAPBOX_PUBLIC_KEY` secret is exposed to the Vite client bundle via `define: { "import.meta.env.VITE_MAPBOX_TOKEN": ... }` in `vite.config.ts` — this is correct because Mapbox public tokens are intentionally client-side.
- **Boundary GeoJSON storage**: Stored as a JSON string in a `text` column (`boundaryGeojson`) and parsed/serialized at the API layer. Avoids PostGIS dependency while keeping flexibility.
- **Contour generation**: Runs client-side — fetches Mapbox Terrain-RGB tiles, decodes elevation from RGB, runs `d3-contour` at 1m intervals, converts pixel coords back to lng/lat via Web Mercator math.
- **Polling over WebSockets**: Comments auto-refetch every 10 seconds (`refetchInterval: 10_000`) — sufficient for permaculture collaboration and avoids WS infrastructure.

## Product

- **Map workspace** (`/`): Full-screen Mapbox satellite map with dark forest-green sidebar. Designer can draw polygon boundaries (Mapbox Draw), save them with area calculations (Turf.js), and toggle 1m terrain contours. Client can drop geo-located feedback pins and send boundary-change requests.
- **Properties page** (`/properties`): Card grid of all properties. Click any card to open it in the map. Create or delete properties.
- **Role toggle**: Instantly switches between Designer (full draw tools) and Client (pin drop + text request) modes.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- **Mapbox GL requires WebGL**: The Replit preview iframe has no GPU. The app shows a friendly fallback message there. Use a real browser tab (via the external URL) for the full map experience.
- **Always run codegen after editing openapi.yaml**: `pnpm --filter @workspace/api-spec run codegen` — then restart the frontend workflow.
- **Rebuild libs before full typecheck**: `pnpm run typecheck:libs` rebuilds composite libs, then `pnpm run typecheck` checks everything. The root `typecheck` script does both in order.
- **Don't call `pnpm run dev` at workspace root** — it has no dev script by design. Start workflows individually via `restart_workflow`.
- **API runs behind Replit's proxy**: `app.ts` sets `trust proxy = 1` so `express-rate-limit` and `req.ip` read `X-Forwarded-For` correctly. Without it, rate-limited routes throw `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR`.
- **Public intake flow**: `/` (landing) and `/enquire` live OUTSIDE AuthGate. Public submissions create an unclaimed property (`ownerId` NULL, `status='enquiry'`) that appears in the shared studio inbox on `/properties`; opening one claims it. Public photo uploads only get public ACL if under the `/objects/uploads/<uuid>` prefix.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- DB push: `pnpm --filter @workspace/db run push`
