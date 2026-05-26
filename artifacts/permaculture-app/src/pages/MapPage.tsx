import { useEffect, useRef, useState, useCallback, type ReactNode } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
// @ts-ignore
import "leaflet-draw/dist/leaflet.draw.css";
// @ts-ignore
import "leaflet-draw";
import * as turf from "@turf/turf";
import SunCalc from "suncalc";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProperties,
  useGetProperty,
  useCreateProperty,
  useUpdateProperty,
  useListComments,
  useCreateComment,
  useDeleteComment,
  useListStructures,
  useCreateStructure,
  useUpdateStructure,
  useDeleteStructure,
  useListSectors,
  useCreateSector,
  useUpdateSector,
  useDeleteSector,
  getListPropertiesQueryKey,
  getGetPropertyQueryKey,
  getListCommentsQueryKey,
  getListStructuresQueryKey,
  getListSectorsQueryKey,
  useListDesignedSwales,
  useCreateDesignedSwale,
  useDeleteDesignedSwale,
  getListDesignedSwalesQueryKey,
  useListPathways,
  useCreatePathway,
  useDeletePathway,
  getListPathwaysQueryKey,
  useListZones,
  useBulkReplaceZones,
  useDeleteZone,
  getListZonesQueryKey,
  useListSensoryVectors,
  useCreateSensoryVector,
  useDeleteSensoryVector,
  getListSensoryVectorsQueryKey,
  useGetClientBrief,
  getGetClientBriefQueryKey,
  useRunWaterBudget,
  type WaterBudgetReport,
} from "@workspace/api-client-react";
import { useAppStore, type Role } from "@/store/useAppStore";
import { generateContours } from "@/lib/contourEngine";
import { analyzeWaterPaths, type WaterAnalysisResult, type AnalyzedSwale } from "@/lib/keylineEngine";
import { StepNav } from "@/components/StepNav";
import { FreehandDrawer } from "@/lib/freehandDraw";

async function fetchMapboxToken(): Promise<string> {
  try {
    const res = await fetch("/api/config");
    if (!res.ok) return "";
    const data = await res.json();
    return data.mapboxToken ?? "";
  } catch {
    return "";
  }
}

async function searchAddress(query: string, token: string) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${token}&types=address,place,locality,district,country&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.features ?? [];
}

async function fetchParcelBoundary(lat: number, lng: number): Promise<GeoJSON.Polygon[]> {
  // Primary: is_in finds polygons that actually contain the point (most accurate)
  // Fallback: small around radius in case is_in returns nothing
  const query = `[out:json][timeout:15];
(
  way(around:200,${lat},${lng})["landuse"];
  way(around:200,${lat},${lng})["boundary"="cadastral"];
  way(around:200,${lat},${lng})["boundary"="land_area"];
  way(around:200,${lat},${lng})["place"~"^(farm|allotments|isolated_dwelling|hamlet|village)$"];
);
(._;>;);
out body;`;
  try {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(query),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const nodeMap = new Map<number, [number, number]>();
    for (const el of data.elements) {
      if (el.type === "node") nodeMap.set(el.id, [el.lon, el.lat]);
    }
    const polygons: GeoJSON.Polygon[] = [];
    for (const el of data.elements) {
      if (el.type !== "way" || !el.nodes || el.nodes.length < 4) continue;
      const coords: [number, number][] = [];
      for (const nid of el.nodes) { const c = nodeMap.get(nid); if (c) coords.push(c); }
      if (coords.length < 4) continue;
      const f = coords[0], l = coords[coords.length - 1];
      if (f[0] !== l[0] || f[1] !== l[1]) coords.push([f[0], f[1]]);
      polygons.push({ type: "Polygon", coordinates: [coords] });
    }
    if (!polygons.length) return [];
    // Sort: polygons containing the point first, then by area ascending (smallest = most specific)
    const pt = turf.point([lng, lat]);
    const containing = polygons.filter(p => { try { return turf.booleanPointInPolygon(pt, turf.feature(p)); } catch { return false; } });
    const outside  = polygons.filter(p => !containing.includes(p));
    const sortByArea = (a: GeoJSON.Polygon, b: GeoJSON.Polygon) => { try { return turf.area(turf.feature(a)) - turf.area(turf.feature(b)); } catch { return 0; } };
    return [...containing.sort(sortByArea), ...outside.sort(sortByArea)];
  } catch { return []; }
}

function parseGeoJsonFile(text: string): GeoJSON.Polygon | null {
  try {
    const json = JSON.parse(text);
    // Accept Polygon, Feature<Polygon>, or FeatureCollection (first polygon feature)
    if (json.type === "Polygon") return json as GeoJSON.Polygon;
    if (json.type === "Feature" && json.geometry?.type === "Polygon") return json.geometry as GeoJSON.Polygon;
    if (json.type === "FeatureCollection") {
      const feat = (json.features as any[]).find(f => f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon");
      if (!feat) return null;
      if (feat.geometry.type === "Polygon") return feat.geometry as GeoJSON.Polygon;
      // MultiPolygon — take largest ring
      const polys: GeoJSON.Polygon[] = (feat.geometry.coordinates as [number, number][][]).map((ring) => ({ type: "Polygon" as const, coordinates: [ring] }));
      polys.sort((a, b) => { try { return turf.area(turf.feature(b)) - turf.area(turf.feature(a)); } catch { return 0; } });
      return polys[0] ?? null;
    }
    return null;
  } catch { return null; }
}

const SECTOR_TYPES = [
  { value: "custom_view",  label: "Custom View Corridor", emoji: "👁",  color: "rgba(255,215,0,0.3)",   border: "#d4a800" },
  { value: "noise",        label: "Nuisance/Road Noise",  emoji: "🔊",  color: "rgba(220,38,38,0.3)",   border: "#dc2626" },
  { value: "wind",         label: "Damaging Winds",       emoji: "💨",  color: "rgba(59,130,246,0.3)",  border: "#3b82f6" },
  { value: "winter_solar", label: "Winter Solar Arc",     emoji: "☀️",  color: "rgba(249,115,22,0.3)",  border: "#f97316" },
];

// (solar arc geometry is now computed inline via suncalc in the SVG overlay effect)

function sectorWedge(centerLng: number, centerLat: number, radiusKm: number, startAngle: number, endAngle: number) {
  try {
    const center = turf.point([centerLng, centerLat]);
    const sector = turf.sector(center, radiusKm, startAngle, endAngle, { units: "kilometers", steps: 64 });
    return sector;
  } catch {
    return null;
  }
}

const PATHWAY_TYPES = [
  { value: "driveway",   label: "Driveway",   color: "#8B6914" },
  { value: "footpath",   label: "Footpath",   color: "#C4975A" },
  { value: "farm_track", label: "Farm Track", color: "#6B4C2A" },
  { value: "fenceline",  label: "Fenceline",  color: "#6B7280" },
  { value: "firebreak",  label: "Firebreak",  color: "#DC2626" },
];

// ─── ZONE ANALYSIS CONSTANTS ──────────────────────────────────────────────────
const ZONE_STYLES = [
  { zone: 1, label: "Zone 1 — Daily Use",         drawLabel: "Draw Zone 1 (Daily)",            color: "#CA8A04", fillColor: "#FDE68A", fillOpacity: 0.35, hint: "Kitchen garden, herbs — most visited" },
  { zone: 2, label: "Zone 2 — Semi-Daily",         drawLabel: "Draw Zone 2 (Semi-Daily)",        color: "#16A34A", fillColor: "#86EFAC", fillOpacity: 0.35, hint: "Orchard, small livestock, compost" },
  { zone: 3, label: "Zone 3 — Farm / Pasture",     drawLabel: "Draw Zone 3 (Pasture/Crops)",     color: "#15803D", fillColor: "#4ADE80", fillOpacity: 0.30, hint: "Crops, larger livestock, fuel plants" },
  { zone: 4, label: "Zone 4 — Semi-Wild / Timber", drawLabel: "Draw Zone 4 (Woodlot/Semi-Wild)", color: "#92400E", fillColor: "#D4A27A", fillOpacity: 0.30, hint: "Timber, foraging, managed forest" },
  { zone: 5, label: "Zone 5 — Wilderness",         drawLabel: "Draw Zone 5 (Wild Nature)",       color: "#475569", fillColor: "#94A3B8", fillOpacity: 0.30, hint: "No intervention — wildlife sanctuary" },
];

// Structure types that are high-maintenance and trigger a zone audit warning in Zone 4+
const HIGH_MAINTENANCE_TYPES = new Set([
  "greenhouse", "vegetable_garden", "herb_garden", "orchard", "nursery",
]);

const STRUCTURE_TYPES = [
  { value: "house",      label: "House",       emoji: "🏠" },
  { value: "shed",       label: "Shed",        emoji: "🏚" },
  { value: "barn",       label: "Barn",        emoji: "🏘" },
  { value: "greenhouse", label: "Greenhouse",  emoji: "🌱" },
  { value: "tank",       label: "Water Tank",  emoji: "💧" },
  { value: "dam",        label: "Dam",         emoji: "🌊" },
  { value: "fence",      label: "Fence",       emoji: "🔲" },
  { value: "garage",     label: "Garage",      emoji: "🚗" },
  { value: "other",      label: "Other",       emoji: "📍" },
];

function structureIcon(type: string, label: string, mode: "icon+label" | "icon-only" | "text-inside" | "dot" = "icon+label") {
  const entry = STRUCTURE_TYPES.find((t) => t.value === type) ?? STRUCTURE_TYPES[STRUCTURE_TYPES.length - 1];
  const maxLabel = label.length > 12 ? label.slice(0, 12) + "…" : label;

  if (mode === "dot") {
    return L.divIcon({
      className: "",
      html: `<div style="
        width:10px;height:10px;border-radius:50%;
        background:#1e3a5f;border:2px solid #fff;
        box-shadow:0 1px 4px rgba(0,0,0,0.6);
        pointer-events:none;
      "></div>`,
      iconSize: [10, 10],
      iconAnchor: [5, 5],
      popupAnchor: [0, -8],
    });
  }

  if (mode === "text-inside") {
    // Wider box with label text centred inside, no emoji
    const short = label.length > 10 ? label.slice(0, 10) + "…" : label;
    return L.divIcon({
      className: "",
      html: `<div style="
        min-width:52px;max-width:80px;height:26px;border-radius:5px;
        background:#1e3a5f;border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.55);
        display:flex;align-items:center;justify-content:center;
        padding:0 6px;pointer-events:none;
        font-size:9px;font-weight:700;color:#fff;
        white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        letter-spacing:0.02em;
      ">${short}</div>`,
      iconSize: [72, 26],
      iconAnchor: [36, 13],
      popupAnchor: [0, -16],
    });
  }

  if (mode === "icon-only") {
    return L.divIcon({
      className: "",
      html: `<div style="
        width:34px;height:34px;border-radius:6px;
        background:#1e3a5f;border:2px solid #fff;
        box-shadow:0 2px 6px rgba(0,0,0,0.55);
        display:flex;align-items:center;justify-content:center;
        font-size:18px;line-height:1;pointer-events:none;
      ">${entry.emoji}</div>`,
      iconSize: [34, 34],
      iconAnchor: [17, 17],
      popupAnchor: [0, -20],
    });
  }

  // Default: icon + label below
  return L.divIcon({
    className: "",
    html: `
      <div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;">
        <div style="
          width:34px;height:34px;border-radius:6px;
          background:#1e3a5f;border:2px solid #fff;
          box-shadow:0 2px 6px rgba(0,0,0,0.55);
          display:flex;align-items:center;justify-content:center;
          font-size:18px;line-height:1;
        ">${entry.emoji}</div>
        <div style="
          background:rgba(0,0,0,0.75);color:#fff;
          font-size:10px;font-weight:600;
          padding:1px 5px;border-radius:3px;
          white-space:nowrap;max-width:90px;
          overflow:hidden;text-overflow:ellipsis;
          box-shadow:0 1px 3px rgba(0,0,0,0.4);
        ">${maxLabel}</div>
      </div>`,
    iconSize: [34, 52],
    iconAnchor: [17, 34],
    popupAnchor: [0, -36],
  });
}

function pinIcon(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="width:22px;height:22px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${color};border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
  });
}

function pendingPinIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="width:18px;height:18px;border-radius:50%;background:#d97706;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.45);"></div>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const { role, setRole, activePropertyId, setActivePropertyId, pendingMapElement, setPendingMapElement } = useAppStore();
  const queryClient = useQueryClient();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const gl3DContainerRef = useRef<HTMLDivElement>(null);
  const gl3DMapRef = useRef<mapboxgl.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const contourLayerRef = useRef<L.GeoJSON | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawPolygonHandlerRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const pendingPinMarkerRef = useRef<L.Marker | null>(null);
  const structureMarkersRef = useRef<L.Marker[]>([]);
  const pendingStructureMarkerRef = useRef<L.Marker | null>(null);
  const sectorSVGDivRef = useRef<HTMLDivElement | null>(null);
  const sectorPreviewLayerRef = useRef<L.GeoJSON | null>(null);
  const sectorCenterMarkerRef = useRef<L.Marker | null>(null);
  const sectorArmStartRef = useRef<L.Marker | null>(null);
  const sectorArmEndRef = useRef<L.Marker | null>(null);
  const isDraggingArmRef = useRef(false);
  // (solarArcLayersRef removed — solar arcs now rendered via SVG overlay)
  const contourDataRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const damMarkerRef = useRef<L.Marker | null>(null);
  const longestSwaleLayersRef = useRef<L.GeoJSON[]>([]);
  const highestSwaleLayerRef = useRef<L.GeoJSON | null>(null);
  const savedSwaleLayersRef = useRef<L.GeoJSON[]>([]);
  const buildingPolygonHandlerRef = useRef<any>(null);
  const buildingDrawActiveRef = useRef(false);
  const buildingOutlineLayersRef = useRef<L.GeoJSON[]>([]);
  const pendingFootprintPreviewRef = useRef<L.GeoJSON | null>(null);
  const pathwayPolylineHandlerRef = useRef<any>(null);
  const pathwayDrawActiveRef = useRef(false);
  const pathwayLayersRef = useRef<L.GeoJSON[]>([]);
  const pendingPathwayPreviewRef = useRef<L.GeoJSON | null>(null);
  const zoneLayersRef = useRef<L.GeoJSON[]>([]);
  const zonePolygonHandlersRef = useRef<Record<number, any>>({});
  const zoneDrawActiveRef = useRef<number | null>(null);
  const zonesEditGroupRef = useRef<L.FeatureGroup | null>(null);
  const zoneEditHandlerRef = useRef<any>(null);
  const zoneLayerToIdRef = useRef<Map<number, { id: string; zoneNumber: number }>>(new Map());
  const overpassLayerRef = useRef<L.GeoJSON | null>(null);
  const sensoryVectorLayersRef = useRef<(L.Marker | L.Polyline)[]>([]);
  const pendingSensoryLinePreviewRef = useRef<L.Polyline | null>(null);
  const sensoryLineHandlerRef = useRef<any>(null);
  const sensoryLineDrawActiveRef = useRef(false);
  const freehandDrawerRef = useRef<FreehandDrawer | null>(null);
  const boundaryEditGroupRef = useRef<L.FeatureGroup | null>(null);
  const boundaryEditHandlerRef = useRef<any>(null);
  const footprintEditGroupRef = useRef<L.FeatureGroup | null>(null);
  const footprintEditHandlerRef = useRef<any>(null);
  const footprintLayerToIdRef = useRef<Map<number, string>>(new Map());
  const pathwayEditGroupRef = useRef<L.FeatureGroup | null>(null);
  const pathwayEditHandlerRef = useRef<any>(null);
  const pathwayLayerToIdRef = useRef<Map<number, { id: string; label: string; pathwayType: string }>>(new Map());

  const [mapboxToken, setMapboxToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  const [showSatellite, setShowSatellite] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showContours, setShowContours] = useState(false);
  const [showPathways, setShowPathways] = useState(true);
  const [drawPathwayMode, setDrawPathwayMode] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [zoneAuditWarning, setZoneAuditWarning] = useState<string | null>(null);
  const [activeZoneDraw, setActiveZoneDraw] = useState<number | null>(null);
  const [editZoneMode, setEditZoneMode] = useState(false);
  const [pendingZoneGeom, setPendingZoneGeom] = useState<{ zoneNumber: number; geojson: string } | null>(null);
  const [pendingZoneEdits, setPendingZoneEdits] = useState<Array<{ id: string; zoneNumber: number; geojson: string }> | null>(null);
  const [pendingPathway, setPendingPathway] = useState<GeoJSON.LineString | null>(null);
  const [pathwayLabel, setPathwayLabel] = useState("");
  const [pathwayType, setPathwayType] = useState("footpath");
  const [showStructures, setShowStructures] = useState(true);
  const [structureLabelMode, setStructureLabelMode] = useState<"icon+label" | "icon-only" | "text-inside" | "dot">("icon+label");
  const [dropStructureMode, setDropStructureMode] = useState(false);
  const [drawBuildingOutlineMode, setDrawBuildingOutlineMode] = useState(false);
  const [pendingStructure, setPendingStructure] = useState<{ lng: number; lat: number } | null>(null);
  const [pendingFootprint, setPendingFootprint] = useState<GeoJSON.Polygon | null>(null);
  const [structureLabel, setStructureLabel] = useState("");
  const [structureType, setStructureType] = useState("house");
  const [structureVolumeLiters, setStructureVolumeLiters] = useState("");
  const [structureAttachedBuilding, setStructureAttachedBuilding] = useState("");
  const [showSectors, setShowSectors] = useState(true);
  const [showSolarArcs, setShowSolarArcs] = useState(true);
  const [dropSectorCenterMode, setDropSectorCenterMode] = useState(false);
  const [sectorCenter, setSectorCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [sectorDraft, setSectorDraft] = useState({ sectorType: "custom_view", radiusKm: 0.5, startAngle: 0, endAngle: 90, label: "" });
  const sectorDraftRef = useRef(sectorDraft);
  sectorDraftRef.current = sectorDraft;
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [show3D, setShow3D] = useState(false);
  // ─── SIDEBAR RESPONSIVE (iPad / mobile) ──────────────────────────────────
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < 1024);
  const [sidebarOpen, setSidebarOpen] = useState(() => typeof window !== "undefined" && window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const handler = (e: MediaQueryListEvent) => {
      setIsNarrow(!e.matches);
      if (e.matches) setSidebarOpen(true);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  const sidebarIsOverlay = isNarrow;
  const modalLeft = sidebarOpen && !sidebarIsOverlay ? "18rem" : "0";

  const [showSensoryVectors, setShowSensoryVectors] = useState(true);
  const [dropSensoryPointMode, setDropSensoryPointMode] = useState(false);
  const [drawSensoryLineMode, setDrawSensoryLineMode] = useState(false);
  const [pendingSensoryPoint, setPendingSensoryPoint] = useState<{ lng: number; lat: number } | null>(null);
  const [pendingSensoryLine, setPendingSensoryLine] = useState<GeoJSON.LineString | null>(null);
  const [sensoryVectorType, setSensoryVectorType] = useState<"road_noise" | "view_corridor" | "privacy_threat">("road_noise");
  const [sensoryVectorLabel, setSensoryVectorLabel] = useState("");
  const [showWater, setShowWater] = useState(true);
  const [waterAnalysis, setWaterAnalysis] = useState<WaterAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [minUphillAcres, setMinUphillAcres] = useState(0.5);
  const [waterHighlightsActive, setWaterHighlightsActive] = useState(false);
  const [isGeneratingContours, setIsGeneratingContours] = useState(false);
  const [dropPinMode, setDropPinMode] = useState(false);
  const [pendingPin, setPendingPin] = useState<{ lng: number; lat: number } | null>(null);
  const [pinText, setPinText] = useState("");
  const [pendingBoundary, setPendingBoundary] = useState<GeoJSON.Polygon | null>(null);
  const [pendingAreaHa, setPendingAreaHa] = useState<number | null>(null);
  const [pendingAreaAc, setPendingAreaAc] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showNewPropForm, setShowNewPropForm] = useState(false);
  const [newPropName, setNewPropName] = useState("");
  const [overpassCandidates, setOverpassCandidates] = useState<GeoJSON.Polygon[]>([]);
  const [overpassSelectedIdx, setOverpassSelectedIdx] = useState(0);
  const [isFetchingParcel, setIsFetchingParcel] = useState(false);
  const [geoImportError, setGeoImportError] = useState<string | null>(null);
  const [isBoundaryDrawing, setIsBoundaryDrawing] = useState(false);
  const [showKeylineModal, setShowKeylineModal] = useState(false);
  const [waterBudget, setWaterBudget] = useState<WaterBudgetReport | null>(null);
  const [isRunningWaterBudget, setIsRunningWaterBudget] = useState(false);
  const [waterBudgetError, setWaterBudgetError] = useState<string | null>(null);
  const [freehandMode, setFreehandMode] = useState(false);
  const [editBoundaryMode, setEditBoundaryMode] = useState(false);
  const [editFootprintMode, setEditFootprintMode] = useState(false);
  const [editPathwayMode, setEditPathwayMode] = useState(false);
  const [pendingFootprintEdits, setPendingFootprintEdits] = useState<Array<{ id: string; geojson: string }> | null>(null);
  const [pendingPathwayEdits, setPendingPathwayEdits] = useState<Array<{ id: string; label: string; pathwayType: string; geojson: string }> | null>(null);

  // ─── DUAL-MODE ────────────────────────────────────────────────────────────
  const [inputMode, setInputMode] = useState<"native" | "upload">("native");
  const [uploadedMaps, setUploadedMaps] = useState<{
    sector: string | null;
    water: string | null;
    zone: string | null;
    crossSection: string | null;
  }>({ sector: null, water: null, zone: null, crossSection: null });

  const overpassPreview = overpassCandidates[overpassSelectedIdx] ?? null;

  const { data: properties = [] } = useListProperties();
  const { data: activeProperty, refetch: refetchProperty } = useGetProperty(
    activePropertyId ?? "",
    { query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") } },
  );
  const { data: comments = [] } = useListComments(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListCommentsQueryKey(activePropertyId ?? ""),
      refetchInterval: 10_000,
    },
  });
  const { data: structures = [] } = useListStructures(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListStructuresQueryKey(activePropertyId ?? ""),
      refetchInterval: 15_000,
    },
  });
  const { data: clientBrief } = useGetClientBrief(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetClientBriefQueryKey(activePropertyId ?? "") },
  });

  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const createStructure = useCreateStructure();
  const updateStructure = useUpdateStructure();
  const deleteStructure = useDeleteStructure();

  const { data: sectors = [] } = useListSectors(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListSectorsQueryKey(activePropertyId ?? ""),
      refetchInterval: 15_000,
    },
  });
  const createSector = useCreateSector();
  const updateSector = useUpdateSector();
  const deleteSector = useDeleteSector();

  const { data: designedSwales = [] } = useListDesignedSwales(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListDesignedSwalesQueryKey(activePropertyId ?? ""),
      refetchInterval: 30_000,
    },
  });
  const createDesignedSwale = useCreateDesignedSwale();
  const deleteDesignedSwale = useDeleteDesignedSwale();

  const { data: pathways = [] } = useListPathways(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListPathwaysQueryKey(activePropertyId ?? ""),
      refetchInterval: 30_000,
    },
  });
  const createPathway = useCreatePathway();
  const deletePathway = useDeletePathway();

  const { data: zones = [] } = useListZones(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListZonesQueryKey(activePropertyId ?? ""),
      refetchInterval: 30_000,
    },
  });
  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const structuresRef = useRef(structures);
  structuresRef.current = structures;
  const pathwaysRef = useRef(pathways);
  pathwaysRef.current = pathways;
  const sectorsRef = useRef(sectors);
  sectorsRef.current = sectors;
  const activePropertyRef = useRef(activeProperty);
  activePropertyRef.current = activeProperty;
  const bulkReplaceZones = useBulkReplaceZones();
  const deleteZone = useDeleteZone();

  const { data: sensoryVectors = [] } = useListSensoryVectors(activePropertyId ?? "", {
    query: {
      enabled: !!activePropertyId,
      queryKey: getListSensoryVectorsQueryKey(activePropertyId ?? ""),
      refetchInterval: 30_000,
    },
  });
  const createSensoryVector = useCreateSensoryVector();
  const deleteSensoryVector = useDeleteSensoryVector();
  const runWaterBudgetMutation = useRunWaterBudget();

  // ─── FETCH TOKEN ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMapboxToken().then(setMapboxToken);
  }, []);

  // ─── MAP INITIALIZATION ───────────────────────────────────────────────────
  // Runs once on mount regardless of token — OSM tiles load immediately,
  // Mapbox satellite upgrades in a separate effect once the token arrives.
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-33, 147],
      zoom: 4,
      zoomControl: false,
    });

    // OSM fallback — always available without a token
    const tileLayer = L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      { maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org">OpenStreetMap</a> contributors' }
    ).addTo(map);
    tileLayerRef.current = tileLayer;

    L.control.zoom({ position: "bottomright" }).addTo(map);
    L.control.scale({ metric: true, imperial: false, position: "bottomleft" }).addTo(map);

    // Feature group for drawn polygons
    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    // Polygon draw handler — activated programmatically by sidebar button
    const PolygonHandler = (L as any).Draw.Polygon;
    const polygonHandler = new PolygonHandler(map, {
      shapeOptions: { color: "#4ade80", weight: 2.5, opacity: 1, fillColor: "#4ade80", fillOpacity: 0.30, dashArray: undefined },
      allowIntersection: false,
    });
    drawPolygonHandlerRef.current = polygonHandler;

    // Building outline polygon handler — black stroke, light fill
    const buildingPolygonHandler = new PolygonHandler(map, {
      shapeOptions: { color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 },
      allowIntersection: false,
    });
    buildingPolygonHandlerRef.current = buildingPolygonHandler;

    // Zone drawing handlers — one per zone, each with its own colour
    const zoneHandlers: Record<number, any> = {};
    ZONE_STYLES.forEach((s) => {
      zoneHandlers[s.zone] = new PolygonHandler(map, {
        shapeOptions: { color: s.color, weight: 2, opacity: 0.85, fillColor: s.fillColor, fillOpacity: s.fillOpacity },
        allowIntersection: false,
      });
    });
    zonePolygonHandlersRef.current = zoneHandlers;

    // Feature group for zone vertex-editing
    const zonesEditGroup = new L.FeatureGroup();
    map.addLayer(zonesEditGroup);
    zonesEditGroupRef.current = zonesEditGroup;

    // Feature groups for boundary / footprint / pathway vertex-editing
    const boundaryEditGroup = new L.FeatureGroup();
    map.addLayer(boundaryEditGroup);
    boundaryEditGroupRef.current = boundaryEditGroup;

    const footprintEditGroup = new L.FeatureGroup();
    map.addLayer(footprintEditGroup);
    footprintEditGroupRef.current = footprintEditGroup;

    const pathwayEditGroup = new L.FeatureGroup();
    map.addLayer(pathwayEditGroup);
    pathwayEditGroupRef.current = pathwayEditGroup;

    // Freehand drawer — pointer-event based, works with Apple Pencil
    freehandDrawerRef.current = new FreehandDrawer(map);

    // Pathway polyline handler
    const PolylineHandler = (L as any).Draw.Polyline;
    const pathwayPolylineHandler = new PolylineHandler(map, {
      shapeOptions: { color: "#8B6914", weight: 3, opacity: 0.9 },
      allowIntersection: true,
    });
    pathwayPolylineHandlerRef.current = pathwayPolylineHandler;

    // Sensory vector line handler — dashed red-orange stroke
    const sensoryLineHandler = new PolylineHandler(map, {
      shapeOptions: { color: "#ef4444", weight: 2.5, opacity: 0.9, dashArray: "8 5" },
      allowIntersection: true,
    });
    sensoryLineHandlerRef.current = sensoryLineHandler;

    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      const layer = e.layer as L.Polygon | L.Polyline;
      const feature = layer.toGeoJSON();

      if (buildingDrawActiveRef.current) {
        buildingDrawActiveRef.current = false;
        const geometry = feature.geometry as GeoJSON.Polygon;
        const centroid = turf.centroid(feature);
        const [lng, lat] = centroid.geometry.coordinates;
        setPendingFootprint(geometry);
        setPendingStructure({ lng, lat });
        const previewLayer = L.geoJSON(feature as any, {
          style: () => ({ color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 }),
        }).addTo(map);
        pendingFootprintPreviewRef.current = previewLayer;
      } else if (zoneDrawActiveRef.current !== null) {
        const zoneNumber = zoneDrawActiveRef.current;
        zoneDrawActiveRef.current = null;
        setActiveZoneDraw(null);
        setPendingZoneGeom({ zoneNumber, geojson: JSON.stringify(feature.geometry as GeoJSON.Polygon) });
      } else if (pathwayDrawActiveRef.current) {
        pathwayDrawActiveRef.current = false;
        const geometry = feature.geometry as GeoJSON.LineString;
        setPendingPathway(geometry);
        setDrawPathwayMode(false);
      } else if (sensoryLineDrawActiveRef.current) {
        sensoryLineDrawActiveRef.current = false;
        const geometry = feature.geometry as GeoJSON.LineString;
        setPendingSensoryLine(geometry);
        setDrawSensoryLineMode(false);
      } else {
        drawnItems.clearLayers();
        drawnItems.addLayer(layer as L.Polygon);
        const geometry = feature.geometry as GeoJSON.Polygon;
        setPendingBoundary(geometry);
        const ha = turf.area(feature) / 10000;
        setPendingAreaHa(ha);
        setPendingAreaAc(ha * 2.47105);
        setIsBoundaryDrawing(false);
      }
    });

    map.on((L as any).Draw.Event.EDITED, (e: any) => {
      const zoneUpdates: Array<{ id: string; zoneNumber: number; geojson: string }> = [];
      const footprintUpdates: Array<{ id: string; geojson: string }> = [];
      const pathwayUpdates: Array<{ id: string; label: string; pathwayType: string; geojson: string }> = [];

      e.layers.eachLayer((layer: any) => {
        const lid = layer._leaflet_id as number;
        const geomJson = JSON.stringify(layer.toGeoJSON().geometry);

        const zoneData = zoneLayerToIdRef.current.get(lid);
        if (zoneData) zoneUpdates.push({ id: zoneData.id, zoneNumber: zoneData.zoneNumber, geojson: geomJson });

        const structId = footprintLayerToIdRef.current.get(lid);
        if (structId) footprintUpdates.push({ id: structId, geojson: geomJson });

        const pathwayData = pathwayLayerToIdRef.current.get(lid);
        if (pathwayData) pathwayUpdates.push({ id: pathwayData.id, label: pathwayData.label, pathwayType: pathwayData.pathwayType, geojson: geomJson });

        if (boundaryEditGroupRef.current?.hasLayer(layer)) {
          const geom = layer.toGeoJSON().geometry as GeoJSON.Polygon;
          const ha = turf.area({ type: "Feature", geometry: geom, properties: {} }) / 10000;
          setPendingBoundary(geom);
          setPendingAreaHa(ha);
          setPendingAreaAc(ha * 2.47105);
          setEditBoundaryMode(false);
        }
      });

      if (zoneUpdates.length > 0) setPendingZoneEdits(zoneUpdates);
      if (footprintUpdates.length > 0) setPendingFootprintEdits(footprintUpdates);
      if (pathwayUpdates.length > 0) setPendingPathwayEdits(pathwayUpdates);
    });

    mapRef.current = map;
    setMapLoaded(true);

    return () => {
      freehandDrawerRef.current?.disable();
      freehandDrawerRef.current = null;
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      drawPolygonHandlerRef.current = null;
      setMapLoaded(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── ROLE CHANGE — disable draw in client mode ─────────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    if (role !== "designer") drawPolygonHandlerRef.current?.disable();
  }, [role, mapLoaded]);

  // ─── MAPBOX SATELLITE TILE UPGRADE ───────────────────────────────────────
  // Runs once when the Mapbox token arrives — swaps OSM fallback for satellite
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapboxToken || !mapLoaded) return;
    const prev = tileLayerRef.current;
    const newTile = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      { tileSize: 512, zoomOffset: -1, maxZoom: 20, attribution: '© <a href="https://www.mapbox.com">Mapbox</a> © <a href="https://www.openstreetmap.org">OpenStreetMap</a>' }
    );
    if (prev) map.removeLayer(prev);
    if (showSatellite) newTile.addTo(map);
    tileLayerRef.current = newTile;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapboxToken, mapLoaded]);

  // ─── SATELLITE VISIBILITY ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const tile = tileLayerRef.current;
    if (!map || !tile || !mapLoaded) return;
    if (showSatellite) {
      if (!map.hasLayer(tile)) map.addLayer(tile);
    } else {
      if (map.hasLayer(tile)) map.removeLayer(tile);
    }
  }, [showSatellite, mapLoaded]);

  // ─── OVERPASS PARCEL PREVIEW LAYER ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (overpassLayerRef.current) { map.removeLayer(overpassLayerRef.current); overpassLayerRef.current = null; }
    if (!overpassPreview || !mapLoaded) return;
    const layer = L.geoJSON(overpassPreview as any, {
      style: { color: "#3b82f6", weight: 2.5, opacity: 1, fillColor: "#3b82f6", fillOpacity: 0.08, dashArray: "8 5" },
    }).addTo(map);
    overpassLayerRef.current = layer;
    try { map.fitBounds(layer.getBounds(), { padding: [40, 40] }); } catch { /* no-op */ }
  }, [overpassPreview, mapLoaded]);

  // ─── BOUNDARY VISIBILITY ──────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const layer = boundaryLayerRef.current;
    if (!map || !layer || !mapLoaded) return;
    if (showBoundary) {
      if (!map.hasLayer(layer)) map.addLayer(layer);
    } else {
      if (map.hasLayer(layer)) map.removeLayer(layer);
    }
  }, [showBoundary, mapLoaded]);

  // ─── BOUNDARY LAYER ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (boundaryLayerRef.current) {
      map.removeLayer(boundaryLayerRef.current);
      boundaryLayerRef.current = null;
    }

    const geojson = activeProperty?.boundaryGeojson;
    if (geojson) {
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geojson as unknown as GeoJSON.Geometry, properties: {} }],
      };
      const layer = L.geoJSON(fc as any, {
        style: () => ({ color: "#2D6A1A", weight: 2, opacity: 0.9, fillColor: "#2D6A1A", fillOpacity: 0.12 }),
      }).addTo(map);
      try {
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [80, 80] });
      } catch { /* invalid geometry */ }
      boundaryLayerRef.current = layer;
    }
  }, [activeProperty, mapLoaded]);

  // ─── CONTOUR GENERATION ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (contourLayerRef.current) {
      map.removeLayer(contourLayerRef.current);
      contourLayerRef.current = null;
    }

    if (!showContours || !activeProperty?.boundaryGeojson || !mapboxToken) return;

    setIsGeneratingContours(true);
    generateContours(
      { type: "Feature", geometry: activeProperty.boundaryGeojson as unknown as GeoJSON.Geometry, properties: {} },
      mapboxToken,
    )
      .then((fc) => {
        const m = mapRef.current;
        if (!m) return;
        contourDataRef.current = fc;
        const layer = L.geoJSON(fc as any, {
          style: () => ({ color: "#ef4444", weight: 2, opacity: 0.9, fill: false }),
        }).addTo(m);
        contourLayerRef.current = layer;
        // Auto-run keyline analysis as soon as contours are ready
        const boundary = activePropertyRef.current?.boundaryGeojson;
        if (boundary) {
          try {
            const boundaryFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
              type: "Feature",
              geometry: boundary as unknown as GeoJSON.Polygon,
              properties: {},
            };
            const result = analyzeWaterPaths(fc, boundaryFeature, 0.5);
            setWaterAnalysis(result);
          } catch (err) {
            console.error("Auto keyline analysis failed:", err);
          }
        }
      })
      .catch(console.error)
      .finally(() => setIsGeneratingContours(false));
  }, [showContours, activeProperty?.id, activeProperty?.boundaryGeojson, mapLoaded, mapboxToken]);

  // ─── 3D TERRAIN OVERLAY ───────────────────────────────────────────────────
  useEffect(() => {
    if (!show3D || !mapboxToken) {
      if (gl3DMapRef.current) { gl3DMapRef.current.remove(); gl3DMapRef.current = null; }
      return;
    }
    const container = gl3DContainerRef.current;
    if (!container) return;

    // Sync starting view from Leaflet
    const leaf = mapRef.current;
    const lc = leaf ? leaf.getCenter() : { lat: -33, lng: 147 };
    const lz = leaf ? leaf.getZoom() : 4;

    mapboxgl.accessToken = mapboxToken;
    const glMap = new mapboxgl.Map({
      container,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [lc.lng, lc.lat],
      zoom: lz,
      pitch: 0,
      bearing: 0,
      antialias: true,
    });
    gl3DMapRef.current = glMap;

    glMap.addControl(new mapboxgl.NavigationControl({ showCompass: true }), "bottom-right");

    glMap.on("load", () => {
      // ── DEM terrain ──
      glMap.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14,
      });
      glMap.setTerrain({ source: "mapbox-dem", exaggeration: 1.5 });

      // ── Property boundary ──
      const boundaryRaw = activePropertyRef.current?.boundaryGeojson;
      const boundaryStr = typeof boundaryRaw === "string" ? boundaryRaw : (boundaryRaw ? JSON.stringify(boundaryRaw) : null);
      if (boundaryStr) {
        try {
          const geo = JSON.parse(boundaryStr) as GeoJSON.Geometry;
          glMap.addSource("gl-boundary", { type: "geojson", data: { type: "Feature", geometry: geo, properties: {} } });
          glMap.addLayer({ id: "gl-boundary-fill", type: "fill", source: "gl-boundary", paint: { "fill-color": "#2D6A1A", "fill-opacity": 0.15 } });
          glMap.addLayer({ id: "gl-boundary-line", type: "line", source: "gl-boundary", paint: { "line-color": "#4a9a28", "line-width": 2.5 } });
        } catch { /* ignore */ }
      }

      // ── 1m contour lines ──
      const contourData = contourDataRef.current;
      if (contourData) {
        glMap.addSource("gl-contours", { type: "geojson", data: contourData });
        glMap.addLayer({
          id: "gl-contour-lines",
          type: "line",
          source: "gl-contours",
          paint: {
            "line-color": [
              "case",
              ["==", ["%", ["to-number", ["coalesce", ["get", "ele"], 0]], 5], 0], "#ef4444",
              "#ff666688",
            ],
            "line-width": ["case", ["==", ["%", ["to-number", ["coalesce", ["get", "ele"], 0]], 5], 0], 1.8, 0.8],
            "line-opacity": 0.85,
          },
        });
      }

      // ── Zone polygons ──
      const zoneFeatures: GeoJSON.Feature[] = [];
      zonesRef.current.forEach((z) => {
        try {
          const geo = JSON.parse(z.zoneGeojson);
          zoneFeatures.push({ type: "Feature", geometry: geo, properties: { zoneNumber: z.zoneNumber } });
        } catch { /* ignore */ }
      });
      if (zoneFeatures.length > 0) {
        glMap.addSource("gl-zones", { type: "geojson", data: { type: "FeatureCollection", features: zoneFeatures } });
        glMap.addLayer({
          id: "gl-zones-fill", type: "fill", source: "gl-zones",
          paint: {
            "fill-color": ["match", ["get", "zoneNumber"], 1, "#FDE68A", 2, "#86EFAC", 3, "#4ADE80", 4, "#D4A27A", 5, "#94A3B8", "#ffffff"],
            "fill-opacity": 0.30,
          },
        });
        glMap.addLayer({
          id: "gl-zones-line", type: "line", source: "gl-zones",
          paint: {
            "line-color": ["match", ["get", "zoneNumber"], 1, "#CA8A04", 2, "#16A34A", 3, "#15803D", 4, "#92400E", 5, "#475569", "#888888"],
            "line-width": 2, "line-opacity": 0.85,
          },
        });
      }

      // ── Sector wedges ──
      const sectorFeatures: GeoJSON.Feature[] = [];
      sectorsRef.current.forEach((s) => {
        try {
          const center = turf.point([s.centerLng, s.centerLat]);
          const wedge = turf.sector(center, s.radiusKm, s.startAngle, s.endAngle, { units: "kilometers", steps: 64 });
          wedge.properties = { label: s.label || s.sectorType };
          sectorFeatures.push(wedge);
        } catch { /* ignore */ }
      });
      if (sectorFeatures.length > 0) {
        glMap.addSource("gl-sectors", { type: "geojson", data: { type: "FeatureCollection", features: sectorFeatures } });
        glMap.addLayer({ id: "gl-sectors-fill", type: "fill", source: "gl-sectors", paint: { "fill-color": "#3b82f6", "fill-opacity": 0.18 } });
        glMap.addLayer({ id: "gl-sectors-line", type: "line", source: "gl-sectors", paint: { "line-color": "#93c5fd", "line-width": 1.5, "line-opacity": 0.75 } });
      }

      // Animate to pitched 3D view
      glMap.easeTo({ pitch: 60, bearing: -15, duration: 1400 });
    });

    return () => {
      if (gl3DMapRef.current) { gl3DMapRef.current.remove(); gl3DMapRef.current = null; }
    };
  }, [show3D, mapboxToken]);

  // ─── DROP-PIN CLICK HANDLER ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || role !== "client" || !dropPinMode) return;

    const container = map.getContainer();
    container.style.cursor = "crosshair";

    const handleClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (pendingPinMarkerRef.current) {
        map.removeLayer(pendingPinMarkerRef.current);
        pendingPinMarkerRef.current = null;
      }
      const marker = L.marker([lat, lng], { icon: pendingPinIcon() }).addTo(map);
      pendingPinMarkerRef.current = marker;
      setPendingPin({ lng, lat });
      setDropPinMode(false);
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      container.style.cursor = "";
    };
  }, [role, dropPinMode, mapLoaded]);

  // ─── COMMENT MARKERS ─────────────────────────────────────────────────────
  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!activePropertyId) return;
      deleteComment.mutate(
        { propertyId: activePropertyId, commentId },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(activePropertyId) }) },
      );
    },
    [activePropertyId, deleteComment, queryClient],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    markersRef.current.forEach((m) => map.removeLayer(m));
    markersRef.current = [];
    if (pendingPinMarkerRef.current) {
      map.removeLayer(pendingPinMarkerRef.current);
      pendingPinMarkerRef.current = null;
    }

    if (!activePropertyId) return;

    markersRef.current = comments.map((comment) => {
      const isBoundaryReq = comment.text.startsWith("[Boundary request]");
      const color = isBoundaryReq ? "#4a6f3c" : "#d97706";
      const marker = L.marker([comment.lat, comment.lng], { icon: pinIcon(color) });

      const displayText = isBoundaryReq
        ? comment.text.replace("[Boundary request] ", "")
        : comment.text;

      const el = document.createElement("div");
      el.style.cssText = "font-size:12px;padding:2px 4px;min-width:150px;max-width:220px;";
      el.innerHTML = `
        <div style="font-weight:600;margin-bottom:3px;color:#111;">${isBoundaryReq ? "Boundary Request" : "Feedback"}</div>
        <div style="color:#333;line-height:1.4;margin-bottom:4px;">${displayText}</div>
        <div style="font-size:10px;color:#888;">${comment.authorRole}</div>
        ${role === "designer" ? `<button class="del-btn" style="margin-top:6px;padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}
      `;
      el.querySelector(".del-btn")?.addEventListener("click", () => {
        handleDeleteComment(comment.id);
        marker.closePopup();
      });

      marker.bindPopup(el).addTo(map);
      return marker;
    });
  }, [comments, activePropertyId, mapLoaded, role, handleDeleteComment]);

  // ─── BUILDING OUTLINE DRAW MODE ──────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !drawBuildingOutlineMode) return;
    if (freehandMode) {
      const drawer = freehandDrawerRef.current;
      if (!drawer) return;
      drawer.enablePolygon((geom: GeoJSON.Polygon) => {
        const feat = { type: "Feature", geometry: geom, properties: {} } as GeoJSON.Feature;
        const centroid = turf.centroid(feat);
        const [lng, lat] = centroid.geometry.coordinates;
        setPendingFootprint(geom);
        setPendingStructure({ lng, lat });
        if (pendingFootprintPreviewRef.current) map.removeLayer(pendingFootprintPreviewRef.current);
        const previewLayer = L.geoJSON(feat as any, {
          style: () => ({ color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 }),
        }).addTo(map);
        pendingFootprintPreviewRef.current = previewLayer;
        setDrawBuildingOutlineMode(false);
      });
      return () => { drawer.disable(); };
    } else {
      buildingDrawActiveRef.current = true;
      buildingPolygonHandlerRef.current?.enable();
      return () => {
        buildingDrawActiveRef.current = false;
        buildingPolygonHandlerRef.current?.disable();
      };
    }
  }, [drawBuildingOutlineMode, mapLoaded, freehandMode]);

  // ─── PATHWAY DRAW MODE ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !drawPathwayMode) return;
    if (freehandMode) {
      const drawer = freehandDrawerRef.current;
      if (!drawer) return;
      drawer.enablePolyline((geom: GeoJSON.LineString) => {
        setPendingPathway(geom);
        setDrawPathwayMode(false);
      });
      return () => { drawer.disable(); };
    } else {
      pathwayDrawActiveRef.current = true;
      pathwayPolylineHandlerRef.current?.enable();
      return () => {
        pathwayDrawActiveRef.current = false;
        pathwayPolylineHandlerRef.current?.disable();
      };
    }
  }, [drawPathwayMode, mapLoaded, freehandMode]);

  // ─── SENSORY VECTOR POINT DROP ────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || role !== "designer" || !dropSensoryPointMode) return;
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    const handleClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      setPendingSensoryPoint({ lng, lat });
      setDropSensoryPointMode(false);
    };
    map.on("click", handleClick);
    return () => { map.off("click", handleClick); container.style.cursor = ""; };
  }, [role, dropSensoryPointMode, mapLoaded]);

  // ─── SENSORY VECTOR LINE DRAW ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || role !== "designer" || !drawSensoryLineMode) return;
    sensoryLineDrawActiveRef.current = true;
    sensoryLineHandlerRef.current?.enable();
    return () => {
      sensoryLineDrawActiveRef.current = false;
      sensoryLineHandlerRef.current?.disable();
    };
  }, [drawSensoryLineMode, mapLoaded, role]);

  // ─── SENSORY VECTOR MAP RENDERING ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    sensoryVectorLayersRef.current.forEach((l) => map.removeLayer(l));
    sensoryVectorLayersRef.current = [];

    if (!activePropertyId || !showSensoryVectors) return;

    const typeConfig: Record<string, { color: string; emoji: string }> = {
      road_noise:       { color: "#ef4444", emoji: "🔊" },
      view_corridor:    { color: "#22c55e", emoji: "👁" },
      privacy_threat:   { color: "#a855f7", emoji: "🚫" },
    };

    sensoryVectors.forEach((sv) => {
      const cfg = typeConfig[sv.vectorType] ?? { color: "#94a3b8", emoji: "?" };
      let geom: GeoJSON.Geometry | null = null;
      try { geom = JSON.parse(sv.geojsonGeometry); } catch { return; }

      if (geom?.type === "Point") {
        const [lng, lat] = (geom as GeoJSON.Point).coordinates;
        const icon = L.divIcon({
          className: "",
          html: `<div style="width:26px;height:26px;border-radius:50%;background:${cfg.color}22;border:2px solid ${cfg.color};display:flex;align-items:center;justify-content:center;font-size:13px;box-shadow:0 2px 6px rgba(0,0,0,0.45);">${cfg.emoji}</div>`,
          iconSize: [26, 26],
          iconAnchor: [13, 13],
        });
        const marker = L.marker([lat, lng], { icon });
        const label = sv.label || sv.vectorType.replace(/_/g, " ");
        marker.bindPopup(`<div style="font-size:12px;"><b>${label}</b><br/><span style="color:#666;font-size:10px;">${sv.vectorType}</span></div>`);
        marker.addTo(map);
        sensoryVectorLayersRef.current.push(marker);
      } else if (geom?.type === "LineString") {
        const coords = (geom as GeoJSON.LineString).coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        const line = L.polyline(coords, { color: cfg.color, weight: 3, dashArray: "8 5", opacity: 0.85 });
        const label = sv.label || sv.vectorType.replace(/_/g, " ");
        line.bindPopup(`<div style="font-size:12px;"><b>${cfg.emoji} ${label}</b><br/><span style="color:#666;font-size:10px;">${sv.vectorType}</span></div>`);
        line.addTo(map);
        sensoryVectorLayersRef.current.push(line as unknown as L.Marker);
      }
    });
  }, [sensoryVectors, activePropertyId, mapLoaded, showSensoryVectors]);

  // ─── STRUCTURE CLICK HANDLER (Designer mode) ─────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || role !== "designer" || !dropStructureMode) return;

    const container = map.getContainer();
    container.style.cursor = "crosshair";

    const handleClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (pendingStructureMarkerRef.current) {
        map.removeLayer(pendingStructureMarkerRef.current);
        pendingStructureMarkerRef.current = null;
      }
      const marker = L.marker([lat, lng], { icon: structureIcon("other", "?") }).addTo(map);
      pendingStructureMarkerRef.current = marker;
      setPendingStructure({ lng, lat });
      setDropStructureMode(false);
    };

    map.on("click", handleClick);
    return () => {
      map.off("click", handleClick);
      container.style.cursor = "";
    };
  }, [role, dropStructureMode, mapLoaded]);

  // ─── STRUCTURE MARKERS ────────────────────────────────────────────────────
  const handleDeleteStructure = useCallback(
    (structureId: string) => {
      if (!activePropertyId) return;
      deleteStructure.mutate(
        { propertyId: activePropertyId, structureId },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStructuresQueryKey(activePropertyId) }) },
      );
    },
    [activePropertyId, deleteStructure, queryClient],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    structureMarkersRef.current.forEach((m) => map.removeLayer(m));
    structureMarkersRef.current = [];
    if (pendingStructureMarkerRef.current) {
      map.removeLayer(pendingStructureMarkerRef.current);
      pendingStructureMarkerRef.current = null;
    }

    if (!activePropertyId || !showStructures) return;

    structureMarkersRef.current = structures.map((s) => {
      const marker = L.marker([s.lat, s.lng], { icon: structureIcon(s.structureType, s.label, structureLabelMode) });

      const el = document.createElement("div");
      el.style.cssText = "font-size:12px;padding:2px 4px;min-width:130px;max-width:200px;";
      el.innerHTML = `
        <div style="font-weight:700;margin-bottom:2px;color:#111;">${s.label}</div>
        <div style="font-size:10px;color:#555;margin-bottom:4px;text-transform:capitalize;">${STRUCTURE_TYPES.find(t => t.value === s.structureType)?.label ?? s.structureType}</div>
        ${role === "designer" ? `<button class="del-btn" style="margin-top:4px;padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}
      `;
      el.querySelector(".del-btn")?.addEventListener("click", () => {
        handleDeleteStructure(s.id);
        marker.closePopup();
      });

      marker.bindPopup(el).addTo(map);
      return marker;
    });
  }, [structures, activePropertyId, mapLoaded, role, showStructures, structureLabelMode, handleDeleteStructure]);

  // ─── PATHWAY HANDLERS ────────────────────────────────────────────────────
  const handleDeletePathway = useCallback(
    (pathwayId: string) => {
      if (!activePropertyId) return;
      deletePathway.mutate(
        { propertyId: activePropertyId, pathwayId },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPathwaysQueryKey(activePropertyId) }) },
      );
    },
    [activePropertyId, deletePathway, queryClient],
  );

  // ─── PENDING PATHWAY PREVIEW ─────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (pendingPathwayPreviewRef.current) { map.removeLayer(pendingPathwayPreviewRef.current); pendingPathwayPreviewRef.current = null; }
    if (!pendingPathway) return;
    const color = PATHWAY_TYPES.find((t) => t.value === pathwayType)?.color ?? "#8B6914";
    const feature: GeoJSON.Feature = { type: "Feature", geometry: pendingPathway, properties: {} };
    const layer = L.geoJSON(feature as any, { style: () => ({ color, weight: 3, opacity: 0.9 }) }).addTo(map);
    pendingPathwayPreviewRef.current = layer;
  }, [pendingPathway, pathwayType, mapLoaded]);

  // ─── SAVED PATHWAY LINES ─────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    pathwayLayersRef.current.forEach((l) => map.removeLayer(l));
    pathwayLayersRef.current = [];
    if (!activePropertyId || !showPathways) return;
    pathways.forEach((p) => {
      try {
        const geom = JSON.parse(p.lineGeojson) as GeoJSON.LineString;
        const feature: GeoJSON.Feature = { type: "Feature", geometry: geom, properties: {} };
        const pt = PATHWAY_TYPES.find((t) => t.value === p.pathwayType);
        const color = pt?.color ?? "#8B6914";
        const layer = L.geoJSON(feature as any, { style: () => ({ color, weight: 3, opacity: 0.9 }) });
        const popup = document.createElement("div");
        popup.style.cssText = "font-size:12px;padding:2px 4px;min-width:120px;max-width:200px;";
        popup.innerHTML = `
          <div style="font-weight:700;color:#111;margin-bottom:2px;">${p.label}</div>
          <div style="font-size:10px;color:#555;margin-bottom:4px;">${pt?.label ?? p.pathwayType}</div>
          ${role === "designer" ? `<button class="del-btn" style="margin-top:4px;padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}
        `;
        layer.bindPopup(popup);
        popup.querySelector(".del-btn")?.addEventListener("click", () => { handleDeletePathway(p.id); layer.closePopup(); });
        layer.addTo(map);
        pathwayLayersRef.current.push(layer);
      } catch { /* skip malformed GeoJSON */ }
    });
  }, [pathways, activePropertyId, mapLoaded, role, showPathways, handleDeletePathway]);

  // ─── ZONE ANALYSIS POLYGONS ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    zoneLayersRef.current.forEach((l) => map.removeLayer(l));
    zoneLayersRef.current = [];
    if (!showZones || !activePropertyId || zones.length === 0 || editZoneMode) return;
    // Render largest zone first so smaller ones appear on top
    const sorted = [...zones].sort((a, b) => b.zoneNumber - a.zoneNumber);
    sorted.forEach((z) => {
      const style = ZONE_STYLES.find((s) => s.zone === z.zoneNumber);
      if (!style) return;
      let geo: any;
      try { geo = JSON.parse(z.zoneGeojson); } catch { return; }
      const feature: GeoJSON.Feature = { type: "Feature", geometry: geo, properties: {} };
      const layer = L.geoJSON(feature as any, {
        style: () => ({
          color: style.color,
          weight: 1.5,
          opacity: 0.65,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
        }),
      });
      layer.bindTooltip(
        `<div style="font-size:11px;font-weight:700;">${style.label}</div><div style="font-size:10px;color:#555;">${style.hint}</div>`,
        { sticky: true },
      );
      // Client mode: clicking a zone pre-fills a comment for that zone
      if (role === "client") {
        layer.on("click", (e: any) => {
          setPendingPin({ lng: e.latlng.lng, lat: e.latlng.lat });
          setPinText(`[${style.label}] `);
          setDropPinMode(false);
        });
      }
      layer.addTo(map);
      zoneLayersRef.current.push(layer);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zones, showZones, activePropertyId, mapLoaded, role, editZoneMode]);

  // ─── ZONE DRAW MODE (activate/deactivate handler per button) ────────────
  useEffect(() => {
    const handlers = zonePolygonHandlersRef.current;
    if (!mapLoaded) return;
    Object.values(handlers).forEach((h: any) => h.disable());
    zoneDrawActiveRef.current = null;

    if (activeZoneDraw === null) return;

    if (freehandMode) {
      const drawer = freehandDrawerRef.current;
      if (!drawer) return;
      drawer.enablePolygon((geom: GeoJSON.Polygon) => {
        setPendingZoneGeom({ zoneNumber: activeZoneDraw, geojson: JSON.stringify(geom) });
        setActiveZoneDraw(null);
      });
      return () => { drawer.disable(); };
    } else {
      zoneDrawActiveRef.current = activeZoneDraw;
      handlers[activeZoneDraw]?.enable();
      return () => {
        Object.values(handlers).forEach((h: any) => h.disable());
        zoneDrawActiveRef.current = null;
      };
    }
  }, [activeZoneDraw, mapLoaded, freehandMode]);

  // ─── BOUNDARY FREEHAND DRAW MODE ─────────────────────────────────────────
  useEffect(() => {
    if (!mapLoaded || !isBoundaryDrawing || !freehandMode) return;
    drawPolygonHandlerRef.current?.disable();
    const drawer = freehandDrawerRef.current;
    if (!drawer) return;
    drawer.enablePolygon((geom: GeoJSON.Polygon) => {
      const feat = { type: "Feature", geometry: geom, properties: {} } as GeoJSON.Feature;
      const ha = turf.area(feat) / 10000;
      if (drawnItemsRef.current) {
        drawnItemsRef.current.clearLayers();
        drawnItemsRef.current.addLayer(L.geoJSON(feat as any));
      }
      setPendingBoundary(geom);
      setPendingAreaHa(ha);
      setPendingAreaAc(ha * 2.47105);
      setIsBoundaryDrawing(false);
    });
    return () => { drawer.disable(); };
  }, [isBoundaryDrawing, mapLoaded, freehandMode]);

  // ─── ZONE EDIT MODE (vertex-drag editing) ────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const editGroup = zonesEditGroupRef.current;
    if (!map || !mapLoaded || !editGroup) return;
    if (!editZoneMode) {
      if (zoneEditHandlerRef.current) {
        zoneEditHandlerRef.current.disable();
        zoneEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      zoneLayerToIdRef.current.clear();
      return;
    }
    editGroup.clearLayers();
    zoneLayerToIdRef.current.clear();
    zonesRef.current.forEach((z) => {
      const style = ZONE_STYLES.find((s) => s.zone === z.zoneNumber);
      if (!style) return;
      let geo: any;
      try { geo = JSON.parse(z.zoneGeojson); } catch { return; }
      const geoLayer = L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
        style: () => ({ color: style.color, weight: 2.5, opacity: 0.9, fillColor: style.fillColor, fillOpacity: style.fillOpacity }),
      });
      let polyLayer: L.Layer | null = null;
      geoLayer.eachLayer((l) => { polyLayer = l; });
      if (polyLayer) {
        editGroup.addLayer(polyLayer);
        zoneLayerToIdRef.current.set((polyLayer as any)._leaflet_id, { id: z.id, zoneNumber: z.zoneNumber });
      }
    });
    const EditHandler = (L as any).EditToolbar.Edit;
    const handler = new EditHandler(map, { featureGroup: editGroup });
    handler.enable();
    zoneEditHandlerRef.current = handler;
    return () => {
      if (zoneEditHandlerRef.current) {
        zoneEditHandlerRef.current.disable();
        zoneEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      zoneLayerToIdRef.current.clear();
    };
  }, [editZoneMode, mapLoaded]);

  // ─── SAVE NEW FREE-FORM ZONE ──────────────────────────────────────────────
  useEffect(() => {
    if (!pendingZoneGeom || !activePropertyId) return;
    const newZones = [
      ...zonesRef.current.map((z) => ({ zoneNumber: z.zoneNumber, zoneGeojson: z.zoneGeojson })),
      { zoneNumber: pendingZoneGeom.zoneNumber, zoneGeojson: pendingZoneGeom.geojson },
    ];
    bulkReplaceZones.mutate(
      { propertyId: activePropertyId, data: newZones },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListZonesQueryKey(activePropertyId) });
        setPendingZoneGeom(null);
      } },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingZoneGeom, activePropertyId]);

  // ─── SAVE EDITED ZONE GEOMETRIES ─────────────────────────────────────────
  useEffect(() => {
    if (!pendingZoneEdits || !activePropertyId) return;
    const editMap = new Map(pendingZoneEdits.map((e) => [e.id, e]));
    const merged = zonesRef.current.map((z) => {
      const edit = editMap.get(z.id);
      return edit
        ? { zoneNumber: edit.zoneNumber, zoneGeojson: edit.geojson }
        : { zoneNumber: z.zoneNumber, zoneGeojson: z.zoneGeojson };
    });
    bulkReplaceZones.mutate(
      { propertyId: activePropertyId, data: merged },
      { onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListZonesQueryKey(activePropertyId) });
        setPendingZoneEdits(null);
        setEditZoneMode(false);
        if (zoneEditHandlerRef.current) { zoneEditHandlerRef.current.disable(); zoneEditHandlerRef.current = null; }
      } },
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingZoneEdits, activePropertyId]);

  // ─── BOUNDARY EDIT MODE (vertex-drag reshaping) ──────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const editGroup = boundaryEditGroupRef.current;
    if (!map || !mapLoaded || !editGroup) return;
    if (!editBoundaryMode) {
      if (boundaryEditHandlerRef.current) {
        boundaryEditHandlerRef.current.disable();
        boundaryEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      return;
    }
    editGroup.clearLayers();
    const rawGeo = activePropertyRef.current?.boundaryGeojson;
    if (!rawGeo) { setEditBoundaryMode(false); return; }
    try {
      const geo = typeof rawGeo === "string" ? JSON.parse(rawGeo) : rawGeo;
      const geoLayer = L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
        style: () => ({ color: "#2D6A1A", weight: 2.5, opacity: 0.9, fillColor: "#2D6A1A", fillOpacity: 0.12 }),
      });
      let polyLayer: L.Layer | null = null;
      geoLayer.eachLayer((l) => { polyLayer = l; });
      if (polyLayer) editGroup.addLayer(polyLayer);
    } catch { setEditBoundaryMode(false); return; }
    const EditHandler = (L as any).EditToolbar.Edit;
    const handler = new EditHandler(map, { featureGroup: editGroup });
    handler.enable();
    boundaryEditHandlerRef.current = handler;
    return () => {
      if (boundaryEditHandlerRef.current) {
        boundaryEditHandlerRef.current.disable();
        boundaryEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBoundaryMode, mapLoaded]);

  // ─── FOOTPRINT EDIT MODE (vertex-drag reshaping) ─────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const editGroup = footprintEditGroupRef.current;
    if (!map || !mapLoaded || !editGroup) return;
    if (!editFootprintMode) {
      if (footprintEditHandlerRef.current) {
        footprintEditHandlerRef.current.disable();
        footprintEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      footprintLayerToIdRef.current.clear();
      return;
    }
    editGroup.clearLayers();
    footprintLayerToIdRef.current.clear();
    structuresRef.current.forEach((s) => {
      if (!s.footprintGeojson) return;
      try {
        const geo = JSON.parse(s.footprintGeojson) as GeoJSON.Polygon;
        const geoLayer = L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
          style: () => ({ color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 }),
        });
        let polyLayer: L.Layer | null = null;
        geoLayer.eachLayer((l) => { polyLayer = l; });
        if (polyLayer) {
          editGroup.addLayer(polyLayer);
          footprintLayerToIdRef.current.set((polyLayer as any)._leaflet_id, s.id);
        }
      } catch { /* skip malformed */ }
    });
    const EditHandler = (L as any).EditToolbar.Edit;
    const handler = new EditHandler(map, { featureGroup: editGroup });
    handler.enable();
    footprintEditHandlerRef.current = handler;
    return () => {
      if (footprintEditHandlerRef.current) {
        footprintEditHandlerRef.current.disable();
        footprintEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      footprintLayerToIdRef.current.clear();
    };
  }, [editFootprintMode, mapLoaded]);

  // ─── PATHWAY EDIT MODE (vertex-drag reshaping) ───────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    const editGroup = pathwayEditGroupRef.current;
    if (!map || !mapLoaded || !editGroup) return;
    if (!editPathwayMode) {
      if (pathwayEditHandlerRef.current) {
        pathwayEditHandlerRef.current.disable();
        pathwayEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      pathwayLayerToIdRef.current.clear();
      return;
    }
    editGroup.clearLayers();
    pathwayLayerToIdRef.current.clear();
    pathwaysRef.current.forEach((p) => {
      try {
        const geo = JSON.parse(p.lineGeojson) as GeoJSON.LineString;
        const pt = PATHWAY_TYPES.find((t) => t.value === p.pathwayType);
        const geoLayer = L.geoJSON({ type: "Feature", geometry: geo, properties: {} } as any, {
          style: () => ({ color: pt?.color ?? "#8B6914", weight: 3, opacity: 0.9 }),
        });
        let lineLayer: L.Layer | null = null;
        geoLayer.eachLayer((l) => { lineLayer = l; });
        if (lineLayer) {
          editGroup.addLayer(lineLayer);
          pathwayLayerToIdRef.current.set((lineLayer as any)._leaflet_id, { id: p.id, label: p.label, pathwayType: p.pathwayType });
        }
      } catch { /* skip */ }
    });
    const EditHandler = (L as any).EditToolbar.Edit;
    const handler = new EditHandler(map, { featureGroup: editGroup });
    handler.enable();
    pathwayEditHandlerRef.current = handler;
    return () => {
      if (pathwayEditHandlerRef.current) {
        pathwayEditHandlerRef.current.disable();
        pathwayEditHandlerRef.current = null;
      }
      editGroup.clearLayers();
      pathwayLayerToIdRef.current.clear();
    };
  }, [editPathwayMode, mapLoaded]);

  // ─── SAVE EDITED FOOTPRINTS ───────────────────────────────────────────────
  useEffect(() => {
    if (!pendingFootprintEdits || !activePropertyId) return;
    const edits = pendingFootprintEdits;
    setPendingFootprintEdits(null);
    setEditFootprintMode(false);
    edits.forEach(({ id, geojson }) => {
      updateStructure.mutate(
        { propertyId: activePropertyId, structureId: id, data: { footprintGeojson: geojson } },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListStructuresQueryKey(activePropertyId) }) },
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFootprintEdits, activePropertyId]);

  // ─── SAVE EDITED PATHWAYS (delete + recreate) ────────────────────────────
  useEffect(() => {
    if (!pendingPathwayEdits || !activePropertyId) return;
    const edits = pendingPathwayEdits;
    setPendingPathwayEdits(null);
    setEditPathwayMode(false);
    edits.forEach(({ id, label, pathwayType, geojson }) => {
      deletePathway.mutate(
        { propertyId: activePropertyId, pathwayId: id },
        {
          onSuccess: () => {
            createPathway.mutate(
              { propertyId: activePropertyId, data: { label, pathwayType: pathwayType as any, lineGeojson: geojson } },
              { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPathwaysQueryKey(activePropertyId) }) },
            );
          },
        },
      );
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPathwayEdits, activePropertyId]);

  // ─── BUILDING OUTLINE POLYGONS (saved) ───────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    buildingOutlineLayersRef.current.forEach((l) => map.removeLayer(l));
    buildingOutlineLayersRef.current = [];

    if (!activePropertyId || !showStructures) return;

    structures.forEach((s) => {
      if (!s.footprintGeojson) return;
      try {
        const geom = JSON.parse(s.footprintGeojson) as GeoJSON.Polygon;
        const feature: GeoJSON.Feature = { type: "Feature", geometry: geom, properties: {} };
        const layer = L.geoJSON(feature as any, {
          style: () => ({ color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 }),
        }).addTo(map);
        buildingOutlineLayersRef.current.push(layer);
      } catch { /* malformed GeoJSON, skip */ }
    });
  }, [structures, activePropertyId, mapLoaded, showStructures]);

  // ─── AUTO-SCALE SECTOR RADIUS ON ZOOM ────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const computeRadius = () => {
      const zoom = map.getZoom();
      const { lat } = map.getCenter();
      // Ground resolution at this zoom level and latitude (metres per pixel)
      const mpp = 156543.03392 * Math.cos((lat * Math.PI) / 180) / Math.pow(2, zoom);
      // Use ~22% of the visible map width (approx 800 px) as the sector radius
      const raw = (mpp * 800) / 1000 * 0.22;
      // Snap to nearest 0.05 km, clamp to [0.05, 50]
      const radiusKm = Math.max(0.05, Math.min(50, Math.round(raw / 0.05) * 0.05));
      setSectorDraft((d) => ({ ...d, radiusKm }));
    };
    computeRadius();
    map.on("zoomend", computeRadius);
    return () => { map.off("zoomend", computeRadius); };
  }, [mapLoaded]);

  // ─── SECTOR CENTER CLICK HANDLER ─────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || role !== "designer" || !dropSectorCenterMode) return;
    const container = map.getContainer();
    container.style.cursor = "crosshair";
    const handleClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      if (sectorCenterMarkerRef.current) { map.removeLayer(sectorCenterMarkerRef.current); sectorCenterMarkerRef.current = null; }
      const marker = L.circleMarker([lat, lng], { radius: 7, color: "#fff", weight: 2, fillColor: "#1e3a5f", fillOpacity: 1 }).addTo(map);
      (sectorCenterMarkerRef as any).current = marker;
      setSectorCenter({ lng, lat });
      setDropSectorCenterMode(false);
    };
    map.on("click", handleClick);
    return () => { map.off("click", handleClick); container.style.cursor = ""; };
  }, [role, dropSectorCenterMode, mapLoaded]);

  // ─── SECTOR ARM HANDLES (draggable angle markers) ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (sectorArmStartRef.current) { map.removeLayer(sectorArmStartRef.current); sectorArmStartRef.current = null; }
    if (sectorArmEndRef.current) { map.removeLayer(sectorArmEndRef.current); sectorArmEndRef.current = null; }
    if (!sectorCenter) return;
    const armIcon = (color: string) => L.divIcon({
      className: "",
      html: `<div style="width:14px;height:14px;border-radius:50%;background:#1a2e1a;border:2.5px solid ${color};box-shadow:0 1px 4px rgba(0,0,0,0.6);cursor:grab;"></div>`,
      iconSize: [14, 14],
      iconAnchor: [7, 7],
    });
    const makeHandle = (color: string, isStart: boolean) => {
      const marker = L.marker([sectorCenter.lat, sectorCenter.lng], {
        draggable: true,
        icon: armIcon(color),
        zIndexOffset: 500,
      }).addTo(map);
      marker.on("dragstart", () => { isDraggingArmRef.current = true; });
      marker.on("drag", () => {
        const { lat, lng } = marker.getLatLng();
        const b = turf.bearing(
          turf.point([sectorCenter.lng, sectorCenter.lat]),
          turf.point([lng, lat]),
        );
        const angle = Math.round(((b % 360) + 360) % 360);
        setSectorDraft((d) => isStart ? { ...d, startAngle: angle } : { ...d, endAngle: angle });
      });
      marker.on("dragend", () => {
        isDraggingArmRef.current = false;
        const draft = sectorDraftRef.current;
        const angle = isStart ? draft.startAngle : draft.endAngle;
        const dest = turf.destination(
          turf.point([sectorCenter.lng, sectorCenter.lat]),
          draft.radiusKm, angle, { units: "kilometers" },
        );
        marker.setLatLng([dest.geometry.coordinates[1], dest.geometry.coordinates[0]]);
      });
      return marker;
    };
    sectorArmStartRef.current = makeHandle("#84cc16", true);
    sectorArmEndRef.current = makeHandle("#f97316", false);
    return () => {
      if (sectorArmStartRef.current) { map.removeLayer(sectorArmStartRef.current); sectorArmStartRef.current = null; }
      if (sectorArmEndRef.current) { map.removeLayer(sectorArmEndRef.current); sectorArmEndRef.current = null; }
    };
  }, [sectorCenter, mapLoaded]);

  // ─── REPOSITION ARM HANDLES when radius / angles change ──────────────────
  useEffect(() => {
    if (!sectorCenter || isDraggingArmRef.current) return;
    const pos = (angle: number): [number, number] => {
      const dest = turf.destination(
        turf.point([sectorCenter.lng, sectorCenter.lat]),
        sectorDraft.radiusKm, angle, { units: "kilometers" },
      );
      return [dest.geometry.coordinates[1], dest.geometry.coordinates[0]];
    };
    sectorArmStartRef.current?.setLatLng(pos(sectorDraft.startAngle));
    sectorArmEndRef.current?.setLatLng(pos(sectorDraft.endAngle));
  }, [sectorCenter, sectorDraft.startAngle, sectorDraft.endAngle, sectorDraft.radiusKm]);

  // ─── SECTOR PREVIEW (live wedge while editing) ────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (sectorPreviewLayerRef.current) { map.removeLayer(sectorPreviewLayerRef.current); sectorPreviewLayerRef.current = null; }
    if (!sectorCenter) return;
    const { sectorType, radiusKm, startAngle, endAngle } = sectorDraft;
    const feature = sectorWedge(sectorCenter.lng, sectorCenter.lat, radiusKm, startAngle, endAngle);
    if (!feature) return;
    const st = SECTOR_TYPES.find((t) => t.value === sectorType) ?? SECTOR_TYPES[0];
    const layer = L.geoJSON(feature as any, {
      style: () => ({ color: st.border, weight: 1.5, fillColor: st.border, fillOpacity: 0.28, opacity: 0.8 }),
    }).addTo(map);
    sectorPreviewLayerRef.current = layer;
    return () => { if (sectorPreviewLayerRef.current) { map.removeLayer(sectorPreviewLayerRef.current); sectorPreviewLayerRef.current = null; } };
  }, [sectorCenter, sectorDraft, mapLoaded]);

  // ─── SAVED SECTORS ─────────────────────────────────────────────────────────
  const handleDeleteSector = useCallback(
    (sectorId: string) => {
      if (!activePropertyId) return;
      deleteSector.mutate(
        { propertyId: activePropertyId, sectorId },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSectorsQueryKey(activePropertyId) }) },
      );
    },
    [activePropertyId, deleteSector, queryClient],
  );

  // ─── SVG SECTOR DIAGRAM OVERLAY ────────────────────────────────────────────
  // Renders solar arc ribbons (via suncalc) and custom sector wedges as concentric
  // translucent SVG paths with arc-following text labels. Updates every map move/zoom.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Tear down previous overlay
    if (sectorSVGDivRef.current) {
      sectorSVGDivRef.current.remove();
      sectorSVGDivRef.current = null;
    }
    if (!sectorCenter) return;
    if (!showSectors && !showSolarArcs) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    const mapContainer = map.getContainer();

    const div = document.createElement("div");
    div.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:450;overflow:hidden;";
    mapContainer.appendChild(div);
    sectorSVGDivRef.current = div;

    const svgEl = document.createElementNS(SVG_NS, "svg") as SVGSVGElement;
    svgEl.style.cssText = "position:absolute;top:0;left:0;overflow:visible;";
    div.appendChild(svgEl);

    const fmt = (n: number) => n.toFixed(1);
    const cPt = (lng: number, lat: number) => map.latLngToContainerPoint(L.latLng(lat, lng));

    // Build a filled ribbon path from two parallel arc arrays ([lng,lat] each).
    function ribbonPath(outer: [number, number][], inner: [number, number][]): string {
      if (outer.length < 2 || inner.length < 2) return "";
      const op = outer.map(([lng, lat]) => cPt(lng, lat));
      const ip = inner.map(([lng, lat]) => cPt(lng, lat));
      let d = `M ${fmt(op[0].x)} ${fmt(op[0].y)}`;
      for (let i = 1; i < op.length; i++) d += ` L ${fmt(op[i].x)} ${fmt(op[i].y)}`;
      d += ` L ${fmt(ip[ip.length - 1].x)} ${fmt(ip[ip.length - 1].y)}`;
      for (let i = ip.length - 2; i >= 0; i--) d += ` L ${fmt(ip[i].x)} ${fmt(ip[i].y)}`;
      return d + " Z";
    }

    // Build outer + inner arc arrays for a compass-bearing wedge.
    function wedgeArcs(
      cLng: number, cLat: number, radiusKm: number, innerFrac: number,
      startAz: number, endAz: number,
    ): { outer: [number, number][]; inner: [number, number][] } {
      const c = turf.point([cLng, cLat]);
      const outer: [number, number][] = [];
      const inner: [number, number][] = [];
      let span = ((endAz - startAz) + 360) % 360;
      if (span < 1) span = 360;
      const steps = Math.max(32, Math.round(span));
      for (let i = 0; i <= steps; i++) {
        const a = startAz + (span * i) / steps;
        outer.push(turf.destination(c, radiusKm, a, { units: "kilometers" }).geometry.coordinates as [number, number]);
        inner.push(turf.destination(c, radiusKm * innerFrac, a, { units: "kilometers" }).geometry.coordinates as [number, number]);
      }
      return { outer, inner };
    }

    // Append a thick stroke along an arc (outer edge emphasis).
    function addArcStroke(pts: [number, number][], stroke: string, strokeW: number): void {
      if (pts.length < 2) return;
      const px = pts.map(([lng, lat]) => cPt(lng, lat));
      let d = `M ${fmt(px[0].x)} ${fmt(px[0].y)}`;
      for (let i = 1; i < px.length; i++) d += ` L ${fmt(px[i].x)} ${fmt(px[i].y)}`;
      const el = document.createElementNS(SVG_NS, "path");
      el.setAttribute("d", d);
      el.setAttribute("fill", "none");
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", String(strokeW));
      el.setAttribute("stroke-linecap", "round");
      el.setAttribute("stroke-linejoin", "round");
      el.setAttribute("pointer-events", "none");
      svgEl.appendChild(el);
    }

    // Append an SVG ribbon path with optional click handler.
    function addRibbon(
      d: string, fill: string, stroke: string, strokeW: number,
      clickCb?: () => void,
    ): SVGPathElement | undefined {
      if (!d) return;
      const el = document.createElementNS(SVG_NS, "path");
      el.setAttribute("d", d);
      el.setAttribute("fill", fill);
      el.setAttribute("stroke", stroke);
      el.setAttribute("stroke-width", String(strokeW));
      el.setAttribute("stroke-opacity", "0.72");
      if (clickCb) {
        el.style.pointerEvents = "all";
        el.style.cursor = "pointer";
        el.addEventListener("click", clickCb);
      }
      svgEl.appendChild(el);
      return el;
    }

    // Append text that flows along an arc using SVG textPath (characters follow the curve).
    // arcPts: geo [lng,lat] points of the arc; midAz used to decide path direction.
    function addCurvedLabel(
      text: string,
      arcPts: [number, number][],
      midAz: number,
      fontSize: number,
      color: string,
    ): void {
      if (arcPts.length < 2) return;
      const px = arcPts.map(([lng, lat]) => cPt(lng, lat));

      // Reverse path for southern arcs (midAz 90–270°) so characters always read L→R.
      const pts = (midAz > 90 && midAz < 270) ? [...px].reverse() : px;
      let d = `M ${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
      for (let i = 1; i < pts.length; i++) d += ` L ${fmt(pts[i].x)} ${fmt(pts[i].y)}`;

      const pathId = `ctp-${Math.random().toString(36).slice(2, 9)}`;

      // Ensure a <defs> element exists (created fresh each draw() call).
      let defs = svgEl.querySelector("defs");
      if (!defs) {
        defs = document.createElementNS(SVG_NS, "defs");
        svgEl.insertBefore(defs, svgEl.firstChild);
      }
      const defPath = document.createElementNS(SVG_NS, "path");
      defPath.setAttribute("id", pathId);
      defPath.setAttribute("d", d);
      defs.appendChild(defPath);

      // Two-pass render: white halo outline + dark fill.
      for (let pass = 0; pass < 2; pass++) {
        const textEl = document.createElementNS(SVG_NS, "text");
        textEl.setAttribute("font-size", `${fontSize}px`);
        textEl.setAttribute("font-family", "ui-sans-serif,system-ui,-apple-system,sans-serif");
        textEl.setAttribute("font-weight", "600");
        textEl.setAttribute("letter-spacing", "0.04em");
        textEl.setAttribute("pointer-events", "none");
        if (pass === 0) {
          textEl.setAttribute("fill", "none");
          textEl.setAttribute("stroke", "rgba(255,255,255,0.75)");
          textEl.setAttribute("stroke-width", "4");
          textEl.setAttribute("stroke-linejoin", "round");
        } else {
          textEl.setAttribute("fill", color);
        }
        const tp = document.createElementNS(SVG_NS, "textPath");
        tp.setAttribute("href", `#${pathId}`);
        tp.setAttribute("startOffset", "50%");
        tp.setAttribute("text-anchor", "middle");
        tp.textContent = text;
        textEl.appendChild(tp);
        svgEl.appendChild(textEl);
      }
    }

    // Append an arc-following text label (dark outline + colour fill, two-pass render).
    function addArcLabel(
      text: string, lLng: number, lLat: number,
      midAzDeg: number, fontSize: number, color: string,
    ) {
      const p = cPt(lLng, lLat);
      // Rotate text tangent to arc; clamp to (−90°, 90°] so it's never upside-down.
      let rot = midAzDeg % 180;
      if (rot > 90) rot -= 180;

      for (let pass = 0; pass < 2; pass++) {
        const t = document.createElementNS(SVG_NS, "text");
        t.setAttribute("x", fmt(p.x));
        t.setAttribute("y", fmt(p.y));
        t.setAttribute("text-anchor", "middle");
        t.setAttribute("dominant-baseline", "middle");
        t.setAttribute("transform", `rotate(${rot.toFixed(1)},${fmt(p.x)},${fmt(p.y)})`);
        t.setAttribute("font-size", `${fontSize}px`);
        t.setAttribute("font-family", "ui-sans-serif,system-ui,-apple-system,sans-serif");
        t.setAttribute("font-weight", "600");
        t.setAttribute("letter-spacing", "0.04em");
        t.setAttribute("pointer-events", "none");
        if (pass === 0) {
          // Dark outline for map readability
          t.setAttribute("fill", "none");
          t.setAttribute("stroke", "rgba(255,255,255,0.72)");
          t.setAttribute("stroke-width", "4");
          t.setAttribute("stroke-linejoin", "round");
        } else {
          t.setAttribute("fill", color);
        }
        t.textContent = text;
        svgEl.appendChild(t);
      }
    }

    // ── Main draw — called on every map move/zoom ───────────────────────────
    function draw() {
      while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
      const size = map!.getSize();
      svgEl.setAttribute("width", String(size.x));
      svgEl.setAttribute("height", String(size.y));

      const { lng: cLng, lat: cLat } = sectorCenter!;
      const { radiusKm } = sectorDraft;
      const year = new Date().getFullYear();

      // ── Solar arc ribbons (true suncalc sunrise→sunset arcs) ─────────────
      if (showSolarArcs) {
        const SOLAR_SPECS = [
          {
            month: 5, day: 21,            // June 21 — summer solstice
            outerFrac: 1.00, innerFrac: 0.80,
            fill: "rgba(240,170,20,0.42)", stroke: "#C8A43C", strokeW: 1.8,
            label: "Summer Sun",
          },
          {
            month: 11, day: 21,           // Dec 21 — winter solstice
            outerFrac: 0.80, innerFrac: 0.62,
            fill: "rgba(140,180,215,0.38)", stroke: "#7AAAC0", strokeW: 1.5,
            label: "Winter Sun",
          },
        ] as const;

        SOLAR_SPECS.forEach(({ month, day, outerFrac, innerFrac, fill, stroke, strokeW, label }) => {
          const date = new Date(year, month, day, 12, 0, 0);
          const times = SunCalc.getTimes(date, cLat, cLng);
          const srMs = times.sunrise?.getTime();
          const ssMs = times.sunset?.getTime();
          if (!srMs || !ssMs || !isFinite(srMs) || !isFinite(ssMs) || ssMs <= srMs) return;

          const STEPS = 120;
          const c = turf.point([cLng, cLat]);
          const outerPts: [number, number][] = [];
          const innerPts: [number, number][] = [];

          for (let i = 0; i <= STEPS; i++) {
            const t = new Date(srMs + ((ssMs - srMs) * i) / STEPS);
            const pos = SunCalc.getPosition(t, cLat, cLng);
            if (pos.altitude < 0.005) continue;
            // suncalc azimuth: 0=south, +π/2=west → compass bearing (0=N, CW)
            const bearing = ((pos.azimuth * 180 / Math.PI) + 180 + 360) % 360;
            outerPts.push(turf.destination(c, radiusKm * outerFrac, bearing, { units: "kilometers" }).geometry.coordinates as [number, number]);
            innerPts.push(turf.destination(c, radiusKm * innerFrac, bearing, { units: "kilometers" }).geometry.coordinates as [number, number]);
          }
          if (outerPts.length < 2) return;

          addRibbon(ribbonPath(outerPts, innerPts), fill, stroke, strokeW);

          // Label at the geometric midpoint of the arc
          const mi = Math.floor(outerPts.length / 2);
          const mOuter = outerPts[mi];
          const mInner = innerPts[Math.min(mi, innerPts.length - 1)];
          const lLng = (mOuter[0] + mInner[0]) / 2;
          const lLat = (mOuter[1] + mInner[1]) / 2;
          const centerPx = cPt(cLng, cLat);
          const midPx = cPt(mOuter[0], mOuter[1]);
          const midAz = ((Math.atan2(midPx.x - centerPx.x, -(midPx.y - centerPx.y)) * 180 / Math.PI) + 360) % 360;
          addArcLabel(label, lLng, lLat, midAz, 14, "rgba(18,18,18,0.92)");
        });
      }

      // ── Custom sector wedge ribbons ──────────────────────────────────────
      // Renders as proper annular ring bands (not full wedges): inner radius ~55%,
      // radial arm lines from centre, strokes on both arcs, curved label inside band.
      if (showSectors && sectors.length > 0) {
        // Hex → rgb helper
        function hexToRgb(hex: string): [number, number, number] {
          const h = hex.replace("#", "");
          return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
        }

        // Draw a radial arm line from centre to the arc edge at a given bearing
        function addRadialArm(cLng: number, cLat: number, bearing: number, innerR: number, outerR: number, stroke: string) {
          const c = turf.point([cLng, cLat]);
          const p0 = turf.destination(c, innerR, bearing, { units: "kilometers" }).geometry.coordinates as [number, number];
          const p1 = turf.destination(c, outerR, bearing, { units: "kilometers" }).geometry.coordinates as [number, number];
          const px0 = cPt(p0[0], p0[1]);
          const px1 = cPt(p1[0], p1[1]);
          const el = document.createElementNS(SVG_NS, "line");
          el.setAttribute("x1", fmt(px0.x)); el.setAttribute("y1", fmt(px0.y));
          el.setAttribute("x2", fmt(px1.x)); el.setAttribute("y2", fmt(px1.y));
          el.setAttribute("stroke", stroke);
          el.setAttribute("stroke-width", "1.2");
          el.setAttribute("stroke-opacity", "0.7");
          el.setAttribute("pointer-events", "none");
          svgEl.appendChild(el);
        }

        const INNER_FRAC = 0.55; // annular inner radius — 55% of the outer radius

        sectors.forEach((s) => {
          const st = SECTOR_TYPES.find((t) => t.value === s.sectorType) ?? SECTOR_TYPES[0];
          const [r, g, b] = hexToRgb(st.border);
          const fill = `rgba(${r},${g},${b},0.14)`;
          const innerR = s.radiusKm * INNER_FRAC;

          const { outer, inner } = wedgeArcs(s.centerLng, s.centerLat, s.radiusKm, INNER_FRAC, s.startAngle, s.endAngle);
          const span = ((s.endAngle - s.startAngle) + 360) % 360;
          const midAz = (s.startAngle + span / 2) % 360;

          // Filled ribbon (clickable)
          addRibbon(ribbonPath(outer, inner), fill, st.border, 0, () => {
            const lPt = turf.destination(
              turf.point([s.centerLng, s.centerLat]),
              s.radiusKm * 0.775, midAz, { units: "kilometers" },
            );
            const popup = L.popup({ closeButton: true })
              .setLatLng(L.latLng(lPt.geometry.coordinates[1], lPt.geometry.coordinates[0]))
              .setContent(() => {
                const el = document.createElement("div");
                el.style.cssText = "font-size:12px;padding:4px 6px;min-width:140px;";
                el.innerHTML = `
                  <div style="font-weight:700;margin-bottom:3px;">${st.emoji} ${s.label || st.label}</div>
                  <div style="font-size:10px;color:#666;margin-bottom:6px;">${st.label} · R=${s.radiusKm}km · ${s.startAngle}°→${s.endAngle}°</div>
                  ${role === "designer" ? `<button class="delbtn" style="padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}
                `;
                el.querySelector(".delbtn")?.addEventListener("click", () => { handleDeleteSector(s.id); map!.closePopup(); });
                return el;
              });
            popup.openOn(map!);
          });

          // Outer arc stroke (thick coloured edge)
          addArcStroke(outer, st.border, 2.0);
          // Inner arc stroke (thinner, same colour)
          addArcStroke(inner, st.border, 1.0);
          // Radial arm lines at start and end angles
          addRadialArm(s.centerLng, s.centerLat, s.startAngle, innerR, s.radiusKm, st.border);
          addRadialArm(s.centerLng, s.centerLat, s.endAngle,   innerR, s.radiusKm, st.border);

          // Curved label flowing along mid-arc of the band
          const midArcPts: [number, number][] = [];
          const midFrac = (INNER_FRAC + 1.0) / 2; // halfway between inner and outer
          const c = turf.point([s.centerLng, s.centerLat]);
          const arcSpan = span < 1 ? 360 : span;
          const arcSteps = Math.max(32, Math.round(arcSpan));
          for (let i = 0; i <= arcSteps; i++) {
            const a = s.startAngle + (arcSpan * i) / arcSteps;
            midArcPts.push(turf.destination(c, s.radiusKm * midFrac, a, { units: "kilometers" }).geometry.coordinates as [number, number]);
          }
          addCurvedLabel(s.label || st.label, midArcPts, midAz, 12, st.border);
        });
      }
    }

    map.on("move zoom", draw);
    draw();

    return () => {
      map.off("move zoom", draw);
      if (sectorSVGDivRef.current) {
        sectorSVGDivRef.current.remove();
        sectorSVGDivRef.current = null;
      }
    };
  }, [sectorCenter, sectors, sectorDraft.radiusKm, showSectors, showSolarArcs, mapLoaded, role, handleDeleteSector]);

  // ─── SAVE SECTOR ─────────────────────────────────────────────────────────
  function handleSaveSector() {
    if (!activePropertyId || !sectorCenter) return;
    const payload = {
      sectorType: sectorDraft.sectorType,
      centerLng: sectorCenter.lng,
      centerLat: sectorCenter.lat,
      radiusKm: sectorDraft.radiusKm,
      startAngle: sectorDraft.startAngle,
      endAngle: sectorDraft.endAngle,
      label: sectorDraft.label.trim(),
    };
    if (editingSectorId) {
      updateSector.mutate(
        { propertyId: activePropertyId, sectorId: editingSectorId, data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSectorsQueryKey(activePropertyId) }); handleResetSectorDraft(); } },
      );
    } else {
      createSector.mutate(
        { propertyId: activePropertyId, data: payload },
        { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListSectorsQueryKey(activePropertyId) }); handleResetSectorDraft(); } },
      );
    }
  }

  // Reset only the draft — keep the center marker in place for the next sector
  function handleResetSectorDraft() {
    setEditingSectorId(null);
    setSectorDraft({ sectorType: "custom_view", radiusKm: 0.5, startAngle: 0, endAngle: 90, label: "" });
    if (sectorPreviewLayerRef.current) { mapRef.current?.removeLayer(sectorPreviewLayerRef.current); sectorPreviewLayerRef.current = null; }
  }

  // Full cancel — clear center marker too
  function handleCancelSectorDraft() {
    setSectorCenter(null);
    setEditingSectorId(null);
    setSectorDraft({ sectorType: "custom_view", radiusKm: 0.5, startAngle: 0, endAngle: 90, label: "" });
    if (sectorCenterMarkerRef.current) { mapRef.current?.removeLayer(sectorCenterMarkerRef.current); (sectorCenterMarkerRef as any).current = null; }
    if (sectorPreviewLayerRef.current) { mapRef.current?.removeLayer(sectorPreviewLayerRef.current); sectorPreviewLayerRef.current = null; }
  }

  // ─── WATER LAYER VISIBILITY ───────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const allLayers = [
      damMarkerRef.current,
      ...longestSwaleLayersRef.current,
      highestSwaleLayerRef.current,
      ...savedSwaleLayersRef.current,
    ].filter(Boolean) as L.Layer[];
    allLayers.forEach((l) => { if (showWater) { if (!map.hasLayer(l)) map.addLayer(l); } else { if (map.hasLayer(l)) map.removeLayer(l); } });
  }, [showWater, mapLoaded]);

  // ─── RUN WATER BUDGET (AI) ────────────────────────────────────────────────
  async function handleRunWaterBudget() {
    if (!activePropertyId) return;
    setIsRunningWaterBudget(true);
    setWaterBudgetError(null);
    try {
      const result = await runWaterBudgetMutation.mutateAsync({ propertyId: activePropertyId });
      setWaterBudget(result);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
        ?? "Water budget analysis failed — please try again.";
      setWaterBudgetError(msg);
    } finally {
      setIsRunningWaterBudget(false);
    }
  }

  // ─── RUN KEYLINE ANALYSIS ─────────────────────────────────────────────────
  function handleRunWaterAnalysis() {
    if (!contourDataRef.current || !activeProperty?.boundaryGeojson) return;
    setIsAnalyzing(true);
    try {
      const boundaryFeature: GeoJSON.Feature<GeoJSON.Polygon> = {
        type: "Feature",
        geometry: activeProperty.boundaryGeojson as unknown as GeoJSON.Polygon,
        properties: {},
      };
      const result = analyzeWaterPaths(contourDataRef.current, boundaryFeature, minUphillAcres);
      setWaterAnalysis(result);
    } catch (err) {
      console.error("Keyline analysis failed:", err);
    } finally {
      setIsAnalyzing(false);
    }
  }

  // ─── RENDER DAM MARKER ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    if (damMarkerRef.current) { map.removeLayer(damMarkerRef.current); damMarkerRef.current = null; }
    if (!waterAnalysis?.damSite || !showWater) return;
    const { coordinates } = waterAnalysis.damSite.geometry;
    const { elevation, interContourSpacingM } = waterAnalysis.damSite.properties;
    const icon = L.divIcon({
      className: "",
      html: `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;">
        <div style="font-size:28px;filter:drop-shadow(0 2px 6px rgba(0,80,200,0.8));">💧</div>
        <div style="background:rgba(0,60,180,0.85);color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;white-space:nowrap;">
          Keyline Dam Site
        </div>
      </div>`,
      iconSize: [80, 52],
      iconAnchor: [40, 28],
      popupAnchor: [0, -32],
    });
    const marker = L.marker([coordinates[1], coordinates[0]], { icon });
    const popup = document.createElement("div");
    popup.style.cssText = "font-size:12px;padding:2px 4px;min-width:160px;";
    popup.innerHTML = `
      <div style="font-weight:700;color:#003cb3;margin-bottom:4px;">💧 Suggested Keyline Dam Site</div>
      <div style="color:#333;font-size:11px;margin-bottom:2px;"><b>Elevation:</b> ${elevation.toFixed(1)} m</div>
      <div style="color:#333;font-size:11px;margin-bottom:2px;"><b>Inter-contour spacing:</b> ${interContourSpacingM} m</div>
      <div style="color:#666;font-size:10px;margin-top:4px;">This is the valley inflection point where the slope<br>transitions from convex to concave (Yeomans' keypoint).</div>`;
    marker.bindPopup(popup).addTo(map);
    damMarkerRef.current = marker;
  }, [waterAnalysis, mapLoaded, showWater]);

  // ─── RENDER OPTIMAL SWALE LINES ───────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    longestSwaleLayersRef.current.forEach((l) => map.removeLayer(l));
    longestSwaleLayersRef.current = [];
    if (highestSwaleLayerRef.current) { map.removeLayer(highestSwaleLayerRef.current); highestSwaleLayerRef.current = null; }
    if (!waterAnalysis || !waterHighlightsActive || !showWater) return;

    const RANK_COLORS = ["#15803d", "#16a34a", "#22c55e"];
    longestSwaleLayersRef.current = waterAnalysis.longestSwales.map((swale, i) => {
      const color = RANK_COLORS[i] ?? "#22c55e";
      const layer = L.geoJSON(swale as any, {
        style: () => ({ color, weight: 3, opacity: 0.95, fill: false }),
      });
      layer.on("mouseover", (e: any) => {
        const latlng = e.latlng;
        L.popup({ closeButton: false })
          .setLatLng(latlng)
          .setContent(`<div style="font-size:11px;"><b>Longest Swale #${(swale.properties.rank ?? i + 1)}</b><br>Length: ${swale.properties.lengthM.toLocaleString()} m<br>Elevation: ${swale.properties.elevation.toFixed(1)} m</div>`)
          .openOn(map);
      });
      layer.on("mouseout", () => map.closePopup());
      layer.addTo(map);
      return layer;
    });

    if (waterAnalysis.highestSwale) {
      const swale = waterAnalysis.highestSwale;
      const layer = L.geoJSON(swale as any, {
        style: () => ({ color: "#06b6d4", weight: 3, opacity: 0.95, fill: false }),
      });
      layer.on("mouseover", (e: any) => {
        L.popup({ closeButton: false })
          .setLatLng(e.latlng)
          .setContent(`<div style="font-size:11px;"><b>Highest Practical Swale</b><br>Length: ${swale.properties.lengthM.toLocaleString()} m<br>Elevation: ${swale.properties.elevation.toFixed(1)} m<br>Uphill area: ~${swale.properties.uphillAreaAcres} ac</div>`)
          .openOn(map);
      });
      layer.on("mouseout", () => map.closePopup());
      layer.addTo(map);
      highestSwaleLayerRef.current = layer;
    }
  }, [waterAnalysis, waterHighlightsActive, mapLoaded, showWater]);

  // ─── RENDER SAVED SWALES ──────────────────────────────────────────────────
  const handleDeleteSavedSwale = useCallback(
    (swaleId: string) => {
      if (!activePropertyId) return;
      deleteDesignedSwale.mutate(
        { propertyId: activePropertyId, swaleId },
        { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDesignedSwalesQueryKey(activePropertyId) }) },
      );
    },
    [activePropertyId, deleteDesignedSwale, queryClient],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    savedSwaleLayersRef.current.forEach((l) => map.removeLayer(l));
    savedSwaleLayersRef.current = [];
    if (!activePropertyId || !showWater) return;
    designedSwales.forEach((ds) => {
      let geo: any;
      try { geo = JSON.parse(ds.geojsonLinestring); } catch { return; }
      const layer = L.geoJSON(geo, {
        style: () => ({ color: "#0ea5e9", weight: 2.5, opacity: 0.85, fill: false, dashArray: "6 4" }),
      });
      const el = document.createElement("div");
      el.style.cssText = "font-size:11px;padding:2px 4px;min-width:150px;";
      el.innerHTML = `
        <div style="font-weight:700;color:#0369a1;margin-bottom:3px;">💾 ${ds.name}</div>
        <div style="color:#444;margin-bottom:2px;">Elev: ${ds.elevationM.toFixed(1)} m · ${ds.lengthM.toLocaleString()} m</div>
        <div style="color:#666;font-size:10px;text-transform:capitalize;">${ds.swaleType.replace(/_/g, " ")}</div>
        ${role === "designer" ? `<button class="del-swale" style="margin-top:5px;padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}`;
      el.querySelector(".del-swale")?.addEventListener("click", () => { handleDeleteSavedSwale(ds.id); layer.closePopup(); });
      layer.bindPopup(el).addTo(map);
      savedSwaleLayersRef.current.push(layer);
    });
  }, [designedSwales, activePropertyId, mapLoaded, role, showWater, handleDeleteSavedSwale]);

  // ─── CONVERT SWALE TO LAYER ───────────────────────────────────────────────
  function handleConvertToSwale(swale: AnalyzedSwale, name: string) {
    if (!activePropertyId) return;
    createDesignedSwale.mutate(
      {
        propertyId: activePropertyId,
        data: {
          name,
          geojsonLinestring: JSON.stringify(swale),
          elevationM: swale.properties.elevation,
          lengthM: swale.properties.lengthM,
          swaleType: swale.properties.swaleKind,
          notes: "",
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListDesignedSwalesQueryKey(activePropertyId) }) },
    );
  }

  // ─── GEOCODING SEARCH ────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchAddress(searchQuery, mapboxToken);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery, mapboxToken]);

  function flyToResult(result: any) {
    const map = mapRef.current;
    if (!map) return;
    const [lng, lat] = result.center;
    map.flyTo([lat, lng], 16);
    setSearchQuery(result.place_name ?? "");
    setShowDropdown(false);
    setSearchResults([]);
    setOverpassCandidates([]);
    setOverpassSelectedIdx(0);
    setIsFetchingParcel(true);
    fetchParcelBoundary(lat, lng).then((polygons) => {
      setIsFetchingParcel(false);
      setOverpassCandidates(polygons);
      setOverpassSelectedIdx(0);
    });
  }

  // ─── IMPORT OVERPASS PARCEL BOUNDARY ─────────────────────────────────────
  function handleImportOverpassBoundary() {
    if (!overpassPreview) return;
    const areaM2 = turf.area(turf.feature(overpassPreview));
    const ha = areaM2 / 10_000;
    const ac = ha * 2.47105;
    setPendingBoundary(overpassPreview);
    setPendingAreaHa(ha);
    setPendingAreaAc(ac);
    setOverpassCandidates([]);
    setOverpassSelectedIdx(0);
  }

  // ─── IMPORT GEOJSON FILE ──────────────────────────────────────────────────
  function handleGeoJsonFileImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setGeoImportError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const polygon = parseGeoJsonFile(text);
      if (!polygon) {
        setGeoImportError("Could not find a polygon in this file. Make sure it is valid GeoJSON with a Polygon or FeatureCollection.");
        return;
      }
      const areaM2 = turf.area(turf.feature(polygon));
      const ha = areaM2 / 10_000;
      const ac = ha * 2.47105;
      setPendingBoundary(polygon);
      setPendingAreaHa(ha);
      setPendingAreaAc(ac);
      setOverpassCandidates([]);
      // Fly to the imported boundary
      const map = mapRef.current;
      if (map) {
        try {
          const layer = L.geoJSON(polygon as any);
          map.fitBounds(layer.getBounds(), { padding: [40, 40] });
        } catch { /* no-op */ }
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  // ─── SAVE BOUNDARY ────────────────────────────────────────────────────────
  function handleSaveBoundary() {
    if (!activePropertyId || !pendingBoundary) return;
    updateProperty.mutate(
      {
        id: activePropertyId,
        data: {
          boundaryGeojson: pendingBoundary as unknown as Record<string, unknown>,
          areaHectares: pendingAreaHa ?? undefined,
          areaAcres: pendingAreaAc ?? undefined,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetPropertyQueryKey(activePropertyId) });
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setPendingBoundary(null);
          setPendingAreaHa(null);
          setPendingAreaAc(null);
          drawnItemsRef.current?.clearLayers();
          refetchProperty();
        },
      },
    );
  }

  // ─── CREATE PROPERTY ──────────────────────────────────────────────────────
  function handleCreateProperty() {
    if (!newPropName.trim()) return;
    createProperty.mutate(
      { data: { name: newPropName.trim() } },
      {
        onSuccess: (p) => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setActivePropertyId(p.id);
          setNewPropName("");
          setShowNewPropForm(false);
        },
      },
    );
  }

  // ─── SAVE FEEDBACK PIN ────────────────────────────────────────────────────
  function handleSavePin() {
    if (!activePropertyId || !pendingPin || !pinText.trim()) return;
    createComment.mutate(
      {
        propertyId: activePropertyId,
        data: { lng: pendingPin.lng, lat: pendingPin.lat, text: pinText.trim(), authorRole: "client" },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(activePropertyId) });
          if (pendingPinMarkerRef.current) {
            mapRef.current?.removeLayer(pendingPinMarkerRef.current);
            pendingPinMarkerRef.current = null;
          }
          setPendingPin(null);
          setPinText("");
        },
      },
    );
  }

  // ─── SAVE STRUCTURE ──────────────────────────────────────────────────────
  function handleSaveStructure() {
    if (!activePropertyId || !pendingStructure || !structureLabel.trim()) return;
    // ── Zone audit: warn if high-maintenance element placed in Zone 4 or 5 ──
    if (zones.length > 0) {
      const pt = turf.point([pendingStructure.lng, pendingStructure.lat]);
      let effectiveZone: number | null = null;
      zones.forEach((z) => {
        try {
          const geo = JSON.parse(z.zoneGeojson);
          if (turf.booleanPointInPolygon(pt, geo)) {
            effectiveZone = effectiveZone === null ? z.zoneNumber : Math.min(effectiveZone, z.zoneNumber);
          }
        } catch { /* skip malformed */ }
      });
      if (effectiveZone !== null && effectiveZone >= 4 && HIGH_MAINTENANCE_TYPES.has(structureType)) {
        setZoneAuditWarning(`Zone ${effectiveZone} warning: "${structureLabel}" is a high-maintenance element. Consider moving it closer to Zone 0.`);
      } else {
        setZoneAuditWarning(null);
      }
    }
    const volumeNum = parseFloat(structureVolumeLiters);
    createStructure.mutate(
      {
        propertyId: activePropertyId,
        data: {
          lng: pendingStructure.lng,
          lat: pendingStructure.lat,
          label: structureLabel.trim(),
          structureType,
          footprintGeojson: pendingFootprint ? JSON.stringify(pendingFootprint) : null,
          volumeLiters: structureType === "tank" && !isNaN(volumeNum) && volumeNum > 0 ? volumeNum : null,
          attachedToBuilding: structureType === "tank" && structureAttachedBuilding.trim() ? structureAttachedBuilding.trim() : null,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListStructuresQueryKey(activePropertyId) });
          if (pendingStructureMarkerRef.current) {
            mapRef.current?.removeLayer(pendingStructureMarkerRef.current);
            pendingStructureMarkerRef.current = null;
          }
          if (pendingFootprintPreviewRef.current) {
            mapRef.current?.removeLayer(pendingFootprintPreviewRef.current);
            pendingFootprintPreviewRef.current = null;
          }
          setPendingStructure(null);
          setPendingFootprint(null);
          setDrawBuildingOutlineMode(false);
          setStructureLabel("");
          setStructureType("house");
          setStructureVolumeLiters("");
          setStructureAttachedBuilding("");
        },
      },
    );
  }

  function handleSavePathway() {
    if (!activePropertyId || !pendingPathway || !pathwayLabel.trim()) return;
    createPathway.mutate(
      {
        propertyId: activePropertyId,
        data: { label: pathwayLabel.trim(), pathwayType, lineGeojson: JSON.stringify(pendingPathway) },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPathwaysQueryKey(activePropertyId) });
          if (pendingPathwayPreviewRef.current) { mapRef.current?.removeLayer(pendingPathwayPreviewRef.current); pendingPathwayPreviewRef.current = null; }
          setPendingPathway(null);
          setPathwayLabel("");
          setPathwayType("footpath");
          setDrawPathwayMode(false);
        },
      },
    );
  }

  // ─── ZONE HANDLERS ────────────────────────────────────────────────────────
  function handleClearZones() {
    if (!activePropertyId) return;
    bulkReplaceZones.mutate(
      { propertyId: activePropertyId, data: [] },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListZonesQueryKey(activePropertyId) }) },
    );
  }

  function handleDeleteZone(zoneId: string) {
    if (!activePropertyId) return;
    deleteZone.mutate(
      { propertyId: activePropertyId, zoneId },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListZonesQueryKey(activePropertyId) }) },
    );
  }

  function handleCancelPathway() {
    if (pendingPathwayPreviewRef.current) { mapRef.current?.removeLayer(pendingPathwayPreviewRef.current); pendingPathwayPreviewRef.current = null; }
    pathwayPolylineHandlerRef.current?.disable();
    pathwayDrawActiveRef.current = false;
    setPendingPathway(null);
    setPathwayLabel("");
    setPathwayType("footpath");
    setDrawPathwayMode(false);
  }

  function handleCancelStructure() {
    if (pendingStructureMarkerRef.current) {
      mapRef.current?.removeLayer(pendingStructureMarkerRef.current);
      pendingStructureMarkerRef.current = null;
    }
    if (pendingFootprintPreviewRef.current) {
      mapRef.current?.removeLayer(pendingFootprintPreviewRef.current);
      pendingFootprintPreviewRef.current = null;
    }
    buildingPolygonHandlerRef.current?.disable();
    buildingDrawActiveRef.current = false;
    setPendingStructure(null);
    setPendingFootprint(null);
    setDrawBuildingOutlineMode(false);
    setStructureLabel("");
    setStructureType("house");
    setStructureVolumeLiters("");
    setStructureAttachedBuilding("");
  }

  // ─── BOUNDARY REQUEST (CLIENT) ────────────────────────────────────────────
  function handleBoundaryRequest(text: string) {
    if (!activePropertyId || !text.trim()) return;
    createComment.mutate(
      {
        propertyId: activePropertyId,
        data: {
          lng: activeProperty?.boundaryGeojson
            ? turf.centroid(activeProperty.boundaryGeojson as unknown as turf.AllGeoJSON).geometry.coordinates[0]
            : 0,
          lat: activeProperty?.boundaryGeojson
            ? turf.centroid(activeProperty.boundaryGeojson as unknown as turf.AllGeoJSON).geometry.coordinates[1]
            : 0,
          text: `[Boundary request] ${text}`,
          authorRole: "client",
        },
      },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(activePropertyId) }) },
    );
  }

  const displayAreaHa = pendingAreaHa ?? activeProperty?.areaHectares;
  const displayAreaAc = pendingAreaAc ?? activeProperty?.areaAcres;

  // ─── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── SIDEBAR BACKDROP (overlay mode only) ── */}
      {sidebarIsOverlay && sidebarOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside
        className="flex flex-col overflow-y-auto flex-shrink-0"
        style={{
          width: "18rem",
          background: "hsl(103, 48%, 11%)",
          borderRight: "1px solid hsl(103, 35%, 18%)",
          ...(sidebarIsOverlay
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100%",
                zIndex: 50,
                transform: sidebarOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.28s cubic-bezier(0.4,0,0.2,1)",
              }
            : {}),
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-tight" style={{ color: "hsl(42, 28%, 90%)" }}>TerraGuard</h1>
              <p className="text-[10px] mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>Land Security Platform</p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate("/properties")}
                title="All Properties"
                className="p-2 rounded transition-colors"
                style={{ color: "hsl(42, 15%, 55%)" }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </button>
              {sidebarIsOverlay && (
                <button
                  onClick={() => setSidebarOpen(false)}
                  title="Close panel"
                  className="p-2 rounded transition-colors"
                  style={{ color: "hsl(42, 15%, 55%)" }}
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 flex rounded-md overflow-hidden border" style={{ borderColor: "hsl(103, 35%, 20%)" }}>
            {(["designer", "client"] as Role[]).map((r) => (
              <button
                key={r}
                onClick={() => { setRole(r); setDropPinMode(false); setPendingPin(null); setDropSectorCenterMode(false); setSectorCenter(null); setEditingSectorId(null); }}
                className="flex-1 py-1.5 text-[11px] font-medium transition-colors capitalize"
                style={{
                  background: role === r ? "hsl(84, 38%, 42%)" : "transparent",
                  color: role === r ? "#fff" : "hsl(42, 15%, 55%)",
                }}
              >
                {r === "designer" ? "Engineer" : "Client"} Mode
              </button>
            ))}
          </div>
        </div>

        {/* ── INPUT MODE TOGGLE ── */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: "hsl(42, 15%, 50%)" }}>
            Input Mode
          </div>
          <div className="flex rounded-md overflow-hidden border" style={{ borderColor: "hsl(103, 35%, 20%)" }}>
            {(["native", "upload"] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className="flex-1 py-1.5 text-[11px] font-medium transition-colors"
                style={{
                  background: inputMode === mode ? "#1d4ed8" : "transparent",
                  color: inputMode === mode ? "#fff" : "hsl(42, 15%, 55%)",
                }}
              >
                {mode === "native" ? "⚙ Native Tools" : "📷 Image Upload"}
              </button>
            ))}
          </div>
          {inputMode === "upload" && (
            <p className="text-[10px] mt-2 leading-relaxed" style={{ color: "hsl(42, 15%, 45%)" }}>
              Canvas locked to 16:9. Upload iPad images using the zones on the map below.
            </p>
          )}
        </div>

        {/* Property selector */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <label className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: "hsl(42, 15%, 50%)" }}>
            Active Property
          </label>
          {showNewPropForm ? (
            <div className="flex gap-1.5">
              <input
                className="flex-1 text-xs px-2 py-1.5 rounded border outline-none"
                style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                placeholder="Property name..."
                value={newPropName}
                onChange={(e) => setNewPropName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreateProperty()}
                autoFocus
              />
              <button onClick={handleCreateProperty} className="px-2 py-1 rounded text-xs font-medium" style={{ background: "hsl(84, 38%, 42%)", color: "#fff" }}>Add</button>
              <button onClick={() => setShowNewPropForm(false)} className="px-2 py-1 rounded text-xs" style={{ color: "hsl(42, 15%, 55%)" }}>Cancel</button>
            </div>
          ) : (
            <div className="flex gap-1.5">
              <select
                className="flex-1 text-xs px-2 py-1.5 rounded border outline-none"
                style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                value={activePropertyId ?? ""}
                onChange={(e) => setActivePropertyId(e.target.value || null)}
              >
                <option value="">Select a property...</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <button
                onClick={() => setShowNewPropForm(true)}
                title="New property"
                className="px-2 py-1 rounded text-xs font-medium"
                style={{ background: "hsl(103, 35%, 17%)", border: "1px solid hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
              >+</button>
            </div>
          )}
        </div>

        {/* Address search */}
        <div className="px-4 py-3 border-b relative" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <label className="text-[10px] font-semibold uppercase tracking-widest mb-1.5 block" style={{ color: "hsl(42, 15%, 50%)" }}>
            Address Search
          </label>
          <input
            type="search"
            className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
            style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
            placeholder="Find a location..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
          />
          {showDropdown && (
            <div
              className="absolute left-4 right-4 z-50 rounded border shadow-lg mt-1 overflow-hidden"
              style={{ background: "hsl(103, 40%, 10%)", borderColor: "hsl(103, 30%, 22%)", top: "100%" }}
            >
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  className="w-full text-left px-3 py-2 text-xs transition-colors"
                  style={{ color: "hsl(42, 28%, 85%)", borderBottom: i < searchResults.length - 1 ? "1px solid hsl(103, 25%, 16%)" : "none" }}
                  onMouseDown={() => flyToResult(r)}
                >
                  <div className="font-medium truncate">{r.text}</div>
                  <div className="opacity-60 truncate text-[10px]">{r.place_name}</div>
                </button>
              ))}
            </div>
          )}
          {isFetchingParcel && (
            <p className="text-[10px] mt-1.5 animate-pulse" style={{ color: "#3b82f6" }}>Searching for parcel boundary…</p>
          )}
          {!isFetchingParcel && overpassCandidates.length > 0 && (
            <p className="text-[10px] mt-1.5" style={{ color: "#60a5fa" }}>
              ● {overpassCandidates.length} parcel option{overpassCandidates.length > 1 ? "s" : ""} found — shown in blue. Select a property below then import.
            </p>
          )}
          {!isFetchingParcel && searchQuery && overpassCandidates.length === 0 && !showDropdown && (
            <p className="text-[10px] mt-1.5" style={{ color: "hsl(42, 15%, 45%)" }}>No parcel data found — upload a GeoJSON file or draw manually.</p>
          )}
        </div>

        {/* ── LAYER VISIBILITY ── */}
        <SidebarSection label="Layer Visibility" defaultOpen>
          <div className="space-y-2">
            <LayerToggle label="Satellite Imagery" color="#4a9eff" active={showSatellite} onToggle={() => setShowSatellite((v) => !v)} />
            <LayerToggle
              label="Property Boundary"
              color="#2D6A1A"
              active={showBoundary}
              onToggle={() => setShowBoundary((v) => !v)}
              disabled={!activeProperty?.boundaryGeojson}
            />
            <LayerToggle
              label="Terrain Contours"
              color="#ef4444"
              active={showContours}
              onToggle={() => setShowContours((v) => !v)}
              disabled={!activeProperty?.boundaryGeojson}
            />
            <LayerToggle
              label="Sectors"
              color="#d4a800"
              active={showSectors}
              onToggle={() => setShowSectors((v) => !v)}
              disabled={!activePropertyId}
            />
            <LayerToggle
              label="Solar Arcs"
              color="#FBBF24"
              active={showSolarArcs}
              onToggle={() => setShowSolarArcs((v) => !v)}
              disabled={!activePropertyId || !sectorCenter}
            />
            <LayerToggle
              label="Water Analysis"
              color="#0ea5e9"
              active={showWater}
              onToggle={() => setShowWater((v) => !v)}
              disabled={!activePropertyId}
            />
            <LayerToggle
              label="Structures"
              color="#1e3a5f"
              active={showStructures}
              onToggle={() => setShowStructures((v) => !v)}
              disabled={!activePropertyId}
            />
            <LayerToggle
              label="Pathways"
              color="#8B6914"
              active={showPathways}
              onToggle={() => setShowPathways((v) => !v)}
              disabled={!activePropertyId}
            />
            <LayerToggle
              label="Zone Mapping"
              color="#CA8A04"
              active={showZones}
              onToggle={() => setShowZones((v) => !v)}
              disabled={!activePropertyId}
            />
            <LayerToggle
              label="Sensory Vectors"
              color="#a855f7"
              active={showSensoryVectors}
              onToggle={() => setShowSensoryVectors((v) => !v)}
              disabled={!activePropertyId}
            />
          </div>
          {isGeneratingContours && (
            <div className="flex items-center gap-2 mt-2.5">
              <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#ef4444" }} />
              <span className="text-[10px]" style={{ color: "hsl(42, 15%, 55%)" }}>Fetching elevation tiles...</span>
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER SECTIONS — native mode only ── */}
        {inputMode === "upload" ? (
          <div className="px-4 py-5 space-y-3">
            <div className="rounded-xl p-3 text-center" style={{ background: "hsl(220,35%,10%)", border: "1px solid #1d4ed855" }}>
              <div className="text-2xl mb-2">📷</div>
              <div className="text-[11px] font-bold mb-1" style={{ color: "#60a5fa" }}>Image Upload Mode Active</div>
              <div className="text-[10px] leading-relaxed" style={{ color: "hsl(42,15%,45%)" }}>
                Use the four upload zones on the map canvas to overlay your iPad-exported maps. The canvas is locked to 16:9 to match your device aspect ratio.
              </div>
            </div>
            <div className="space-y-1.5">
              {[
                { key: "sector", label: "Sector Map", color: "#f59e0b", icon: "🧭" },
                { key: "water", label: "Water Map", color: "#38bdf8", icon: "💧" },
                { key: "zone", label: "Zone Map", color: "#4ade80", icon: "🗺" },
                { key: "crossSection", label: "Cross-Section", color: "#c084fc", icon: "📐" },
              ].map(({ key, label, color, icon }) => {
                const uploaded = !!uploadedMaps[key as keyof typeof uploadedMaps];
                return (
                  <div key={key} className="flex items-center gap-2.5 rounded-lg px-3 py-2" style={{ background: "hsl(103,35%,12%)", border: `1px solid ${uploaded ? color + "55" : "hsl(103,28%,18%)"}` }}>
                    <span className="text-base">{icon}</span>
                    <span className="text-[11px] flex-1" style={{ color: uploaded ? color : "hsl(42,15%,50%)" }}>{label}</span>
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: uploaded ? color + "22" : "hsl(103,25%,16%)", color: uploaded ? color : "hsl(42,15%,40%)" }}>
                      {uploaded ? "✓ Loaded" : "Empty"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
        <>

        {/* ── LAYER 1: BOUNDARY ── */}
        <SidebarSection label="Layer 1 — Property Boundary" defaultOpen>
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to manage its boundary.</p>
          ) : role === "designer" ? (
            <div className="space-y-2.5">
              {/* ── OSM candidate picker ── */}
              {overpassCandidates.length > 0 && (
                <div className="rounded p-2.5 space-y-2" style={{ background: "hsl(220, 60%, 10%)", border: "1px solid hsl(220, 50%, 28%)" }}>
                  <p className="text-[10px] font-semibold" style={{ color: "#60a5fa" }}>
                    {overpassCandidates.length} parcel option{overpassCandidates.length > 1 ? "s" : ""} from map data (blue outline on map)
                  </p>
                  {overpassCandidates.length > 1 && (
                    <div className="space-y-1">
                      {overpassCandidates.map((poly, idx) => {
                        const ha = turf.area(turf.feature(poly)) / 10_000;
                        const isSelected = idx === overpassSelectedIdx;
                        return (
                          <button
                            key={idx}
                            onClick={() => setOverpassSelectedIdx(idx)}
                            className="w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors"
                            style={{
                              background: isSelected ? "hsl(220, 50%, 18%)" : "hsl(220, 50%, 12%)",
                              border: isSelected ? "1px solid #3b82f6" : "1px solid hsl(220, 40%, 22%)",
                              color: isSelected ? "#93c5fd" : "hsl(42, 15%, 55%)",
                            }}
                          >
                            {isSelected ? "▶ " : ""}Option {idx + 1} — {ha < 0.01 ? (ha * 10000).toFixed(0) + " m²" : ha.toFixed(2) + " ha"}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <button
                    onClick={handleImportOverpassBoundary}
                    className="w-full text-xs px-3 py-2 rounded font-semibold transition-colors"
                    style={{ background: "#1d4ed8", color: "#fff", border: "1px solid #3b82f6" }}
                  >
                    Import {overpassCandidates.length > 1 ? "Selected" : "This"} Boundary
                  </button>
                  <button
                    onClick={() => { setOverpassCandidates([]); setOverpassSelectedIdx(0); }}
                    className="w-full text-xs px-3 py-1.5 rounded transition-colors"
                    style={{ background: "transparent", color: "hsl(42, 15%, 50%)", border: "1px solid hsl(103, 30%, 22%)" }}
                  >
                    Dismiss — use file upload or draw
                  </button>
                </div>
              )}

              {/* ── GeoJSON file import ── */}
              <div>
                <label
                  className="w-full text-xs px-3 py-2 rounded font-medium text-left transition-colors cursor-pointer flex items-center gap-2"
                  style={{ background: "hsl(103, 35%, 17%)", border: "1px solid hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)", display: "flex" }}
                >
                  <span>⬆</span> Import Boundary from GeoJSON File
                  <input type="file" accept=".geojson,.json" className="hidden" onChange={handleGeoJsonFileImport} />
                </label>
                {geoImportError && (
                  <p className="text-[10px] mt-1" style={{ color: "#f87171" }}>{geoImportError}</p>
                )}
                <p className="text-[10px] mt-1" style={{ color: "hsl(42, 15%, 40%)" }}>
                  Download cadastral data from your land registry as GeoJSON and import it here.
                </p>
              </div>

              {/* Freehand / Precise toggle */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] flex-1" style={{ color: "hsl(42,15%,50%)" }}>Draw mode</span>
                <button
                  onClick={() => setFreehandMode(false)}
                  className="text-[10px] px-2 py-0.5 rounded-l"
                  style={{ background: freehandMode ? "hsl(103,35%,14%)" : "hsl(84,38%,30%)", border: "1px solid hsl(84,38%,25%)", color: freehandMode ? "hsl(42,15%,50%)" : "hsl(84,55%,80%)" }}
                >
                  ✦ Precise
                </button>
                <button
                  onClick={() => setFreehandMode(true)}
                  className="text-[10px] px-2 py-0.5 rounded-r -ml-px"
                  style={{ background: freehandMode ? "hsl(200,50%,22%)" : "hsl(103,35%,14%)", border: "1px solid hsl(200,50%,30%)", color: freehandMode ? "#7dd3fc" : "hsl(42,15%,50%)" }}
                >
                  ✏ Freehand
                </button>
              </div>

              {isBoundaryDrawing ? (
                <div className="space-y-2">
                  <div className="rounded p-2.5" style={{ background: "hsl(103, 40%, 12%)", border: "1px solid hsl(84, 50%, 35%)" }}>
                    <p className="text-[10px] font-semibold mb-1" style={{ color: "hsl(84, 60%, 65%)" }}>
                      {freehandMode ? "✏ Freehand active" : "✏ Drawing active"}
                    </p>
                    <p className="text-[10px]" style={{ color: "hsl(42, 15%, 60%)" }}>
                      {freehandMode
                        ? "Hold & trace the boundary with your finger or Apple Pencil — release to finish."
                        : "Click on the map to place corner points. Double-click the last point to finish the polygon."}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      drawPolygonHandlerRef.current?.disable();
                      freehandDrawerRef.current?.disable();
                      setIsBoundaryDrawing(false);
                    }}
                    className="w-full text-xs px-3 py-1.5 rounded transition-colors"
                    style={{ background: "transparent", color: "hsl(0, 70%, 60%)", border: "1px solid hsl(0, 50%, 35%)" }}
                  >
                    Cancel Drawing
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={() => {
                      if (!freehandMode) drawPolygonHandlerRef.current?.enable();
                      setIsBoundaryDrawing(true);
                    }}
                    className="w-full text-xs px-3 py-2 rounded font-medium text-left transition-colors"
                    style={{ background: "hsl(103, 35%, 17%)", border: "1px solid hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                  >
                    {freehandMode ? "✏ Freehand Boundary" : "✏ Draw Property Boundary"}
                  </button>
                  {activeProperty?.boundaryGeojson && !editBoundaryMode && (
                    <button
                      onClick={() => setEditBoundaryMode(true)}
                      className="w-full text-[11px] px-3 py-1.5 rounded"
                      style={{ background: "hsl(220,40%,22%)", border: "1px solid hsl(220,40%,32%)", color: "hsl(210,70%,75%)" }}
                    >
                      ↔ Reshape Boundary
                    </button>
                  )}
                  {editBoundaryMode && (
                    <div className="space-y-1.5">
                      <p className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>
                        Drag vertex handles to reshape the boundary outline.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => boundaryEditHandlerRef.current?.save()}
                          disabled={updateProperty.isPending}
                          className="flex-1 text-[11px] py-1.5 rounded font-medium"
                          style={{ background: "hsl(84,38%,30%)", color: "hsl(84,55%,80%)" }}
                        >
                          {updateProperty.isPending ? "Saving…" : "Save Edits"}
                        </button>
                        <button
                          onClick={() => { boundaryEditHandlerRef.current?.revertLayers(); setEditBoundaryMode(false); }}
                          className="px-3 text-[11px] py-1.5 rounded"
                          style={{ color: "hsl(42,15%,55%)", border: "1px solid hsl(103,30%,22%)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {(displayAreaHa || displayAreaAc) && (
                <div className="rounded p-2.5" style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(84, 35%, 28%)" }}>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(84, 35%, 55%)" }}>Area</div>
                  <div className="text-sm font-bold" style={{ color: "hsl(42, 28%, 90%)" }}>{displayAreaHa?.toFixed(2)} ha</div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>{displayAreaAc?.toFixed(2)} acres</div>
                </div>
              )}

              {pendingBoundary && (
                <button
                  onClick={handleSaveBoundary}
                  disabled={updateProperty.isPending}
                  className="w-full text-xs px-3 py-2 rounded font-semibold transition-colors"
                  style={{ background: "hsl(84, 38%, 42%)", color: "#fff" }}
                >
                  {updateProperty.isPending ? "Saving..." : "Save Property Boundary"}
                </button>
              )}

              {activeProperty?.boundaryGeojson && !pendingBoundary && (
                <p className="text-[10px]" style={{ color: "hsl(84, 35%, 55%)" }}>
                  Boundary saved. Draw a new polygon to update it.
                </p>
              )}
            </div>
          ) : (
            <ClientBoundaryRequest
              hasExistingBoundary={!!activeProperty?.boundaryGeojson}
              areaHa={activeProperty?.areaHectares}
              areaAc={activeProperty?.areaAcres}
              onSubmit={handleBoundaryRequest}
            />
          )}
        </SidebarSection>

        {/* ── LAYER 2: CONTOURS ── */}
        <SidebarSection label="Layer 2 — Terrain Contours">
          {!activeProperty?.boundaryGeojson ? (
            <p className="text-[10px]" style={{ color: "hsl(42, 15%, 45%)" }}>Set a property boundary first to enable contours.</p>
          ) : showContours && !isGeneratingContours ? (
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded" style={{ background: "#ef4444" }} />
              <span className="text-[10px]" style={{ color: "hsl(42, 15%, 55%)" }}>1m interval contours — red lines</span>
            </div>
          ) : !showContours ? (
            <p className="text-[10px]" style={{ color: "hsl(42, 15%, 45%)" }}>Toggle contours on in Layer Visibility above.</p>
          ) : null}
        </SidebarSection>

        {/* ── LAYER 3: SECTOR ANALYSIS ── */}
        <SidebarSection label="Layer 3 — Sector Analysis">
          <>
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to add sector overlays.</p>
          ) : role !== "designer" ? (
            <div>
              {sectors.length === 0 ? (
                <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No sector overlays mapped yet.</p>
              ) : (
                <div className="space-y-1 max-h-44 overflow-y-auto">
                  {sectors.map((s) => {
                    const st = SECTOR_TYPES.find((t) => t.value === s.sectorType) ?? SECTOR_TYPES[0];
                    return (
                      <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                        <span className="text-sm">{st.emoji}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label || st.label}</div>
                          <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{s.radiusKm}km · {s.startAngle}°→{s.endAngle}°</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : sectorCenter ? (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(103, 30%, 22%)" }}>
                <span className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>
                  Zone 0 fixed · {sectorCenter.lat.toFixed(4)}, {sectorCenter.lng.toFixed(4)}
                </span>
                <button
                  onClick={() => setDropSectorCenterMode(true)}
                  className="text-[10px] px-1.5 py-0.5 rounded ml-2 flex-shrink-0"
                  style={{ color: "hsl(42, 28%, 70%)", border: "1px solid hsl(103, 30%, 28%)" }}
                >
                  Move
                </button>
              </div>

              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: "hsl(42, 15%, 55%)" }}>Sector Type</label>
                <select
                  className="w-full text-xs px-2 py-1.5 rounded border outline-none"
                  style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                  value={sectorDraft.sectorType}
                  onChange={(e) => setSectorDraft((d) => ({ ...d, sectorType: e.target.value }))}
                >
                  {SECTOR_TYPES.map((t) => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-medium mb-1 block" style={{ color: "hsl(42, 15%, 55%)" }}>Label (optional)</label>
                <input
                  className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                  style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                  placeholder="e.g. NW Prevailing Wind"
                  value={sectorDraft.label}
                  onChange={(e) => setSectorDraft((d) => ({ ...d, label: e.target.value }))}
                />
              </div>

              <div>
                <label className="text-[10px] font-medium mb-1 flex justify-between" style={{ color: "hsl(42, 15%, 55%)" }}>
                  <span>Radius</span><span style={{ color: "hsl(42, 28%, 80%)" }}>{sectorDraft.radiusKm} km</span>
                </label>
                <input type="range" min="0.05" max="50" step="0.05"
                  className="w-full h-1.5 rounded appearance-none"
                  style={{ accentColor: "#84cc16" }}
                  value={sectorDraft.radiusKm}
                  onChange={(e) => setSectorDraft((d) => ({ ...d, radiusKm: parseFloat(e.target.value) }))}
                />
              </div>

              <div>
                <p className="text-[9px] mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                  Drag the handles on the map to set angles
                </p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="rounded px-2 py-1.5" style={{ background: "hsl(103,35%,14%)", border: "1.5px solid #84cc16" }}>
                    <div className="text-[9px] mb-0.5" style={{ color: "hsl(42,15%,55%)" }}>Start</div>
                    <div className="text-xs font-medium" style={{ color: "#84cc16" }}>{sectorDraft.startAngle}°</div>
                  </div>
                  <div className="rounded px-2 py-1.5" style={{ background: "hsl(103,35%,14%)", border: "1.5px solid #f97316" }}>
                    <div className="text-[9px] mb-0.5" style={{ color: "hsl(42,15%,55%)" }}>End</div>
                    <div className="text-xs font-medium" style={{ color: "#f97316" }}>{sectorDraft.endAngle}°</div>
                  </div>
                </div>
              </div>

              <div className="flex gap-1.5 pt-1">
                <button
                  onClick={handleSaveSector}
                  disabled={createSector.isPending || updateSector.isPending}
                  className="flex-1 text-xs py-1.5 rounded font-medium"
                  style={{ background: "hsl(84, 38%, 42%)", color: "#fff" }}
                >
                  {(createSector.isPending || updateSector.isPending) ? "Saving…" : editingSectorId ? "Update Sector" : "Save Sector"}
                </button>
                <button onClick={handleCancelSectorDraft} className="px-3 text-xs py-1.5 rounded" style={{ color: "hsl(42, 15%, 55%)" }}>
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              <button
                onClick={() => setDropSectorCenterMode(true)}
                className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                style={{
                  background: dropSectorCenterMode ? "hsl(220, 60%, 30%)" : "hsl(103, 35%, 17%)",
                  border: "1px solid hsl(103, 30%, 22%)",
                  color: dropSectorCenterMode ? "#fff" : "hsl(42, 28%, 88%)",
                }}
              >
                {dropSectorCenterMode ? "Click on map to place Zone 0 center…" : "Place Sector Center (Zone 0)"}
              </button>

              {sectors.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {sectors.length} {sectors.length === 1 ? "Sector" : "Sectors"}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {sectors.map((s) => {
                      const st = SECTOR_TYPES.find((t) => t.value === s.sectorType) ?? SECTOR_TYPES[0];
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span className="text-sm">{st.emoji}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label || st.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{s.radiusKm}km · {s.startAngle}°→{s.endAngle}°</div>
                          </div>
                          <button onClick={() => handleDeleteSector(s.id)} className="text-[10px] flex-shrink-0" style={{ color: "hsl(0, 55%, 50%)" }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Solar Arcs legend + radius — shown whenever sector center is placed ── */}
          {sectorCenter && activePropertyId && (
            <div className="mt-2.5 pt-2.5 space-y-2" style={{ borderTop: "1px solid hsl(103, 30%, 20%)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(42, 28%, 65%)" }}>
                  Solar Arcs
                </span>
                <button
                  onClick={() => setShowSolarArcs((v) => !v)}
                  className="text-[10px] px-2 py-0.5 rounded"
                  style={{
                    background: showSolarArcs ? "hsl(43, 75%, 30%)" : "hsl(103, 35%, 17%)",
                    border: "1px solid hsl(103, 30%, 26%)",
                    color: showSolarArcs ? "#FBBF24" : "hsl(42, 15%, 55%)",
                  }}
                >
                  {showSolarArcs ? "Visible" : "Hidden"}
                </button>
              </div>
              {[
                { key: "summer", label: "Summer Sun", fillColor: "rgba(245,175,25,0.35)", borderColor: "#C8A43C" },
                { key: "winter", label: "Winter Sun",  fillColor: "rgba(148,185,220,0.35)", borderColor: "#8BAFC8" },
              ].map(({ key, label, fillColor, borderColor }) => (
                <div key={key} className="flex items-center gap-2">
                  <span style={{
                    display: "inline-block",
                    width: 20,
                    height: 12,
                    background: fillColor,
                    border: `1.5px solid ${borderColor}`,
                    borderRadius: 3,
                    flexShrink: 0,
                  }} />
                  <span className="text-[10px]" style={{ color: "hsl(42, 15%, 65%)" }}>{label}</span>
                </div>
              ))}
              <p className="text-[10px]" style={{ color: "hsl(42, 15%, 45%)" }}>
                Arcs scale with the Radius slider above. Radius represents the sun's reach from Zone 0.
              </p>
            </div>
          )}
          </>
        </SidebarSection>

        {/* ── LAYER 4: WATER AUTOMATION ── compact launcher */}
        <SidebarSection label="Layer 4 — Water Automation">
          <div className="space-y-2">
            {/* Keyline report launcher */}
            <button
              onClick={() => waterAnalysis && setShowKeylineModal(true)}
              disabled={!waterAnalysis}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-[12px] font-semibold transition-all"
              style={{
                background: waterAnalysis
                  ? "linear-gradient(135deg, hsl(198,45%,10%), hsl(198,48%,13%))"
                  : "hsl(103, 20%, 10%)",
                border: `1px solid ${waterAnalysis ? "hsl(198, 45%, 22%)" : "hsl(103, 20%, 18%)"}`,
                color: waterAnalysis ? "hsl(198, 70%, 72%)" : "hsl(42, 15%, 38%)",
                boxShadow: waterAnalysis ? "0 2px 12px rgba(6,182,212,0.15)" : "none",
                opacity: !activePropertyId || !activeProperty?.boundaryGeojson ? 0.4 : 1,
                cursor: waterAnalysis ? "pointer" : "default",
              }}
            >
              <span className="flex items-center gap-2">
                <span className="text-[15px]">💧</span>
                <span>
                  {!activePropertyId || !activeProperty?.boundaryGeojson
                    ? "Draw boundary first"
                    : isGeneratingContours
                    ? "Generating contours…"
                    : !contourDataRef.current
                    ? "Enable contours to unlock"
                    : waterAnalysis
                    ? "View Keyline Report"
                    : "Awaiting contours…"}
                </span>
              </span>
              {waterAnalysis?.damSite ? (
                <span className="text-[10px] font-normal" style={{ color: "#38bdf8" }}>Dam found</span>
              ) : waterAnalysis ? (
                <span className="text-[10px] font-normal" style={{ color: "hsl(42, 15%, 40%)" }}>No dam</span>
              ) : (
                <span className="text-[13px] opacity-40">→</span>
              )}
            </button>

            {/* Highlight toggle — stays in sidebar for quick map access */}
            {waterAnalysis && role === "designer" && (
              <button
                onClick={() => {
                  setWaterHighlightsActive((v) => !v);
                }}
                className="w-full text-[11px] px-3 py-1.5 rounded-lg font-medium transition-colors"
                style={{
                  background: waterHighlightsActive ? "hsl(142, 50%, 14%)" : "hsl(103, 22%, 12%)",
                  border: `1px solid ${waterHighlightsActive ? "#15803d" : "hsl(103, 22%, 20%)"}`,
                  color: waterHighlightsActive ? "#4ade80" : "hsl(42, 15%, 50%)",
                }}
              >
                {waterHighlightsActive ? "✓ Water lines on map — hide" : "Show water lines on map"}
              </button>
            )}

            {/* Saved swale layers */}
            {designedSwales.length > 0 && (
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5 mt-1" style={{ color: "#0ea5e9" }}>
                  Saved Swales ({designedSwales.length})
                </div>
                <div className="space-y-1">
                  {designedSwales.map((ds) => (
                    <div key={ds.id} className="rounded p-1.5 text-[10px] flex items-start justify-between gap-1"
                      style={{ background: "hsl(198, 25%, 12%)", border: "1px solid #0ea5e933" }}>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" style={{ color: "#38bdf8" }}>{ds.name}</div>
                        <div style={{ color: "hsl(42, 15%, 55%)" }}>{ds.elevationM.toFixed(1)} m · {ds.lengthM.toLocaleString()} m</div>
                      </div>
                      {role === "designer" && (
                        <button
                          onClick={() => handleDeleteSavedSwale(ds.id)}
                          className="shrink-0 text-[9px] px-1.5 py-0.5 rounded"
                          style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}
                        >✕</button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </SidebarSection>

        {/* ── LAYER 5: FEEDBACK PINS ── */}
        <SidebarSection label="Layer 5 — Feedback Pins">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to manage feedback.</p>
          ) : role === "client" ? (
            <div className="space-y-2.5">
              {pendingPin ? (
                <div className="space-y-2">
                  <p className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>Pin placed. Add your feedback:</p>
                  <textarea
                    className="w-full text-xs px-2.5 py-2 rounded border outline-none resize-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    rows={3}
                    placeholder="Describe what you observed or want to change..."
                    value={pinText}
                    onChange={(e) => setPinText(e.target.value)}
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleSavePin}
                      disabled={!pinText.trim() || createComment.isPending}
                      className="flex-1 text-xs py-1.5 rounded font-medium transition-colors"
                      style={{ background: "hsl(84, 38%, 42%)", color: "#fff", opacity: !pinText.trim() ? 0.5 : 1 }}
                    >
                      {createComment.isPending ? "Saving..." : "Save Feedback"}
                    </button>
                    <button
                      onClick={() => { setPendingPin(null); setPinText(""); }}
                      className="px-3 text-xs py-1.5 rounded"
                      style={{ color: "hsl(42, 15%, 55%)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDropPinMode(true)}
                  className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                  style={{
                    background: dropPinMode ? "hsl(0, 60%, 38%)" : "hsl(103, 35%, 17%)",
                    border: "1px solid hsl(103, 30%, 22%)",
                    color: dropPinMode ? "#fff" : "hsl(42, 28%, 88%)",
                  }}
                >
                  {dropPinMode ? "Click on the map to drop a pin" : "Drop Feedback Pin"}
                </button>
              )}
              {comments.length > 0 && !pendingPin && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    Your Feedback ({comments.filter((c) => c.authorRole === "client").length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {comments.filter((c) => c.authorRole === "client").map((c) => (
                      <div key={c.id} className="text-[11px] px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)", color: "hsl(42, 25%, 78%)" }}>
                        {c.text}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {comments.length === 0 ? (
                <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No feedback pins yet. Client pins will appear here.</p>
              ) : (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {comments.length} {comments.length === 1 ? "Pin" : "Pins"} — click pins on map
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {comments.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 px-2 py-2 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                        <div className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0" style={{ background: "#d97706" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] mb-0.5" style={{ color: "hsl(42, 15%, 50%)" }}>{c.authorRole}</div>
                          <div className="text-[11px] leading-snug" style={{ color: "hsl(42, 25%, 80%)" }}>{c.text}</div>
                        </div>
                        <button onClick={() => handleDeleteComment(c.id)} className="flex-shrink-0 text-[10px] transition-colors" style={{ color: "hsl(0, 55%, 50%)" }}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 6: STRUCTURES ── */}
        <SidebarSection label="Layer 6 — Structures">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to manage structures.</p>
          ) : role === "designer" ? (
            <div className="space-y-2.5">
              {pendingStructure ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(103, 30%, 22%)" }}>
                    {pendingFootprint ? (
                      <>
                        <span className="text-sm">⬛</span>
                        <span className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>Building outline drawn</span>
                      </>
                    ) : (
                      <>
                        <span className="text-sm">📍</span>
                        <span className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>Marker placed. Add details:</span>
                      </>
                    )}
                  </div>
                  <select
                    className="w-full text-xs px-2 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    value={structureType}
                    onChange={(e) => setStructureType(e.target.value)}
                  >
                    {STRUCTURE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>
                    ))}
                  </select>
                  <input
                    className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    placeholder="Label (e.g. Main House, Old Shed...)"
                    value={structureLabel}
                    onChange={(e) => setStructureLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveStructure()}
                    autoFocus
                  />
                  {structureType === "tank" && (
                    <>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                        style={{ background: "hsl(198, 35%, 13%)", borderColor: "hsl(198, 40%, 22%)", color: "hsl(42, 28%, 88%)" }}
                        placeholder="💧 Tank volume (litres, e.g. 22700)"
                        value={structureVolumeLiters}
                        onChange={(e) => setStructureVolumeLiters(e.target.value)}
                      />
                      <input
                        className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                        style={{ background: "hsl(198, 35%, 13%)", borderColor: "hsl(198, 40%, 22%)", color: "hsl(42, 28%, 88%)" }}
                        placeholder="🏠 Feeds from building (e.g. Main House)"
                        value={structureAttachedBuilding}
                        onChange={(e) => setStructureAttachedBuilding(e.target.value)}
                      />
                    </>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleSaveStructure}
                      disabled={!structureLabel.trim() || createStructure.isPending}
                      className="flex-1 text-xs py-1.5 rounded font-medium"
                      style={{ background: "hsl(84, 38%, 42%)", color: "#fff", opacity: !structureLabel.trim() ? 0.5 : 1 }}
                    >
                      {createStructure.isPending ? "Saving..." : "Save Structure"}
                    </button>
                    <button
                      onClick={handleCancelStructure}
                      className="px-3 text-xs py-1.5 rounded"
                      style={{ color: "hsl(42, 15%, 55%)" }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={() => { setDrawBuildingOutlineMode(true); setDropStructureMode(false); }}
                    disabled={drawBuildingOutlineMode}
                    className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                    style={{
                      background: drawBuildingOutlineMode ? "hsl(220, 60%, 30%)" : "hsl(103, 35%, 17%)",
                      border: "1px solid hsl(103, 30%, 22%)",
                      color: drawBuildingOutlineMode ? "#fff" : "hsl(42, 28%, 88%)",
                    }}
                  >
                    {drawBuildingOutlineMode
                      ? (freehandMode ? "Hold & trace the outline — release to finish" : "Click points on map · double-click to finish")
                      : (freehandMode ? "✏ Freehand Building Outline" : "⬛ Draw Building Outline")}
                  </button>
                  <button
                    onClick={() => { setDropStructureMode(true); setDrawBuildingOutlineMode(false); }}
                    disabled={dropStructureMode}
                    className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                    style={{
                      background: dropStructureMode ? "hsl(220, 60%, 30%)" : "hsl(103, 35%, 17%)",
                      border: "1px solid hsl(103, 30%, 22%)",
                      color: dropStructureMode ? "#fff" : "hsl(42, 28%, 88%)",
                    }}
                  >
                    {dropStructureMode ? "Click on the map to place a structure" : "📍 Place Structure Marker"}
                  </button>
                </div>
              )}
              {/* Label mode toggle */}
              {structures.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 45%)" }}>
                    Label Style
                  </div>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid hsl(103, 22%, 20%)" }}>
                    {(["icon+label", "icon-only", "text-inside", "dot"] as const).map((mode, i, arr) => (
                      <button
                        key={mode}
                        onClick={() => setStructureLabelMode(mode)}
                        className="flex-1 py-1.5 text-[10px] font-medium transition-colors"
                        style={{
                          background: structureLabelMode === mode ? "hsl(103, 35%, 20%)" : "hsl(103, 20%, 10%)",
                          color: structureLabelMode === mode ? "hsl(103, 50%, 70%)" : "hsl(42, 15%, 45%)",
                          borderRight: i < arr.length - 1 ? "1px solid hsl(103, 22%, 20%)" : "none",
                        }}
                      >
                        {mode === "icon+label" ? "🏷 Icon+Label" : mode === "icon-only" ? "🔲 Icon" : mode === "text-inside" ? "Aa Text" : "· Dot"}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {structures.length > 0 && !pendingStructure && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {structures.length} {structures.length === 1 ? "Structure" : "Structures"}
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {structures.map((s) => {
                      const entry = STRUCTURE_TYPES.find((t) => t.value === s.structureType);
                      const isTankItem = s.structureType === "tank";
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span className="text-sm">{entry?.emoji ?? "📍"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>
                              {entry?.label ?? s.structureType}
                              {isTankItem && s.volumeLiters != null && (
                                <span style={{ color: "#38bdf8", marginLeft: 4 }}>· {(s.volumeLiters / 1000).toFixed(1)} kL</span>
                              )}
                              {isTankItem && s.attachedToBuilding && (
                                <span style={{ color: "hsl(42,15%,40%)", marginLeft: 4 }}>← {s.attachedToBuilding}</span>
                              )}
                            </div>
                          </div>
                          <button onClick={() => handleDeleteStructure(s.id)} className="text-[10px] flex-shrink-0" style={{ color: "hsl(0, 55%, 50%)" }}>
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                  {structures.some((s) => s.footprintGeojson) && !editFootprintMode && (
                    <button
                      onClick={() => { setEditFootprintMode(true); setDrawBuildingOutlineMode(false); }}
                      className="w-full text-[11px] px-3 py-1.5 rounded"
                      style={{ background: "hsl(220,40%,22%)", border: "1px solid hsl(220,40%,32%)", color: "hsl(210,70%,75%)" }}
                    >
                      ↔ Reshape Building Outlines
                    </button>
                  )}
                  {editFootprintMode && (
                    <div className="space-y-1.5">
                      <p className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>
                        Drag vertex handles to reshape building outlines.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => footprintEditHandlerRef.current?.save()}
                          className="flex-1 text-[11px] py-1.5 rounded font-medium"
                          style={{ background: "hsl(84,38%,30%)", color: "hsl(84,55%,80%)" }}
                        >
                          Save Edits
                        </button>
                        <button
                          onClick={() => { footprintEditHandlerRef.current?.revertLayers(); setEditFootprintMode(false); }}
                          className="px-3 text-[11px] py-1.5 rounded"
                          style={{ color: "hsl(42,15%,55%)", border: "1px solid hsl(103,30%,22%)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              {structures.length === 0 ? (
                <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No structures mapped yet.</p>
              ) : (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {structures.length} {structures.length === 1 ? "Structure" : "Structures"} — click markers on map
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {structures.map((s) => {
                      const entry = STRUCTURE_TYPES.find((t) => t.value === s.structureType);
                      const isTankItem = s.structureType === "tank";
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span className="text-sm">{entry?.emoji ?? "📍"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>
                              {entry?.label ?? s.structureType}
                              {isTankItem && s.volumeLiters != null && (
                                <span style={{ color: "#38bdf8", marginLeft: 4 }}>· {(s.volumeLiters / 1000).toFixed(1)} kL</span>
                              )}
                              {isTankItem && s.attachedToBuilding && (
                                <span style={{ color: "hsl(42,15%,40%)", marginLeft: 4 }}>← {s.attachedToBuilding}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 7: ACCESS & PATHWAYS ── */}
        <SidebarSection label="Layer 7 — Access & Pathways">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to map access and pathways.</p>
          ) : role === "designer" ? (
            <div className="space-y-2.5">
              {pendingPathway ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(103, 30%, 22%)" }}>
                    <span style={{ display: "inline-block", width: 16, height: 3, background: PATHWAY_TYPES.find((t) => t.value === pathwayType)?.color ?? "#8B6914", borderRadius: 2, flexShrink: 0 }} />
                    <span className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>Path drawn. Add details:</span>
                  </div>
                  <select
                    className="w-full text-xs px-2 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    value={pathwayType}
                    onChange={(e) => setPathwayType(e.target.value)}
                  >
                    {PATHWAY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                  <input
                    className="w-full text-xs px-2.5 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    placeholder="Label (e.g. Main Driveway, North Path...)"
                    value={pathwayLabel}
                    onChange={(e) => setPathwayLabel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSavePathway()}
                    autoFocus
                  />
                  <div className="flex gap-1.5">
                    <button
                      onClick={handleSavePathway}
                      disabled={!pathwayLabel.trim() || createPathway.isPending}
                      className="flex-1 text-xs py-1.5 rounded font-medium"
                      style={{ background: "hsl(84, 38%, 42%)", color: "#fff", opacity: !pathwayLabel.trim() ? 0.5 : 1 }}
                    >
                      {createPathway.isPending ? "Saving..." : "Save Pathway"}
                    </button>
                    <button onClick={handleCancelPathway} className="px-3 text-xs py-1.5 rounded" style={{ color: "hsl(42, 15%, 55%)" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setDrawPathwayMode(true)}
                  disabled={drawPathwayMode}
                  className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                  style={{
                    background: drawPathwayMode ? "hsl(220, 60%, 30%)" : "hsl(103, 35%, 17%)",
                    border: "1px solid hsl(103, 30%, 22%)",
                    color: drawPathwayMode ? "#fff" : "hsl(42, 28%, 88%)",
                  }}
                >
                  {drawPathwayMode
                    ? (freehandMode ? "Hold & trace the path — release to finish" : "Click points on map · double-click to finish")
                    : (freehandMode ? "✏ Freehand Pathway" : "✏ Draw Access or Pathway")}
                </button>
              )}
              {pathways.length > 0 && !pendingPathway && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {pathways.length} {pathways.length === 1 ? "Pathway" : "Pathways"}
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {pathways.map((p) => {
                      const pt = PATHWAY_TYPES.find((t) => t.value === p.pathwayType);
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span style={{ display: "inline-block", width: 16, height: 3, background: pt?.color ?? "#8B6914", borderRadius: 2, flexShrink: 0 }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{p.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{pt?.label ?? p.pathwayType}</div>
                          </div>
                          <button onClick={() => handleDeletePathway(p.id)} className="text-[10px] flex-shrink-0" style={{ color: "hsl(0, 55%, 50%)" }}>×</button>
                        </div>
                      );
                    })}
                  </div>
                  {!editPathwayMode && (
                    <button
                      onClick={() => { setEditPathwayMode(true); setDrawPathwayMode(false); }}
                      className="w-full text-[11px] px-3 py-1.5 rounded"
                      style={{ background: "hsl(220,40%,22%)", border: "1px solid hsl(220,40%,32%)", color: "hsl(210,70%,75%)" }}
                    >
                      ↔ Reshape Pathways
                    </button>
                  )}
                  {editPathwayMode && (
                    <div className="space-y-1.5">
                      <p className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>
                        Drag handles to reshape any pathway line.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => pathwayEditHandlerRef.current?.save()}
                          className="flex-1 text-[11px] py-1.5 rounded font-medium"
                          style={{ background: "hsl(84,38%,30%)", color: "hsl(84,55%,80%)" }}
                        >
                          Save Edits
                        </button>
                        <button
                          onClick={() => { pathwayEditHandlerRef.current?.revertLayers(); setEditPathwayMode(false); }}
                          className="px-3 text-[11px] py-1.5 rounded"
                          style={{ color: "hsl(42,15%,55%)", border: "1px solid hsl(103,30%,22%)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div>
              {pathways.length === 0 ? (
                <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No access or pathways mapped yet.</p>
              ) : (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {pathways.length} {pathways.length === 1 ? "Pathway" : "Pathways"} — click lines on map
                  </div>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {pathways.map((p) => {
                      const pt = PATHWAY_TYPES.find((t) => t.value === p.pathwayType);
                      return (
                        <div key={p.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span style={{ display: "inline-block", width: 16, height: 3, background: pt?.color ?? "#8B6914", borderRadius: 2, flexShrink: 0 }} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{p.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{pt?.label ?? p.pathwayType}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 8: ZONE MAPPING ── */}
        <SidebarSection label="Layer 8 — Zone Mapping">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to map zones.</p>
          ) : (
            <div className="space-y-2.5">
              {role === "designer" && (
                <>
                  {/* 5 free-form draw buttons */}
                  <div className="space-y-1.5">
                    {ZONE_STYLES.map((s) => {
                      const isActive = activeZoneDraw === s.zone;
                      return (
                        <button
                          key={s.zone}
                          onClick={() => {
                            setEditZoneMode(false);
                            setActiveZoneDraw(isActive ? null : s.zone);
                          }}
                          className="w-full text-left text-[11px] px-2.5 py-2 rounded flex items-center gap-2.5"
                          style={{
                            background: isActive ? "hsl(103,35%,22%)" : "hsl(103,35%,15%)",
                            border: `1.5px solid ${isActive ? s.color : "hsl(103,30%,22%)"}`,
                            color: isActive ? s.fillColor : "hsl(42,20%,70%)",
                            cursor: "pointer",
                          }}
                        >
                          <span style={{
                            display: "inline-block", width: 10, height: 10,
                            background: s.fillColor, border: `1.5px solid ${s.color}`,
                            borderRadius: 2, flexShrink: 0,
                          }} />
                          {isActive ? "Drawing… double-click to finish" : s.drawLabel}
                        </button>
                      );
                    })}
                  </div>

                  {activeZoneDraw !== null && (
                    <p className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>
                      {freehandMode
                        ? "Hold & trace the zone boundary — release to finish."
                        : "Click to place vertices. Double-click or click the first point to close."}
                    </p>
                  )}

                  {/* Edit Zone Layout */}
                  {zones.length > 0 && !editZoneMode && (
                    <button
                      onClick={() => { setActiveZoneDraw(null); setEditZoneMode(true); }}
                      className="w-full text-[11px] px-3 py-1.5 rounded"
                      style={{ background: "hsl(220,40%,22%)", border: "1px solid hsl(220,40%,32%)", color: "hsl(210,70%,75%)" }}
                    >
                      ✎ Edit Zone Layout
                    </button>
                  )}
                  {editZoneMode && (
                    <div className="space-y-1.5">
                      <p className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>
                        Click a zone polygon, then drag its corner handles to reshape it.
                      </p>
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => zoneEditHandlerRef.current?.save()}
                          disabled={bulkReplaceZones.isPending}
                          className="flex-1 text-[11px] py-1.5 rounded font-medium"
                          style={{ background: "hsl(84,38%,30%)", color: "hsl(84,55%,80%)" }}
                        >
                          {bulkReplaceZones.isPending ? "Saving…" : "Save Edits"}
                        </button>
                        <button
                          onClick={() => {
                            zoneEditHandlerRef.current?.revertLayers();
                            zoneEditHandlerRef.current?.disable();
                            zoneEditHandlerRef.current = null;
                            setEditZoneMode(false);
                          }}
                          className="px-3 text-[11px] py-1.5 rounded"
                          style={{ color: "hsl(42,15%,55%)", border: "1px solid hsl(103,30%,22%)" }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Saved zone list */}
                  {zones.length > 0 && (
                    <>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(42, 15%, 50%)" }}>
                        {zones.length} {zones.length === 1 ? "Zone" : "Zones"} saved
                      </div>
                      <div className="space-y-1 max-h-36 overflow-y-auto">
                        {[...zones].sort((a, b) => a.zoneNumber - b.zoneNumber).map((z) => {
                          const s = ZONE_STYLES.find((st) => st.zone === z.zoneNumber);
                          return (
                            <div key={z.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                              <span style={{ display: "inline-block", width: 10, height: 10, background: s?.fillColor ?? "#ccc", border: `1.5px solid ${s?.color ?? "#888"}`, borderRadius: 2, flexShrink: 0 }} />
                              <div className="flex-1 min-w-0">
                                <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s?.label ?? `Zone ${z.zoneNumber}`}</div>
                              </div>
                              <button onClick={() => handleDeleteZone(z.id)} className="text-[10px] flex-shrink-0" style={{ color: "hsl(0, 55%, 50%)" }}>×</button>
                            </div>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleClearZones}
                        className="w-full text-[11px] py-1 rounded"
                        style={{ color: "hsl(0, 55%, 55%)", border: "1px solid hsl(0, 45%, 30%)", background: "transparent" }}
                      >
                        Clear All Zones
                      </button>
                    </>
                  )}

                  {/* Zone audit warning */}
                  {zoneAuditWarning && (
                    <div className="px-2 py-2 rounded text-[10px]" style={{ background: "hsl(38, 60%, 18%)", border: "1px solid hsl(38, 55%, 32%)", color: "hsl(38, 80%, 75%)" }}>
                      ⚠ {zoneAuditWarning}
                      <button onClick={() => setZoneAuditWarning(null)} className="ml-2 underline" style={{ color: "hsl(38, 60%, 55%)" }}>Dismiss</button>
                    </div>
                  )}
                </>
              )}

              {role === "client" && (
                <div className="space-y-1.5">
                  {zones.length === 0 ? (
                    <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No zones mapped yet — ask your designer.</p>
                  ) : (
                    <p className="text-[11px]" style={{ color: "hsl(42, 15%, 55%)" }}>
                      Click any zone on the map to leave a comment about that area.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 9: SENSORY VECTORS ── */}
        <SidebarSection label="Layer 9 — Sensory Vectors">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to manage sensory vectors.</p>
          ) : (
            <div className="space-y-2.5">
              {/* Type selector */}
              <div className="space-y-1">
                <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "hsl(42, 15%, 55%)" }}>Vector Type</div>
                <div className="grid grid-cols-1 gap-1">
                  {(["road_noise", "view_corridor", "privacy_threat"] as const).map((t) => {
                    const labels: Record<string, string> = { road_noise: "🔊 Road Noise", view_corridor: "👁 View Corridor", privacy_threat: "🚫 Privacy Threat" };
                    const colors: Record<string, string> = { road_noise: "#ef4444", view_corridor: "#22c55e", privacy_threat: "#a855f7" };
                    const active = sensoryVectorType === t;
                    return (
                      <button
                        key={t}
                        onClick={() => setSensoryVectorType(t)}
                        className="w-full text-left text-[11px] px-2.5 py-1.5 rounded-lg font-medium transition-colors"
                        style={{
                          background: active ? `${colors[t]}22` : "hsl(103, 22%, 11%)",
                          border: `1px solid ${active ? colors[t] : "hsl(103, 22%, 20%)"}`,
                          color: active ? colors[t] : "hsl(42, 15%, 55%)",
                        }}
                      >
                        {labels[t]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Label */}
              <input
                className="w-full text-[11px] px-2.5 py-1.5 rounded border outline-none"
                style={{ background: "hsl(103, 35%, 14%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                placeholder="Label (optional)"
                value={sensoryVectorLabel}
                onChange={(e) => setSensoryVectorLabel(e.target.value)}
              />

              {/* Draw buttons */}
              {role === "designer" && (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setDropSensoryPointMode(true); setDrawSensoryLineMode(false); }}
                    className="flex-1 text-[11px] py-1.5 rounded font-medium transition-colors"
                    style={{
                      background: dropSensoryPointMode ? "hsl(270, 40%, 18%)" : "hsl(103, 22%, 12%)",
                      border: `1px solid ${dropSensoryPointMode ? "#a855f7" : "hsl(103, 22%, 22%)"}`,
                      color: dropSensoryPointMode ? "#c084fc" : "hsl(42, 15%, 55%)",
                    }}
                  >
                    {dropSensoryPointMode ? "Click map…" : "Drop Point"}
                  </button>
                  <button
                    onClick={() => { setDrawSensoryLineMode(true); setDropSensoryPointMode(false); }}
                    className="flex-1 text-[11px] py-1.5 rounded font-medium transition-colors"
                    style={{
                      background: drawSensoryLineMode ? "hsl(270, 40%, 18%)" : "hsl(103, 22%, 12%)",
                      border: `1px solid ${drawSensoryLineMode ? "#a855f7" : "hsl(103, 22%, 22%)"}`,
                      color: drawSensoryLineMode ? "#c084fc" : "hsl(42, 15%, 55%)",
                    }}
                  >
                    {drawSensoryLineMode ? "Drawing…" : "Draw Line"}
                  </button>
                </div>
              )}

              {/* Pending point confirm */}
              {pendingSensoryPoint && (
                <div className="space-y-1.5 rounded-lg p-2" style={{ background: "hsl(270, 30%, 12%)", border: "1px solid #a855f733" }}>
                  <p className="text-[11px]" style={{ color: "#c084fc" }}>Point placed — save?</p>
                  <div className="flex gap-1.5">
                    <button
                      disabled={createSensoryVector.isPending}
                      onClick={() => {
                        if (!activePropertyId) return;
                        const geojsonGeometry = JSON.stringify({ type: "Point", coordinates: [pendingSensoryPoint.lng, pendingSensoryPoint.lat] });
                        createSensoryVector.mutate(
                          { propertyId: activePropertyId, data: { vectorType: sensoryVectorType, geometryType: "point", geojsonGeometry, label: sensoryVectorLabel || undefined } },
                          { onSuccess: () => { setPendingSensoryPoint(null); setSensoryVectorLabel(""); queryClient.invalidateQueries({ queryKey: getListSensoryVectorsQueryKey(activePropertyId) }); } },
                        );
                      }}
                      className="flex-1 text-[11px] py-1 rounded font-medium"
                      style={{ background: "hsl(270, 45%, 30%)", color: "#e9d5ff" }}
                    >
                      {createSensoryVector.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setPendingSensoryPoint(null)}
                      className="text-[11px] px-2 py-1 rounded"
                      style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}
                    >✕</button>
                  </div>
                </div>
              )}

              {/* Pending line confirm */}
              {pendingSensoryLine && (
                <div className="space-y-1.5 rounded-lg p-2" style={{ background: "hsl(270, 30%, 12%)", border: "1px solid #a855f733" }}>
                  <p className="text-[11px]" style={{ color: "#c084fc" }}>Line drawn — save?</p>
                  <div className="flex gap-1.5">
                    <button
                      disabled={createSensoryVector.isPending}
                      onClick={() => {
                        if (!activePropertyId) return;
                        createSensoryVector.mutate(
                          { propertyId: activePropertyId, data: { vectorType: sensoryVectorType, geometryType: "line", geojsonGeometry: JSON.stringify(pendingSensoryLine), label: sensoryVectorLabel || undefined } },
                          { onSuccess: () => { setPendingSensoryLine(null); setSensoryVectorLabel(""); queryClient.invalidateQueries({ queryKey: getListSensoryVectorsQueryKey(activePropertyId) }); } },
                        );
                      }}
                      className="flex-1 text-[11px] py-1 rounded font-medium"
                      style={{ background: "hsl(270, 45%, 30%)", color: "#e9d5ff" }}
                    >
                      {createSensoryVector.isPending ? "Saving…" : "Save"}
                    </button>
                    <button
                      onClick={() => setPendingSensoryLine(null)}
                      className="text-[11px] px-2 py-1 rounded"
                      style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}
                    >✕</button>
                  </div>
                </div>
              )}

              {/* Saved vectors list */}
              {sensoryVectors.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#a855f7" }}>
                    Saved ({sensoryVectors.length})
                  </div>
                  <div className="space-y-1">
                    {sensoryVectors.map((sv) => {
                      const typeEmoji: Record<string, string> = { road_noise: "🔊", view_corridor: "👁", privacy_threat: "🚫" };
                      const typeColor: Record<string, string> = { road_noise: "#ef4444", view_corridor: "#22c55e", privacy_threat: "#a855f7" };
                      let geomType = "?";
                      try { geomType = (JSON.parse(sv.geojsonGeometry) as { type: string }).type; } catch { /* */ }
                      return (
                        <div key={sv.id} className="rounded p-1.5 text-[10px] flex items-start justify-between gap-1"
                          style={{ background: "hsl(270, 20%, 10%)", border: `1px solid ${typeColor[sv.vectorType] ?? "#a855f7"}33` }}>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate" style={{ color: typeColor[sv.vectorType] ?? "#c084fc" }}>
                              {typeEmoji[sv.vectorType] ?? "?"} {sv.label || sv.vectorType.replace(/_/g, " ")}
                            </div>
                            <div style={{ color: "hsl(42, 15%, 45%)" }}>{geomType.toLowerCase()}</div>
                          </div>
                          {role === "designer" && (
                            <button
                              onClick={() => {
                                if (!activePropertyId) return;
                                deleteSensoryVector.mutate(
                                  { propertyId: activePropertyId, vectorId: sv.id },
                                  { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListSensoryVectorsQueryKey(activePropertyId) }) },
                                );
                              }}
                              className="shrink-0 text-[9px] px-1.5 py-0.5 rounded"
                              style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}
                            >✕</button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </SidebarSection>

        </> /* end native-mode sections */
        )}

        <div className="flex-1" />

        {/* ── WORKFLOW NAVIGATION ── */}
        <div className="shrink-0 px-3 py-3 border-t" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <div className="text-[9px] uppercase tracking-widest mb-2 px-0.5" style={{ color: "hsl(42, 15%, 35%)" }}>
            Workflow
          </div>
          <StepNav />
          <button
            onClick={() => navigate("/analysis")}
            className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[11px] font-semibold transition-all"
            style={{ background: "linear-gradient(135deg, hsl(103,25%,11%), hsl(103,28%,14%))", color: "hsl(103, 40%, 70%)", border: "1px solid hsl(103, 28%, 22%)" }}
          >
            <span>⚡</span> Next: Run AI Analysis →
          </button>
        </div>
      </aside>

      {/* ── PENDING ELEMENT BANNER ── */}
      {pendingMapElement && (
        <div
          className="absolute left-0 right-0 flex items-center gap-3 px-4 py-2.5 z-50"
          style={{
            top: 0,
            background: "linear-gradient(90deg, #1e3a8a, #1d4ed8)",
            borderBottom: "2px solid #3b82f6",
            boxShadow: "0 4px 20px rgba(29,78,216,0.5)",
          }}
        >
          <span style={{ fontSize: 15 }}>📌</span>
          <div className="flex-1 min-w-0">
            <span className="text-[11px] font-bold text-white">Add to Map: </span>
            <span className="text-[11px] text-blue-200 font-semibold">{pendingMapElement.name}</span>
            <span className="text-[10px] text-blue-300 ml-2 hidden sm:inline">— {pendingMapElement.placement}</span>
          </div>
          <span className="text-[9px] uppercase tracking-widest text-blue-300 hidden md:block">
            Drop a pin or draw a structure, then dismiss
          </span>
          <button
            onClick={() => setPendingMapElement(null)}
            className="text-[10px] font-bold px-2.5 py-1 rounded transition-colors"
            style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)" }}
          >
            ✕ Dismiss
          </button>
        </div>
      )}

      {/* ── MAP ── */}
      <div
        className="flex-1 relative"
        style={{ background: "hsl(103, 18%, 5%)", marginTop: pendingMapElement ? "48px" : 0, transition: "margin-top 0.2s ease" }}
      >

        {/* ── 16:9 CANVAS HOST — full-bleed in native mode, centred+locked in upload mode ── */}
        <div
          style={inputMode === "upload" ? {
            position: "absolute",
            top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(100%, calc((100vh - 0px) * 16 / 9))",
            aspectRatio: "16 / 9",
            maxWidth: "100%",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "6px",
            overflow: "hidden",
            boxShadow: "0 0 0 9999px hsl(103,18%,5%)",
          } : {
            position: "absolute", inset: 0,
          }}
        >
          <div ref={mapContainerRef} className="absolute inset-0" />

          {/* ── UPLOADED IMAGE OVERLAYS (upload mode) ── */}
          {inputMode === "upload" && (
            <>
              {uploadedMaps.sector && (
                <img src={uploadedMaps.sector} alt="Sector Map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, pointerEvents: "none", zIndex: 10 }} />
              )}
              {uploadedMaps.water && (
                <img src={uploadedMaps.water} alt="Water Map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, pointerEvents: "none", zIndex: 11 }} />
              )}
              {uploadedMaps.zone && (
                <img src={uploadedMaps.zone} alt="Zone Map" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, pointerEvents: "none", zIndex: 12 }} />
              )}
              {uploadedMaps.crossSection && (
                <img src={uploadedMaps.crossSection} alt="Cross-Section" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.8, pointerEvents: "none", zIndex: 13 }} />
              )}
              {/* ── UPLOAD ZONE LABELS (shown before any image loaded for that slot) ── */}
              {[
                { key: "sector",       label: "Sector Map",    icon: "🧭", color: "#f59e0b", pos: "top-3 left-3"     },
                { key: "water",        label: "Water Map",     icon: "💧", color: "#38bdf8", pos: "top-3 right-3"    },
                { key: "zone",         label: "Zone Map",      icon: "🗺", color: "#4ade80", pos: "bottom-10 left-3" },
                { key: "crossSection", label: "Cross-Section", icon: "📐", color: "#c084fc", pos: "bottom-10 right-3" },
              ].map(({ key, label, icon, color, pos }) => {
                const loaded = !!uploadedMaps[key as keyof typeof uploadedMaps];
                return (
                  <label
                    key={key}
                    title={loaded ? `Replace ${label}` : `Upload ${label}`}
                    className={`absolute ${pos}`}
                    style={{ zIndex: 20, cursor: "pointer" }}
                  >
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const objectUrl = URL.createObjectURL(file);
                        setUploadedMaps((prev) => ({ ...prev, [key]: objectUrl }));
                        e.target.value = "";
                      }}
                    />
                    <div style={{
                      display: "flex", alignItems: "center", gap: 6,
                      padding: "6px 10px",
                      background: loaded ? "rgba(5,15,5,0.85)" : "rgba(5,15,5,0.75)",
                      border: `1.5px ${loaded ? "solid" : "dashed"} ${loaded ? color : "rgba(255,255,255,0.25)"}`,
                      borderRadius: 8,
                      backdropFilter: "blur(6px)",
                    }}>
                      <span style={{ fontSize: 14 }}>{icon}</span>
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", color: loaded ? color : "rgba(255,255,255,0.55)" }}>
                          {loaded ? "✓ " : ""}{label}
                        </div>
                        <div style={{ fontSize: 8, color: "rgba(255,255,255,0.35)", marginTop: 1 }}>
                          {loaded ? "click to replace" : "click to upload"}
                        </div>
                      </div>
                      {loaded && (
                        <button
                          onClick={(e) => { e.preventDefault(); setUploadedMaps((prev) => ({ ...prev, [key]: null })); }}
                          style={{ marginLeft: 2, width: 14, height: 14, background: "rgba(200,0,0,0.7)", border: "none", borderRadius: 3, color: "#fff", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        >✕</button>
                      )}
                    </div>
                  </label>
                );
              })}
            </>
          )}

          {/* Mapbox GL 3D terrain overlay — lives inside the canvas host so it clips correctly */}
          <div
            ref={gl3DContainerRef}
            className="absolute inset-0"
            style={{ zIndex: show3D ? 400 : -1, opacity: show3D ? 1 : 0, pointerEvents: show3D ? "auto" : "none", transition: "opacity 0.3s ease" }}
          />
        </div>

        {/* ── HAMBURGER TOGGLE (overlay mode only) ── */}
        {sidebarIsOverlay && !sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            title="Open layers panel"
            className="absolute top-3 left-3 flex items-center gap-2 px-3 py-2.5 rounded-xl text-[12px] font-semibold shadow-lg"
            style={{
              zIndex: 30,
              background: "hsl(103, 48%, 11%)",
              border: "1px solid hsl(103, 35%, 25%)",
              color: "hsl(42, 28%, 85%)",
              boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/>
              <line x1="3" y1="12" x2="21" y2="12"/>
              <line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
            Layers
          </button>
        )}

        {/* 3D toggle button */}
        {mapLoaded && (
          <button
            onClick={() => setShow3D((v) => !v)}
            title={show3D ? "Back to 2D map" : "View 3D terrain"}
            className="absolute bottom-10 right-3 flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold shadow-lg transition-all"
            style={{
              zIndex: 500,
              background: show3D ? "linear-gradient(135deg, #1a3a6e, #2563eb)" : "linear-gradient(135deg, #1a4a0d, #2D6A1A)",
              color: "#fff",
              border: show3D ? "1px solid #3b82f6" : "1px solid #4a9a28",
              boxShadow: show3D ? "0 4px 18px rgba(37,99,235,0.45)" : "0 4px 18px rgba(45,106,26,0.45)",
            }}
          >
            {show3D ? "⬛ Flat 2D" : "🏔 3D Terrain"}
          </button>
        )}

        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "hsl(103, 18%, 8%)" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(84, 38%, 42%)" }} />
              <span className="text-sm" style={{ color: "hsl(42, 20%, 55%)" }}>Loading map...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── KEYLINE REPORT MODAL ── */}
      {showKeylineModal && waterAnalysis && (
        <div
          className="fixed top-0 bottom-0 right-0 flex items-center justify-center p-4"
          style={{ left: modalLeft, background: "rgba(2, 8, 18, 0.85)", zIndex: 1000, transition: "left 0.28s cubic-bezier(0.4,0,0.2,1)" }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowKeylineModal(false); }}
        >
          <div
            className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl overflow-hidden"
            style={{
              background: "hsl(198, 25%, 7%)",
              border: "1px solid hsl(198, 40%, 18%)",
              boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-6 py-4 shrink-0"
              style={{ borderBottom: "1px solid hsl(198, 30%, 13%)", background: "hsl(198, 28%, 9%)" }}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">💧</span>
                  <span className="text-[15px] font-bold tracking-wide" style={{ color: "hsl(42, 28%, 88%)" }}>
                    Keyline Water Analysis
                  </span>
                </div>
                {activeProperty?.name && (
                  <p className="text-[11px] mt-0.5 pl-8" style={{ color: "hsl(42, 15%, 45%)" }}>
                    {activeProperty.name} · Elev range {waterAnalysis.minElev.toFixed(0)}–{waterAnalysis.maxElev.toFixed(0)} m · {waterAnalysis.totalAreaAcres.toFixed(1)} ac
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {role === "designer" && (
                  <button
                    onClick={handleRunWaterAnalysis}
                    disabled={isAnalyzing}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                    style={{
                      background: "hsl(198, 50%, 13%)",
                      border: "1px solid hsl(198, 50%, 22%)",
                      color: "#67e8f9",
                      opacity: isAnalyzing ? 0.6 : 1,
                    }}
                  >
                    {isAnalyzing ? (
                      <><div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#67e8f9" }} /> Running…</>
                    ) : "⟳ Re-run"}
                  </button>
                )}
                <button
                  onClick={() => setShowKeylineModal(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-[18px]"
                  style={{ color: "hsl(42, 20%, 50%)", background: "hsl(198, 25%, 11%)" }}
                >×</button>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

              {/* Dam site */}
              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#06b6d4" }}>
                  Keyline Dam Site
                </div>
                {waterAnalysis.damSite ? (
                  <div className="rounded-xl p-4 space-y-2" style={{ background: "hsl(198, 40%, 10%)", border: "1px solid hsl(198, 40%, 18%)" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-2xl">💧</span>
                      <span className="text-[13px] font-semibold" style={{ color: "#38bdf8" }}>Optimal dam site detected</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div className="rounded-lg p-2.5" style={{ background: "hsl(198, 35%, 13%)", border: "1px solid hsl(198, 35%, 20%)" }}>
                        <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#06b6d4" }}>Elevation</div>
                        <div style={{ color: "#e2d5b5" }}>{waterAnalysis.damSite.properties.elevation.toFixed(1)} m ASL</div>
                      </div>
                      <div className="rounded-lg p-2.5" style={{ background: "hsl(198, 35%, 13%)", border: "1px solid hsl(198, 35%, 20%)" }}>
                        <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#06b6d4" }}>Valley Width</div>
                        <div style={{ color: "#e2d5b5" }}>{waterAnalysis.damSite.properties.interContourSpacingM} m inter-contour</div>
                      </div>
                    </div>
                    <p className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>
                      Yeomans inflection point — where valley contours narrow before widening. 💧 marker visible on map.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl p-3 text-[11px]" style={{ background: "hsl(30, 25%, 10%)", border: "1px solid hsl(30, 25%, 18%)", color: "hsl(42, 15%, 55%)" }}>
                    Not enough contour relief to detect a valley inflection point. Try a property with more elevation change.
                  </div>
                )}
              </div>

              {/* Min uphill threshold + optimal water lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#22c55e" }}>Optimal Water Lines</div>
                  <div className="flex items-center gap-2 text-[10px]">
                    <span style={{ color: "hsl(42, 15%, 50%)" }}>Min uphill</span>
                    <input
                      type="range" min={0.1} max={5} step={0.1} value={minUphillAcres}
                      onChange={(e) => setMinUphillAcres(parseFloat(e.target.value))}
                      className="w-20 h-1.5 rounded appearance-none cursor-pointer"
                      style={{ accentColor: "#06b6d4" }}
                    />
                    <span style={{ color: "#e2d5b5" }}>{minUphillAcres.toFixed(1)} ac</span>
                  </div>
                </div>

                {/* Longest swales */}
                {waterAnalysis.longestSwales.length > 0 && (
                  <div className="mb-3">
                    <div className="text-[9px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: "#15803d" }}>
                      Top {waterAnalysis.longestSwales.length} Longest Swales
                    </div>
                    <div className="space-y-1.5">
                      {waterAnalysis.longestSwales.map((swale, i) => (
                        <div key={i} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "hsl(142, 30%, 9%)", border: "1px solid #15803d33" }}>
                          <div>
                            <span className="text-[12px] font-semibold" style={{ color: "#4ade80" }}>#{swale.properties.rank}</span>
                            <span className="text-[11px] ml-2" style={{ color: "#e2d5b5" }}>{swale.properties.lengthM.toLocaleString()} m long</span>
                            <span className="text-[10px] ml-2" style={{ color: "hsl(42, 15%, 50%)" }}>@ {swale.properties.elevation.toFixed(1)} m</span>
                          </div>
                          {role === "designer" && (
                            <button
                              onClick={() => { handleConvertToSwale(swale, `Longest Swale #${swale.properties.rank} (${swale.properties.elevation.toFixed(0)}m)`); setShowKeylineModal(false); }}
                              className="shrink-0 text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                              style={{ background: "hsl(142, 35%, 13%)", border: "1px solid #15803d", color: "#4ade80" }}
                            >
                              Save to map
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Highest swale */}
                {waterAnalysis.highestSwale && (
                  <div>
                    <div className="text-[9px] uppercase tracking-wider mb-1.5 font-semibold" style={{ color: "#06b6d4" }}>
                      Highest Practical Swale
                    </div>
                    <div className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "hsl(198, 30%, 9%)", border: "1px solid #06b6d433" }}>
                      <div>
                        <span className="text-[11px]" style={{ color: "#67e8f9" }}>{waterAnalysis.highestSwale.properties.lengthM.toLocaleString()} m long</span>
                        <span className="text-[10px] ml-2" style={{ color: "hsl(42, 15%, 50%)" }}>@ {waterAnalysis.highestSwale.properties.elevation.toFixed(1)} m</span>
                        <span className="text-[10px] ml-2" style={{ color: "hsl(42, 15%, 45%)" }}>~{waterAnalysis.highestSwale.properties.uphillAreaAcres} ac uphill</span>
                      </div>
                      {role === "designer" && (
                        <button
                          onClick={() => { handleConvertToSwale(waterAnalysis.highestSwale!, `Highest Practical Swale (${waterAnalysis.highestSwale!.properties.elevation.toFixed(0)}m)`); setShowKeylineModal(false); }}
                          className="shrink-0 text-[10px] px-2.5 py-1 rounded-lg transition-colors"
                          style={{ background: "hsl(198, 35%, 13%)", border: "1px solid #06b6d4", color: "#67e8f9" }}
                        >
                          Save to map
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {waterAnalysis.longestSwales.length === 0 && !waterAnalysis.highestSwale && (
                  <div className="rounded-xl p-3 text-[11px]" style={{ background: "hsl(30, 25%, 10%)", border: "1px solid hsl(30, 25%, 18%)", color: "hsl(42, 15%, 55%)" }}>
                    No fully-interior contour lines found. The contours on this property all clip the boundary edge.
                  </div>
                )}
              </div>

              {/* ── Roof Catchment ────────────────────────────────── */}
              {(() => {
                const roofStructures = structures.filter((s) => s.footprintGeojson);
                const perRoof = roofStructures.map((s) => {
                  let areaM2 = 0;
                  try {
                    const geo = typeof s.footprintGeojson === "string"
                      ? JSON.parse(s.footprintGeojson)
                      : s.footprintGeojson;
                    areaM2 = turf.area({ type: "Feature", geometry: geo, properties: {} });
                  } catch { /* skip malformed */ }
                  return { label: s.label, structureType: s.structureType, areaM2 };
                }).filter((r) => r.areaM2 > 0);

                const totalRoofM2 = perRoof.reduce((sum, r) => sum + r.areaM2, 0);
                const rainfallMm = clientBrief?.annualRainfallMm ?? null;
                const RUNOFF_COEFF = 0.85;
                const annualKL = rainfallMm != null && totalRoofM2 > 0
                  ? Math.round((totalRoofM2 * rainfallMm * RUNOFF_COEFF) / 1000)
                  : null;

                if (perRoof.length === 0) return null;

                return (
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#818cf8" }}>
                      Roof Catchment Potential
                    </div>
                    <div className="rounded-xl p-4 space-y-3" style={{ background: "hsl(240, 30%, 9%)", border: "1px solid hsl(240, 40%, 20%)" }}>

                      {/* Summary row */}
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-lg p-2.5" style={{ background: "hsl(240, 25%, 12%)", border: "1px solid hsl(240, 30%, 20%)" }}>
                          <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#818cf8" }}>Structures</div>
                          <div className="text-[13px] font-bold" style={{ color: "#e2d5b5" }}>{perRoof.length}</div>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: "hsl(240, 25%, 12%)", border: "1px solid hsl(240, 30%, 20%)" }}>
                          <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#818cf8" }}>Total Roof</div>
                          <div className="text-[13px] font-bold" style={{ color: "#e2d5b5" }}>{totalRoofM2.toFixed(0)} m²</div>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: "hsl(240, 25%, 12%)", border: "1px solid hsl(240, 30%, 20%)" }}>
                          <div className="text-[9px] uppercase tracking-widest mb-0.5" style={{ color: "#818cf8" }}>Annual Yield</div>
                          <div className="text-[13px] font-bold" style={{ color: annualKL != null ? "#a5f3fc" : "hsl(42,15%,45%)" }}>
                            {annualKL != null ? `${annualKL.toLocaleString()} kL` : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Rainfall source note */}
                      <p className="text-[9px]" style={{ color: "hsl(42,15%,40%)" }}>
                        {rainfallMm != null
                          ? `Based on ${rainfallMm.toLocaleString()} mm/yr site rainfall · 0.85 collection efficiency`
                          : "Run Sync Site Data on the Intake page to add rainfall data for a yield estimate."}
                      </p>

                      {/* Per-structure breakdown */}
                      {perRoof.length > 1 && (
                        <div className="space-y-1">
                          <div className="text-[9px] uppercase tracking-wider font-semibold mb-1" style={{ color: "hsl(240,30%,55%)" }}>
                            Breakdown
                          </div>
                          {perRoof.map((r, i) => {
                            const kl = rainfallMm != null
                              ? Math.round((r.areaM2 * rainfallMm * RUNOFF_COEFF) / 1000)
                              : null;
                            return (
                              <div key={i} className="flex items-center justify-between text-[10px] py-1 border-b" style={{ borderColor: "hsl(240,25%,15%)" }}>
                                <div>
                                  <span style={{ color: "#c7d2fe" }}>{r.label || r.structureType}</span>
                                  <span className="ml-2" style={{ color: "hsl(42,15%,45%)" }}>{r.areaM2.toFixed(0)} m²</span>
                                </div>
                                {kl != null && (
                                  <span style={{ color: "#a5f3fc" }}>{kl.toLocaleString()} kL/yr</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* ── Existing Tank Storage Summary ─────────────────── */}
              {(() => {
                const tanks = structures.filter((s) => s.structureType === "tank" && s.volumeLiters != null && s.volumeLiters > 0);
                if (tanks.length === 0) return null;
                const totalKL = tanks.reduce((sum, t) => sum + (t.volumeLiters ?? 0), 0) / 1000;
                return (
                  <div className="rounded-xl p-3 space-y-2" style={{ background: "hsl(198,35%,9%)", border: "1px solid hsl(198,45%,18%)" }}>
                    <div className="flex items-center justify-between">
                      <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#38bdf8" }}>
                        💧 Existing Tank Storage
                      </div>
                      <div className="text-[13px] font-bold" style={{ color: "#7dd3fc" }}>
                        {totalKL.toFixed(1)} kL
                      </div>
                    </div>
                    <div className="space-y-1">
                      {tanks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between text-[10px]" style={{ color: "hsl(42,15%,55%)" }}>
                          <span>{t.label}{t.attachedToBuilding ? <span style={{ color: "hsl(42,10%,38%)" }}> ← {t.attachedToBuilding}</span> : null}</span>
                          <span style={{ color: "#7dd3fc" }}>{((t.volumeLiters ?? 0) / 1000).toFixed(1)} kL</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* ── Water Budget AI Analysis ──────────────────────── */}
              {structures.some((s) => s.footprintGeojson) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>
                      Water Budget Analysis
                    </div>
                    {waterBudget && !isRunningWaterBudget && (
                      <button
                        onClick={handleRunWaterBudget}
                        className="text-[9px] px-2 py-1 rounded"
                        style={{ background: "hsl(270,25%,14%)", border: "1px solid hsl(270,40%,25%)", color: "#a78bfa" }}
                      >
                        ⟳ Re-run
                      </button>
                    )}
                  </div>

                  {!waterBudget && !isRunningWaterBudget && (
                    <div className="rounded-xl p-4 space-y-3" style={{ background: "hsl(270, 25%, 8%)", border: "1px solid hsl(270, 35%, 18%)" }}>
                      <p className="text-[11px]" style={{ color: "hsl(42,15%,50%)" }}>
                        Run an AI analysis to calculate household water needs with a 20% safety buffer, recommended tank sizes, and the maximum food production area sustainable from your roof catchment.
                      </p>
                      <button
                        onClick={handleRunWaterBudget}
                        className="w-full py-2.5 rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 transition-all"
                        style={{
                          background: "linear-gradient(135deg, hsl(270,40%,14%), hsl(270,45%,20%))",
                          border: "1px solid hsl(270,45%,30%)",
                          color: "#c4b5fd",
                          boxShadow: "0 4px 18px rgba(139,92,246,0.25)",
                        }}
                      >
                        <span className="text-base">🌊</span> Run Water Budget Analysis
                      </button>
                      {waterBudgetError && (
                        <p className="text-[10px] text-center" style={{ color: "#f87171" }}>{waterBudgetError}</p>
                      )}
                    </div>
                  )}

                  {isRunningWaterBudget && (
                    <div className="rounded-xl p-6 flex flex-col items-center gap-3" style={{ background: "hsl(270, 25%, 8%)", border: "1px solid hsl(270, 35%, 18%)" }}>
                      <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#a78bfa" }} />
                      <p className="text-[11px]" style={{ color: "hsl(42,15%,55%)" }}>Calculating water budget…</p>
                    </div>
                  )}

                  {waterBudget && !isRunningWaterBudget && (() => {
                    const hb = waterBudget.HouseholdBudget as Record<string, unknown> | undefined;
                    const tc = waterBudget.TankConfiguration as Record<string, unknown> | undefined;
                    const fp = waterBudget.FoodProductionBudget as Record<string, unknown> | undefined;
                    const ra = waterBudget.RiskAssessment as Record<string, unknown> | undefined;
                    const riskColor: Record<string, string> = { Low: "#4ade80", Moderate: "#fbbf24", High: "#f97316", Critical: "#ef4444" };
                    const risk = ra?.droughtRiskLevel as string | undefined;

                    return (
                      <div className="space-y-3">

                        {/* Household Budget */}
                        {hb && (
                          <div className="rounded-xl overflow-hidden" style={{ background: "hsl(270,25%,9%)", border: "1px solid hsl(270,35%,18%)" }}>
                            <div className="px-3 py-2 flex items-center gap-2" style={{ background: "hsl(270,28%,12%)", borderBottom: "1px solid hsl(270,30%,17%)" }}>
                              <span className="text-sm">🏠</span>
                              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#a78bfa" }}>Household Budget</span>
                            </div>
                            <div className="p-3 space-y-2">
                              <div className="grid grid-cols-3 gap-1.5">
                                {[
                                  { label: "Daily/person", value: `${hb.adjustedDailyLitresPerPerson ?? 150} L` },
                                  { label: "Annual need", value: `${hb.annualHouseholdKL ?? "—"} kL` },
                                  { label: "Total reserve", value: `${hb.totalHouseholdAllocationKL ?? "—"} kL` },
                                ].map((item) => (
                                  <div key={item.label} className="rounded-lg p-2" style={{ background: "hsl(270,22%,12%)", border: "1px solid hsl(270,25%,18%)" }}>
                                    <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#7c3aed" }}>{item.label}</div>
                                    <div className="text-[11px] font-bold" style={{ color: "#e2d5b5" }}>{item.value}</div>
                                  </div>
                                ))}
                              </div>
                              <div className="rounded-lg px-2.5 py-2 flex items-center justify-between" style={{ background: "hsl(270,22%,12%)", border: "1px solid hsl(270,25%,18%)" }}>
                                <span className="text-[9px] uppercase tracking-widest" style={{ color: "#7c3aed" }}>Catchment surplus</span>
                                <span className="text-[12px] font-bold" style={{ color: (hb.catchmentSurplusOrDeficitKL as number) >= 0 ? "#4ade80" : "#f87171" }}>
                                  {(hb.catchmentSurplusOrDeficitKL as number) >= 0 ? "+" : ""}{String(hb.catchmentSurplusOrDeficitKL ?? "—")} kL/yr
                                </span>
                              </div>
                              {!!hb.assessment && (
                                <p className="text-[10px] leading-relaxed" style={{ color: "hsl(42,15%,50%)" }}>{String(hb.assessment)}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Tank Configuration */}
                        {tc && (
                          <div className="rounded-xl overflow-hidden" style={{ background: "hsl(198,28%,9%)", border: "1px solid hsl(198,40%,18%)" }}>
                            <div className="px-3 py-2 flex items-center justify-between" style={{ background: "hsl(198,30%,12%)", borderBottom: "1px solid hsl(198,35%,17%)" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🛢</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#38bdf8" }}>Tank Configuration</span>
                              </div>
                              <span className="text-[10px] font-semibold" style={{ color: "#67e8f9" }}>
                                {String(tc.recommendedTotalCapacityKL ?? "—")} kL total · {String(tc.designDryDays ?? "—")} day design
                              </span>
                            </div>
                            <div className="p-3 space-y-2">
                              {(tc.tanks as Array<Record<string, unknown>> | undefined)?.map((tank, i) => (
                                <div key={i} className="rounded-lg p-2.5 space-y-0.5" style={{ background: "hsl(198,25%,12%)", border: "1px solid hsl(198,35%,18%)" }}>
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-semibold" style={{ color: "#38bdf8" }}>{tank.label as string}</span>
                                    <span className="text-[12px] font-bold" style={{ color: "#67e8f9" }}>{tank.capacityKL as number} kL</span>
                                  </div>
                                  <div className="text-[9px]" style={{ color: "hsl(42,15%,50%)" }}>{String(tank.material ?? "")} · {String(tank.purpose ?? "")}</div>
                                  {!!tank.placementNote && <div className="text-[9px]" style={{ color: "hsl(198,40%,55%)" }}>{String(tank.placementNote)}</div>}
                                </div>
                              ))}
                              {!!tc.designRationale && (
                                <p className="text-[10px] leading-relaxed" style={{ color: "hsl(42,15%,50%)" }}>{String(tc.designRationale)}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Food Production Budget */}
                        {fp && (
                          <div className="rounded-xl overflow-hidden" style={{ background: "hsl(142,28%,8%)", border: "1px solid hsl(142,40%,16%)" }}>
                            <div className="px-3 py-2 flex items-center justify-between" style={{ background: "hsl(142,30%,11%)", borderBottom: "1px solid hsl(142,35%,15%)" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">🌿</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#4ade80" }}>Food Production</span>
                              </div>
                            </div>
                            <div className="p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                {[
                                  { label: "Irrigation available", value: `${fp.availableIrrigationKL ?? "—"} kL/yr` },
                                  { label: "Max combined area", value: `${(fp.recommendedSplit as Record<string,unknown>)?.totalM2 ?? fp.maxVegetableBedM2 ?? "—"} m²` },
                                  { label: "Vegetable beds", value: `${(fp.recommendedSplit as Record<string,unknown>)?.vegetablesM2 ?? fp.maxVegetableBedM2 ?? "—"} m²` },
                                  { label: "Food forest/orchard", value: `${(fp.recommendedSplit as Record<string,unknown>)?.orchardM2 ?? fp.maxOrchardM2 ?? "—"} m²` },
                                ].map((item) => (
                                  <div key={item.label} className="rounded-lg p-2" style={{ background: "hsl(142,22%,11%)", border: "1px solid hsl(142,25%,16%)" }}>
                                    <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#15803d" }}>{item.label}</div>
                                    <div className="text-[11px] font-bold" style={{ color: "#e2d5b5" }}>{item.value}</div>
                                  </div>
                                ))}
                              </div>
                              {(fp.recommendedSplit as Record<string,unknown>)?.totalHa != null && (
                                <div className="rounded-lg p-2 text-center" style={{ background: "hsl(142,25%,11%)", border: "1px solid #15803d44" }}>
                                  <span className="text-[9px] uppercase tracking-widest" style={{ color: "#15803d" }}>Total recommended area </span>
                                  <span className="text-[13px] font-bold ml-1" style={{ color: "#4ade80" }}>
                                    {((fp.recommendedSplit as Record<string,unknown>).totalHa as number).toFixed(2)} ha
                                  </span>
                                </div>
                              )}
                              {!!fp.irrigationEfficiencyNote && (
                                <p className="text-[10px] leading-relaxed" style={{ color: "hsl(42,15%,50%)" }}>{String(fp.irrigationEfficiencyNote)}</p>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Risk Assessment */}
                        {ra && (
                          <div className="rounded-xl overflow-hidden" style={{ background: "hsl(30,25%,9%)", border: "1px solid hsl(30,30%,18%)" }}>
                            <div className="px-3 py-2 flex items-center justify-between" style={{ background: "hsl(30,28%,12%)", borderBottom: "1px solid hsl(30,28%,17%)" }}>
                              <div className="flex items-center gap-2">
                                <span className="text-sm">⚠️</span>
                                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#fb923c" }}>Drought Risk</span>
                              </div>
                              {risk && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "hsl(30,30%,14%)", color: riskColor[risk] ?? "#e2d5b5" }}>
                                  {risk}
                                </span>
                              )}
                            </div>
                            <div className="p-3 space-y-2">
                              <div className="grid grid-cols-2 gap-1.5">
                                <div className="rounded-lg p-2" style={{ background: "hsl(30,22%,12%)", border: "1px solid hsl(30,25%,18%)" }}>
                                  <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#92400e" }}>-20% rainfall</div>
                                  <div className="text-[11px] font-bold" style={{ color: "#e2d5b5" }}>{String(ra.reducedRainfallMm ?? "—")} mm/yr</div>
                                </div>
                                <div className="rounded-lg p-2" style={{ background: "hsl(30,22%,12%)", border: "1px solid hsl(30,25%,18%)" }}>
                                  <div className="text-[8px] uppercase tracking-widest mb-0.5" style={{ color: "#92400e" }}>Reduced catchment</div>
                                  <div className="text-[11px] font-bold" style={{ color: "#e2d5b5" }}>{String(ra.reducedCatchmentKL ?? "—")} kL</div>
                                </div>
                              </div>
                              {(ra.contingencyMeasures as string[] | undefined)?.length ? (
                                <div className="space-y-1">
                                  <div className="text-[9px] uppercase tracking-widest font-semibold" style={{ color: "hsl(30,30%,45%)" }}>Contingency measures</div>
                                  {(ra.contingencyMeasures as string[]).map((m, i) => (
                                    <div key={i} className="flex gap-2 text-[10px]" style={{ color: "hsl(42,15%,55%)" }}>
                                      <span style={{ color: "#fb923c", flexShrink: 0 }}>›</span>
                                      <span>{m}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        )}

                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Saved swales summary */}
              {designedSwales.length > 0 && (
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "#0ea5e9" }}>
                    Saved Swale Layers ({designedSwales.length})
                  </div>
                  <div className="space-y-1.5">
                    {designedSwales.map((ds) => (
                      <div key={ds.id} className="rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[11px]" style={{ background: "hsl(198, 25%, 10%)", border: "1px solid #0ea5e933" }}>
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block" style={{ color: "#38bdf8" }}>{ds.name}</span>
                          <span style={{ color: "hsl(42, 15%, 50%)" }}>{ds.elevationM.toFixed(1)} m · {ds.lengthM.toLocaleString()} m</span>
                        </div>
                        {role === "designer" && (
                          <button onClick={() => handleDeleteSavedSwale(ds.id)} className="text-[10px] px-1.5 py-0.5 rounded" style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function SidebarSection({ label, children, defaultOpen = false }: { label: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full px-4 py-3.5 flex items-center justify-between text-left"
        style={{ background: "transparent", cursor: "pointer", minHeight: "44px" }}
      >
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "hsl(84, 35%, 52%)" }}>
          {label}
        </span>
        <span
          style={{
            color: "hsl(84, 35%, 45%)",
            fontSize: 10,
            display: "inline-block",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.15s ease",
          }}
        >
          ▾
        </span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function ClientBoundaryRequest({
  hasExistingBoundary,
  areaHa,
  areaAc,
  onSubmit,
}: {
  hasExistingBoundary: boolean;
  areaHa?: number | null;
  areaAc?: number | null;
  onSubmit: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [sent, setSent] = useState(false);

  function handleSubmit() {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setSent(true);
    setText("");
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div className="space-y-2.5">
      {hasExistingBoundary && (areaHa || areaAc) && (
        <div className="rounded p-2.5" style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(103, 28%, 20%)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "hsl(84, 35%, 55%)" }}>Property Area</div>
          <div className="text-sm font-bold" style={{ color: "hsl(42, 28%, 90%)" }}>{areaHa?.toFixed(2)} ha</div>
          <div className="text-xs mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>{areaAc?.toFixed(2)} acres</div>
        </div>
      )}
      {!hasExistingBoundary && (
        <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>No boundary set yet. Request a change below.</p>
      )}
      <div>
        <div className="text-[10px] mb-1" style={{ color: "hsl(42, 15%, 55%)" }}>Request Boundary Change</div>
        <textarea
          className="w-full text-xs px-2.5 py-2 rounded border outline-none resize-none"
          style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
          rows={2}
          placeholder="Describe the boundary change you need..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim()}
          className="mt-1.5 w-full text-xs py-1.5 rounded font-medium transition-colors"
          style={{ background: "hsl(84, 38%, 42%)", color: "#fff", opacity: !text.trim() ? 0.5 : 1 }}
        >
          {sent ? "Request Sent" : "Send Request"}
        </button>
      </div>
    </div>
  );
}

function LayerToggle({
  label,
  color,
  active,
  onToggle,
  disabled = false,
}: {
  label: string;
  color: string;
  active: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      className="w-full flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 transition-colors"
      style={{
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
        background: "transparent",
        minHeight: "40px",
      }}
    >
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color, opacity: active ? 1 : 0.3 }} />
        <span className="text-[11px] truncate" style={{ color: active ? "hsl(42, 28%, 85%)" : "hsl(42, 15%, 45%)" }}>
          {label}
        </span>
      </div>
      <div
        className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
        style={{ background: active ? "hsl(84, 38%, 42%)" : "hsl(103, 30%, 20%)" }}
      >
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: active ? "18px" : "2px" }} />
      </div>
    </button>
  );
}
