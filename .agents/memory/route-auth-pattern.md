---
name: Route auth & owner scoping pattern
description: How the api-server enforces auth and per-owner data access on routes; new routes must follow it.
---

# Route auth & owner scoping

`authMiddleware` (mounted app-wide in `app.ts`) only **populates** `req.user` / `req.isAuthenticated()`. It does NOT block any request on its own.

Therefore **every protected route handler must enforce auth itself**:

```ts
if (!req.isAuthenticated()) { res.status(401).json({ error: "Unauthorized" }); return; }
```

and scope all data access to the current owner via `ownerId`:

```ts
.where(and(eq(propertiesTable.id, id), eq(propertiesTable.ownerId, req.user.id)))
```

**Why:** Skipping the check does not fail typecheck and the route still "works" in the auth-gated UI, so a missing check silently becomes a broken-access-control regression (anyone with an ID can read/write/generate). Caught in review on the concept-render / plan-renders / storage routes.

**How to apply:**
- Tables without an `ownerId` column (e.g. `plan_renders`) must be scoped indirectly: first verify the parent `property` is owned by `req.user.id`, then proceed.
- `/storage/objects/*` private serving: require auth, look up the `plan_renders` row by `objectPath`, then verify the parent property's owner. 404 if no row, 403 if not owner.
- After editing routes, **restart the api-server workflow** before curl-testing — the dev server can serve stale code and mask the change (e.g. returning 200 instead of 401).
