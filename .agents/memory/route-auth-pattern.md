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

**Why:** Skipping the check does not fail typecheck and the route still "works" in the auth-gated UI, so a missing check silently becomes a broken-access-control regression (anyone with an ID can read/write/generate). Storage/upload-URL routes are easy to miss because they don't obviously touch user data.

**How to apply:**
- Tables without an `ownerId` column (e.g. `plan_renders`) must be scoped indirectly: first verify the parent `property` is owned by `req.user.id`, then proceed.
- Private object serving: require auth, look up the owning row by object path, then verify the parent property's owner. 404 if no row, 403 if not owner.
- The api-server dev workflow rebuilds + serves a bundle, so it can serve stale code — restart it before curl-testing a route-auth change, or a fixed 401 can still read as 200.
