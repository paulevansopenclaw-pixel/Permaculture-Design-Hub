// Deterministic content hashing for design-layer source data.
//
// Concept renders are AI restyles of a plate built from the property's design
// data. When that source data changes, the cached render becomes stale. We
// store a hash of each layer's source data with the render at generation time,
// then recompute it on display to detect staleness. Source tables only carry
// `createdAt` (not `updatedAt`), so a content hash is the reliable signal.

type Json = unknown;

function hasId(v: Json): v is Record<string, Json> & { id: string | number } {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (typeof (v as Record<string, Json>).id === "string" ||
      typeof (v as Record<string, Json>).id === "number")
  );
}

function stableStringify(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) {
    // Record lists (objects with an `id`) come back in nondeterministic order
    // from list endpoints — sort by id so the hash is order-independent. Leave
    // coordinate/primitive arrays in their original order (order is meaningful).
    const items =
      value.length > 0 && value.every(hasId)
        ? [...(value as Array<Record<string, Json>>)].sort((a, b) =>
            String(a.id).localeCompare(String(b.id)),
          )
        : value;
    return `[${items.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, Json>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

// FNV-1a 32-bit hash, returned as hex.
function fnv1a(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export interface PlanSourceContext {
  boundary?: unknown;
  zones?: unknown;
  sectors?: unknown;
  structures?: unknown;
  swales?: unknown;
  pathways?: unknown;
  sensoryVectors?: unknown;
  brief?: unknown;
}

// Maps each layer to the subset of source data it is rendered from.
function layerSourceData(layerKey: string, ctx: PlanSourceContext): Json {
  switch (layerKey) {
    case "boundary":
      return { boundary: ctx.boundary };
    case "water":
      return { boundary: ctx.boundary, swales: ctx.swales };
    case "zones":
      return { zones: ctx.zones };
    case "sectors":
      return { sectors: ctx.sectors, sensoryVectors: ctx.sensoryVectors };
    case "structures":
      return { structures: ctx.structures, pathways: ctx.pathways };
    case "soil":
      return { brief: ctx.brief };
    case "composite":
    default:
      return {
        boundary: ctx.boundary,
        swales: ctx.swales,
        zones: ctx.zones,
        sectors: ctx.sectors,
        sensoryVectors: ctx.sensoryVectors,
        structures: ctx.structures,
        pathways: ctx.pathways,
      };
  }
}

export function layerSourceHash(layerKey: string, ctx: PlanSourceContext): string {
  return fnv1a(stableStringify(layerSourceData(layerKey, ctx)));
}
