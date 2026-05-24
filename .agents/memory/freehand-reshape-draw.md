---
name: Freehand + reshape draw architecture
description: How freehand drawing and vertex-reshape editing are wired in MapPage.tsx
---

## Pattern

**`freehandMode`** is a single `useState(false)` boolean. Every draw useEffect checks it:
- `false` → enable the Leaflet.Draw polygon/polyline handler (click-to-place vertices)
- `true` → call `freehandDrawerRef.current.enablePolygon()` or `.enablePolyline()` (pointer-event drag)

## FreehandDrawer class
`artifacts/permaculture-app/src/lib/freehandDraw.ts` — uses `pointerdown/move/up` events, simplifies the result with `turf.simplify()`, returns the geometry via callback. Works with Apple Pencil, mouse, and touch.

## Reshape (vertex-drag edit) pattern
One dedicated `L.FeatureGroup` per shape type, initialised in the map init effect:
- `boundaryEditGroupRef` / `boundaryEditHandlerRef`
- `footprintEditGroupRef` / `footprintEditHandlerRef` + `footprintLayerToIdRef` (Map<leaflet_id, structureId>)
- `pathwayEditGroupRef` / `pathwayEditHandlerRef` + `pathwayLayerToIdRef` (Map<leaflet_id, {id, label, pathwayType}>)

Edit mode useEffect: load shapes into the group → `new L.EditToolbar.Edit(map, { featureGroup })` → `handler.enable()`.

EDITED event handler checks all three `layerToId` maps to route edits to the right state setter.

## Save patterns
- **Boundary**: EDITED handler calls `setPendingBoundary()`, existing `handleSaveBoundary()` covers the rest.
- **Footprints**: `setPendingFootprintEdits` → useEffect calls `updateStructure.mutate()` per edit.
- **Pathways**: `setPendingPathwayEdits` → useEffect calls `deletePathway` then `createPathway` (no PATCH endpoint for pathways).

**Why:** Leaflet.Draw's Edit toolbar requires a FeatureGroup to track editable layers; separating groups avoids cross-contamination between boundary, footprint, and pathway edit sessions.
