---
name: Public upload ACL scoping
description: Why public (no-auth) endpoints must scope object-ACL promotion to the uploads prefix.
---

Public, unauthenticated endpoints that accept client-supplied object paths and promote them to `visibility: "public"` must NOT promote arbitrary `/objects/...` paths. Doing so lets an anonymous caller flip the ACL of any private object (e.g. `plan-renders/...`) to public, which the public-read storage GET route then serves to anyone — an auth-bypass / data-leak.

**Rule:** only promote paths that match the prefix our own presigned-upload endpoint mints, i.e. `^/objects/uploads/<uuid>$`. Reject everything else.

**Why:** uploads are minted with unguessable random UUIDs under a dedicated `uploads/` prefix; other sensitive objects live under different prefixes (`plan-renders/`, etc.) and must stay private. Prefix + UUID scoping is the cheap, robust defense (no server-side token store needed).

**How to apply:** in any public ACL-promotion loop, gate each path with the strict uploads-UUID regex before calling `trySetObjectEntityAclPolicy`.
