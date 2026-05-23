---
name: Turf type imports
description: @turf/turf v7 does not re-export GeoJSON types like Feature, Polygon, MultiPolygon
---

**Rule:** Never use `turf.Feature`, `turf.Polygon`, `turf.MultiPolygon`, `turf.AllGeoJSON` as TypeScript types. They are not exported from `@turf/turf` v7.

**Why:** The turf v7 package re-exports geometry helpers (functions) but not the GeoJSON type aliases. Using `turf.Feature` etc. produces TS2724 "has no exported member".

**How to apply:**
- Use `GeoJSON.Feature`, `GeoJSON.Polygon`, `GeoJSON.MultiPolygon` from the global `GeoJSON` namespace (no import needed in TS strict mode).
- For `turf.centroid` argument type, cast the input: `geo as Parameters<typeof turf.centroid>[0]`.
- For `turf.simplify`, cast: `asFeature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>`.
