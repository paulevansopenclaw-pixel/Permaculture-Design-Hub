---
name: Plan-render staleness via content hash
description: Why concept renders detect staleness with a per-layer content hash, and the array-ordering trap.
---

# Plan-render staleness

Concept renders (AI restyles of design-layer plates) cache to `plan_renders`. To know when a cached render is out of date, each row stores a `sourceHash` of the layer's source data at generation time; the client recomputes the hash on display and shows a "stale" badge on mismatch.

**Why a content hash, not a timestamp:** the source tables (zones/sectors/structures/pathways/sensoryVectors/properties) only have `createdAt`, no `updatedAt`. There is no timestamp that moves when a row is edited, so a content hash is the only reliable change signal.

**How to apply:**
- The per-layer source mapping (which tables feed which layer) lives in `planSource.ts`. Keep it in sync with what each plate actually renders, or stale detection drifts from reality.
- List endpoints return records in **nondeterministic order**. The hash MUST be order-independent for record lists or you get false stale badges with no real change. `stableStringify` sorts arrays of objects-with-`id` by `id`; it deliberately leaves primitive/coordinate arrays in order (geometry order is meaningful).
