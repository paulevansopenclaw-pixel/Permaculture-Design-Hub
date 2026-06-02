---
name: express-rate-limit trust proxy
description: Why the API server must set trust proxy for express-rate-limit on Replit.
---

The Express API server runs behind Replit's reverse proxy, which sets `X-Forwarded-For`. With the default `trust proxy = false`, `express-rate-limit` throws `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on every rate-limited request and cannot identify clients (it would key all clients together).

**Rule:** any artifact using `express-rate-limit` (or relying on `req.ip`) must call `app.set("trust proxy", 1)` right after creating the Express app.

**Why:** Replit's proxy is exactly one hop, so trusting the first hop is correct and safe. Without it, rate limiting silently degrades and the logs fill with validation errors.

**How to apply:** set it once in `artifacts/api-server/src/app.ts` (or equivalent) before mounting routes/middleware.
