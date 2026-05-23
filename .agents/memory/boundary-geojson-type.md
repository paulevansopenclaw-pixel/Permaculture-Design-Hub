---
name: Property boundaryGeojson API type
description: The boundaryGeojson field on the property API response is typed as a generic object, not string
---

**Rule:** When using `property.boundaryGeojson` from the `useGetProperty` hook, always cast it: `property.boundaryGeojson as unknown as string`.

**Why:** The Orval-generated type for this field is `{ [key: string]: unknown }` (from the OpenAPI schema definition), not `string`, even though it is stored and returned as a JSON string at runtime. TypeScript will error if you pass it directly to any function expecting `string`.

**How to apply:**
- `const bg = property.boundaryGeojson as unknown as string`
- Then `JSON.parse(bg)` to get the GeoJSON
- Always check truthiness (`if (!bg)`) before using it
