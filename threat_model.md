# Threat Model

## Project Overview

PermaMap is a publicly deployed permaculture design studio with a React/Vite frontend and an Express/PostgreSQL backend. Designers manage property records, geospatial layers, AI-generated site analysis, and concept renders; prospective clients can submit public enquiries with uploaded inspiration images. Authentication uses Replit OIDC with server-side sessions stored in PostgreSQL.

## Assets

- **Designer accounts and sessions** — authenticated designer sessions can access all owned properties, claim public enquiries, run AI analysis, and view private renders.
- **Property design data** — property boundaries, zones, sectors, structures, pathways, swales, sensory vectors, client briefs, and AI reports represent both customer data and business IP.
- **Lead intake data** — public enquiry submissions contain names, email addresses, street addresses, freeform messages, coordinates, and uploaded idea photos.
- **Private render and upload objects** — concept renders and uploaded files are stored outside the web bundle and must only be exposed under the intended ACL.
- **Application secrets and third-party credentials** — database credentials, OIDC configuration, Pexels API key, and Google AI credentials must remain server-side.

## Trust Boundaries

- **Browser to API** — all frontend state, route parameters, and request bodies are untrusted. AuthGate in the SPA is not an authorization boundary.
- **Public to authenticated boundary** — `/`, `/enquire`, `/api/public/*`, share routes, and public-object routes are reachable without authentication; property management and design data must be protected server-side.
- **API to database** — the API has full access to property, enquiry, session, and user records. Route-level authorization failures directly expose or tamper with stored data.
- **API to object storage** — the backend issues upload URLs and serves objects from public and private namespaces; ACL metadata and route logic jointly decide access.
- **API to external services** — AI and image-search routes call Google AI, Pexels, and climate/terrain services; these integrations must not expose secrets or allow attackers to pivot into privileged backend actions.
- **Production vs dev-only boundary** — mockup sandbox, local scripts, generated dist output, and development-only tooling are out of scope unless production reachability is demonstrated.

## Scan Anchors

- Production entrypoints: `artifacts/api-server/src/app.ts`, `artifacts/api-server/src/routes/*.ts`, `artifacts/permaculture-app/src/App.tsx`.
- Highest-risk areas: `routes/public.ts`, property subresource routes under `routes/`, `routes/storage.ts`, `lib/objectStorage.ts`, `pages/MapPage.tsx`.
- Public surfaces: landing/enquiry pages, `/api/public/*`, `/api/config`, `/api/healthz`, share routes, `/api/storage/public-objects/*`.
- Authenticated surfaces: `/api/properties*`, AI analysis routes, concept renders, `/api/storage/objects/*` for private objects.
- Dev-only areas to usually ignore: `artifacts/mockup-sandbox/`, build scripts, generated `dist/` trees.

## Threat Categories

### Spoofing

The application relies on Replit OIDC plus a server-side `sid` session. Every protected API route must verify `req.isAuthenticated()` and must not rely on client-side role toggles or SPA route guards. Mobile token exchange must only mint sessions from valid OIDC authorization responses.

### Tampering

Design layers and briefs are mutable business data. The server must ensure that only the owning designer (or an explicitly authorized client capability, if implemented) can create, update, or delete property subresources. Public enquiry uploads must only be promoted to public-read under the narrow upload prefix intended for enquiry photos.

### Information Disclosure

Lead intake records, client briefs, AI reports, design layers, and private renders must not be accessible merely by knowing a property identifier or object path. API responses and object-serving routes must enforce ownership or explicit public visibility server-side, and error/log output must avoid leaking secrets or unnecessary internal details.

### Denial of Service

Public endpoints can trigger storage writes, third-party API calls, and downstream AI or image-search costs. Public routes must remain rate-limited and request sizes must stay bounded so anonymous users cannot cheaply exhaust compute, storage, or API quotas.

### Elevation of Privilege

The main risk in this application is broken function-level authorization: any route beneath `/api/properties/:propertyId/...` that omits authentication and ownership checks can bypass the intended designer/client separation. Stored content rendered into DOM popups must be treated as hostile, because an attacker who can persist markup or script can execute actions with the privileges of whichever authenticated user later opens the affected property.
