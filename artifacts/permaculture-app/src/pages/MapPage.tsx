import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
// @ts-ignore
import "leaflet-draw/dist/leaflet.draw.css";
// @ts-ignore
import "leaflet-draw";
import * as turf from "@turf/turf";
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
} from "@workspace/api-client-react";
import { useAppStore, type Role } from "@/store/useAppStore";
import { generateContours } from "@/lib/contourEngine";
import { analyzeWaterPaths, type WaterAnalysisResult, type AnalyzedSwale } from "@/lib/keylineEngine";
import { OnboardingModal } from "@/components/OnboardingModal";

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

const SECTOR_TYPES = [
  { value: "custom_view",  label: "Custom View Corridor", emoji: "👁",  color: "rgba(255,215,0,0.3)",   border: "#d4a800" },
  { value: "noise",        label: "Nuisance/Road Noise",  emoji: "🔊",  color: "rgba(220,38,38,0.3)",   border: "#dc2626" },
  { value: "wind",         label: "Damaging Winds",       emoji: "💨",  color: "rgba(59,130,246,0.3)",  border: "#3b82f6" },
  { value: "winter_solar", label: "Winter Solar Arc",     emoji: "☀️",  color: "rgba(249,115,22,0.3)",  border: "#f97316" },
];

/**
 * Compute the sun's arc across the sky for a given solar declination.
 * Returns an ordered array of [lng, lat] points tracing the sun's path
 * from sunrise to sunset at the given radius from the center.
 *
 * @param declinationDeg  Solar declination in degrees:
 *   +23.45 = summer solstice, 0 = equinox, -23.45 = winter solstice
 */
function computeSolarArc(
  centerLng: number,
  centerLat: number,
  radiusKm: number,
  declinationDeg: number,
): [number, number][] {
  const φ = (centerLat * Math.PI) / 180;
  const δ = (declinationDeg * Math.PI) / 180;
  // Hour angle at sunrise/sunset: cos(H₀) = −tan(φ)·tan(δ)
  const cosH0 = -Math.tan(φ) * Math.tan(δ);
  if (cosH0 > 1) return []; // sun never rises at this declination/latitude
  const H0 = cosH0 < -1 ? Math.PI : Math.acos(cosH0);
  if (H0 < 0.01) return []; // degenerate (near-polar momentary sunrise)
  const center = turf.point([centerLng, centerLat]);
  const points: [number, number][] = [];
  const STEPS = 120;
  for (let i = 0; i <= STEPS; i++) {
    const H = -H0 + (2 * H0 * i) / STEPS; // hour angle: −H₀ (sunrise) → +H₀ (sunset)
    const sinAlt =
      Math.sin(φ) * Math.sin(δ) + Math.cos(φ) * Math.cos(δ) * Math.cos(H);
    if (sinAlt < -0.01) continue; // below horizon
    const cosAlt = Math.sqrt(Math.max(0, 1 - sinAlt * sinAlt));
    const rawCosAz =
      cosAlt < 1e-9
        ? 0
        : (Math.sin(δ) - sinAlt * Math.sin(φ)) / (cosAlt * Math.cos(φ));
    let azDeg = Math.acos(Math.max(-1, Math.min(1, rawCosAz))) * (180 / Math.PI);
    if (H > 0) azDeg = 360 - azDeg; // afternoon: mirror east→west
    const pt = turf.destination(center, radiusKm, azDeg, { units: "kilometers" });
    points.push(pt.geometry.coordinates as [number, number]);
  }
  return points;
}

/**
 * Build a filled annular band polygon for a solar arc.
 * The band spans from outerRadiusKm to innerRadiusKm at the computed
 * sunrise→sunset azimuth range for the given solar declination.
 */
function computeSolarArcBand(
  centerLng: number,
  centerLat: number,
  outerRadiusKm: number,
  innerRadiusKm: number,
  declinationDeg: number,
): GeoJSON.Polygon | null {
  const outer = computeSolarArc(centerLng, centerLat, outerRadiusKm, declinationDeg);
  const inner = computeSolarArc(centerLng, centerLat, innerRadiusKm, declinationDeg);
  if (outer.length < 2 || inner.length < 2) return null;
  // Ring: outer arc sunrise→sunset, then inner arc sunset→sunrise, close
  const ring: [number, number][] = [...outer, ...inner.slice().reverse(), outer[0]];
  return { type: "Polygon", coordinates: [ring] };
}

// Summer Sun = outer golden band, Winter Sun = inner blue-gray band.
// bandOuter / bandInner are fractions of the sector radius.
const SOLAR_ARCS = [
  {
    key: "summer",
    label: "Summer Sun",
    declination:  23.45,
    fillColor:   "rgba(228,190, 95,0.38)",
    borderColor: "#C8A43C",
    bandOuter: 1.00,
    bandInner: 0.82,
  },
  {
    key: "winter",
    label: "Winter Sun",
    declination: -23.45,
    fillColor:   "rgba(148,163,184,0.32)",
    borderColor: "#94A3B8",
    bandOuter: 0.82,
    bandInner: 0.66,
  },
];

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
  { zone: 1, label: "Zone 1 — Daily Use",         color: "#CA8A04", fillColor: "#FDE68A", fillOpacity: 0.38, hint: "Kitchen garden, herbs — most visited" },
  { zone: 2, label: "Zone 2 — Semi-Daily",         color: "#16A34A", fillColor: "#86EFAC", fillOpacity: 0.35, hint: "Orchard, small livestock, compost" },
  { zone: 3, label: "Zone 3 — Farm / Pasture",     color: "#15803D", fillColor: "#4ADE80", fillOpacity: 0.30, hint: "Crops, larger livestock, fuel plants" },
  { zone: 4, label: "Zone 4 — Semi-Wild / Timber", color: "#92400E", fillColor: "#D4A27A", fillOpacity: 0.28, hint: "Timber, foraging, managed forest" },
  { zone: 5, label: "Zone 5 — Wilderness",         color: "#475569", fillColor: "#94A3B8", fillOpacity: 0.26, hint: "No intervention — wildlife sanctuary" },
] as const;

// Default radii (km) for auto-generated concentric zones from Zone 0
const DEFAULT_ZONE_RADII_KM = [0.05, 0.14, 0.35, 0.75, 1.40];

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

function structureIcon(type: string, label: string) {
  const entry = STRUCTURE_TYPES.find((t) => t.value === type) ?? STRUCTURE_TYPES[STRUCTURE_TYPES.length - 1];
  const maxLabel = label.length > 12 ? label.slice(0, 12) + "…" : label;
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
  const { role, setRole, activePropertyId, setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const boundaryLayerRef = useRef<L.GeoJSON | null>(null);
  const contourLayerRef = useRef<L.GeoJSON | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup | null>(null);
  const drawPolygonHandlerRef = useRef<any>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const pendingPinMarkerRef = useRef<L.Marker | null>(null);
  const structureMarkersRef = useRef<L.Marker[]>([]);
  const pendingStructureMarkerRef = useRef<L.Marker | null>(null);
  const sectorLayersRef = useRef<Map<string, L.GeoJSON>>(new Map());
  const sectorPreviewLayerRef = useRef<L.GeoJSON | null>(null);
  const sectorCenterMarkerRef = useRef<L.Marker | null>(null);
  const solarArcLayersRef = useRef<L.Layer[]>([]);
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

  const [mapboxToken, setMapboxToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  const [showSatellite, setShowSatellite] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showContours, setShowContours] = useState(false);
  const [showPathways, setShowPathways] = useState(true);
  const [drawPathwayMode, setDrawPathwayMode] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [zoneAuditWarning, setZoneAuditWarning] = useState<string | null>(null);
  const [pendingPathway, setPendingPathway] = useState<GeoJSON.LineString | null>(null);
  const [pathwayLabel, setPathwayLabel] = useState("");
  const [pathwayType, setPathwayType] = useState("footpath");
  const [showStructures, setShowStructures] = useState(true);
  const [dropStructureMode, setDropStructureMode] = useState(false);
  const [drawBuildingOutlineMode, setDrawBuildingOutlineMode] = useState(false);
  const [pendingStructure, setPendingStructure] = useState<{ lng: number; lat: number } | null>(null);
  const [pendingFootprint, setPendingFootprint] = useState<GeoJSON.Polygon | null>(null);
  const [structureLabel, setStructureLabel] = useState("");
  const [structureType, setStructureType] = useState("house");
  const [showSectors, setShowSectors] = useState(true);
  const [showSolarArcs, setShowSolarArcs] = useState(true);
  const [dropSectorCenterMode, setDropSectorCenterMode] = useState(false);
  const [sectorCenter, setSectorCenter] = useState<{ lng: number; lat: number } | null>(null);
  const [sectorDraft, setSectorDraft] = useState({ sectorType: "custom_view", radiusKm: 0.5, startAngle: 0, endAngle: 90, label: "" });
  const [editingSectorId, setEditingSectorId] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
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

  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();
  const createStructure = useCreateStructure();
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
  const bulkReplaceZones = useBulkReplaceZones();
  const deleteZone = useDeleteZone();

  // ─── FETCH TOKEN ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMapboxToken().then(setMapboxToken);
  }, []);

  // ─── MAP INITIALIZATION ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current || !mapboxToken || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [-33, 147],
      zoom: 4,
      zoomControl: false,
    });

    // Mapbox satellite raster tiles — no WebGL required
    const tileLayer = L.tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
      {
        tileSize: 512,
        zoomOffset: -1,
        maxZoom: 20,
        attribution: '© <a href="https://www.mapbox.com">Mapbox</a> © <a href="https://www.openstreetmap.org">OpenStreetMap</a>',
      }
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
      shapeOptions: { color: "#2D6A1A", weight: 2, fillColor: "#2D6A1A", fillOpacity: 0.12 },
      allowIntersection: false,
    });
    drawPolygonHandlerRef.current = polygonHandler;

    // Building outline polygon handler — black stroke, light fill
    const buildingPolygonHandler = new PolygonHandler(map, {
      shapeOptions: { color: "#000", weight: 2.5, opacity: 1, fillColor: "#000", fillOpacity: 0.06 },
      allowIntersection: false,
    });
    buildingPolygonHandlerRef.current = buildingPolygonHandler;

    // Pathway polyline handler
    const PolylineHandler = (L as any).Draw.Polyline;
    const pathwayPolylineHandler = new PolylineHandler(map, {
      shapeOptions: { color: "#8B6914", weight: 3, opacity: 0.9 },
      allowIntersection: true,
    });
    pathwayPolylineHandlerRef.current = pathwayPolylineHandler;

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
      } else if (pathwayDrawActiveRef.current) {
        pathwayDrawActiveRef.current = false;
        const geometry = feature.geometry as GeoJSON.LineString;
        setPendingPathway(geometry);
        setDrawPathwayMode(false);
      } else {
        drawnItems.clearLayers();
        drawnItems.addLayer(layer as L.Polygon);
        const geometry = feature.geometry as GeoJSON.Polygon;
        setPendingBoundary(geometry);
        const ha = turf.area(feature) / 10000;
        setPendingAreaHa(ha);
        setPendingAreaAc(ha * 2.47105);
      }
    });

    mapRef.current = map;
    setMapLoaded(true);

    return () => {
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      drawPolygonHandlerRef.current = null;
      setMapLoaded(false);
    };
  }, [mapboxToken]);

  // ─── ROLE CHANGE — disable draw in client mode ─────────────────────────────
  useEffect(() => {
    if (!mapLoaded) return;
    if (role !== "designer") drawPolygonHandlerRef.current?.disable();
  }, [role, mapLoaded]);

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
      })
      .catch(console.error)
      .finally(() => setIsGeneratingContours(false));
  }, [showContours, activeProperty?.id, activeProperty?.boundaryGeojson, mapLoaded, mapboxToken]);

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
    buildingDrawActiveRef.current = true;
    buildingPolygonHandlerRef.current?.enable();
    return () => {
      buildingDrawActiveRef.current = false;
      buildingPolygonHandlerRef.current?.disable();
    };
  }, [drawBuildingOutlineMode, mapLoaded]);

  // ─── PATHWAY DRAW MODE ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !drawPathwayMode) return;
    pathwayDrawActiveRef.current = true;
    pathwayPolylineHandlerRef.current?.enable();
    return () => {
      pathwayDrawActiveRef.current = false;
      pathwayPolylineHandlerRef.current?.disable();
    };
  }, [drawPathwayMode, mapLoaded]);

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
      const marker = L.marker([s.lat, s.lng], { icon: structureIcon(s.structureType, s.label) });

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
  }, [structures, activePropertyId, mapLoaded, role, showStructures, handleDeleteStructure]);

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
    if (!showZones || !activePropertyId || zones.length === 0) return;
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
  }, [zones, showZones, activePropertyId, mapLoaded, role]);

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

  // ─── SOLAR ARCS (Summer Solstice / Equinox / Winter Solstice) ───────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    solarArcLayersRef.current.forEach((l) => map.removeLayer(l));
    solarArcLayersRef.current = [];
    if (!sectorCenter || !showSolarArcs) return;
    const { radiusKm } = sectorDraft;
    SOLAR_ARCS.forEach(({ declination, fillColor, borderColor, bandOuter, bandInner }) => {
      const polygon = computeSolarArcBand(
        sectorCenter.lng,
        sectorCenter.lat,
        radiusKm * bandOuter,
        radiusKm * bandInner,
        declination,
      );
      if (!polygon) return;
      const feature: GeoJSON.Feature = { type: "Feature", geometry: polygon, properties: {} };
      const layer = L.geoJSON(feature as any, {
        style: () => ({
          color: borderColor,
          weight: 1,
          opacity: 0.7,
          fillColor,
          fillOpacity: 1,
        }),
      }).addTo(map);
      solarArcLayersRef.current.push(layer);
    });
  }, [sectorCenter, sectorDraft.radiusKm, showSolarArcs, mapLoaded]);

  // ─── SAVED SECTORS RENDERING ──────────────────────────────────────────────
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    sectorLayersRef.current.forEach((layer) => map.removeLayer(layer));
    sectorLayersRef.current.clear();
    if (!activePropertyId || !showSectors) return;
    sectors.forEach((s) => {
      const feature = sectorWedge(s.centerLng, s.centerLat, s.radiusKm, s.startAngle, s.endAngle);
      if (!feature) return;
      const st = SECTOR_TYPES.find((t) => t.value === s.sectorType) ?? SECTOR_TYPES[0];
      const el = document.createElement("div");
      el.innerHTML = `
        <div style="font-size:12px;padding:2px 4px;min-width:140px;max-width:220px;">
          <div style="font-weight:700;color:#111;margin-bottom:2px;">${st.emoji} ${s.label || st.label}</div>
          <div style="font-size:10px;color:#555;margin-bottom:2px;">${st.label} · R=${s.radiusKm}km · ${s.startAngle}°→${s.endAngle}°</div>
          ${role === "designer" ? `<button class="del-btn" style="margin-top:4px;padding:2px 8px;border:1px solid #c00;color:#c00;border-radius:3px;cursor:pointer;font-size:10px;background:none;">Delete</button>` : ""}
        </div>`;
      const layer = L.geoJSON(feature as any, {
        style: () => ({ color: st.border, weight: 1.5, fillColor: st.border, fillOpacity: 0.28, opacity: 0.8 }),
      });
      layer.bindPopup(el);
      el.querySelector(".del-btn")?.addEventListener("click", () => { handleDeleteSector(s.id); layer.closePopup(); });
      layer.addTo(map);
      sectorLayersRef.current.set(s.id, layer);
    });
  }, [sectors, activePropertyId, mapLoaded, role, showSectors, handleDeleteSector]);

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
    map.flyTo([lat, lng], 14);
    setSearchQuery(result.place_name ?? "");
    setShowDropdown(false);
    setSearchResults([]);
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
          setShowOnboarding(true);
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
    createStructure.mutate(
      {
        propertyId: activePropertyId,
        data: {
          lng: pendingStructure.lng,
          lat: pendingStructure.lat,
          label: structureLabel.trim(),
          structureType,
          footprintGeojson: pendingFootprint ? JSON.stringify(pendingFootprint) : null,
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
  function handleGenerateZones() {
    if (!activePropertyId || !sectorCenter) return;
    const zoneInputs = DEFAULT_ZONE_RADII_KM.map((r, i) => ({
      zoneNumber: i + 1,
      zoneGeojson: JSON.stringify(
        turf.circle([sectorCenter.lng, sectorCenter.lat], r, { units: "kilometers", steps: 64 }).geometry,
      ),
    }));
    bulkReplaceZones.mutate(
      { propertyId: activePropertyId, data: zoneInputs },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListZonesQueryKey(activePropertyId) }) },
    );
  }

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
      {/* ── SIDEBAR ── */}
      <aside
        className="w-72 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ background: "hsl(103, 48%, 11%)", borderRight: "1px solid hsl(103, 35%, 18%)" }}
      >
        {/* Header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-tight" style={{ color: "hsl(42, 28%, 90%)" }}>PermaMap</h1>
              <p className="text-[10px] mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>Permaculture Design Studio</p>
            </div>
            <button
              onClick={() => navigate("/properties")}
              title="All Properties"
              className="p-1.5 rounded transition-colors"
              style={{ color: "hsl(42, 15%, 55%)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
              </svg>
            </button>
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
                {r === "designer" ? "Designer" : "Client"} Mode
              </button>
            ))}
          </div>
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
        </div>

        {/* ── LAYER VISIBILITY ── */}
        <SidebarSection label="Layer Visibility">
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
          </div>
          {isGeneratingContours && (
            <div className="flex items-center gap-2 mt-2.5">
              <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#ef4444" }} />
              <span className="text-[10px]" style={{ color: "hsl(42, 15%, 55%)" }}>Fetching elevation tiles...</span>
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 1: BOUNDARY ── */}
        <SidebarSection label="Layer 1 — Property Boundary">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to manage its boundary.</p>
          ) : role === "designer" ? (
            <div className="space-y-2.5">
              <button
                onClick={() => drawPolygonHandlerRef.current?.enable()}
                className="w-full text-xs px-3 py-2 rounded font-medium text-left transition-colors"
                style={{ background: "hsl(103, 35%, 17%)", border: "1px solid hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
              >
                Draw Property Boundary
              </button>

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
                <input type="range" min="0.05" max="5" step="0.05"
                  className="w-full h-1.5 rounded appearance-none"
                  style={{ accentColor: "#84cc16" }}
                  value={sectorDraft.radiusKm}
                  onChange={(e) => setSectorDraft((d) => ({ ...d, radiusKm: parseFloat(e.target.value) }))}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-medium mb-1 block" style={{ color: "hsl(42, 15%, 55%)" }}>Start °</label>
                  <input type="number" min="0" max="360"
                    className="w-full text-xs px-2 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    value={sectorDraft.startAngle}
                    onChange={(e) => setSectorDraft((d) => ({ ...d, startAngle: Math.min(360, Math.max(0, parseInt(e.target.value) || 0)) }))}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-medium mb-1 block" style={{ color: "hsl(42, 15%, 55%)" }}>End °</label>
                  <input type="number" min="0" max="360"
                    className="w-full text-xs px-2 py-1.5 rounded border outline-none"
                    style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
                    value={sectorDraft.endAngle}
                    onChange={(e) => setSectorDraft((d) => ({ ...d, endAngle: Math.min(360, Math.max(0, parseInt(e.target.value) || 0)) }))}
                  />
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
              {SOLAR_ARCS.map(({ key, label, fillColor, borderColor }) => (
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

        {/* ── LAYER 4: WATER AUTOMATION ── */}
        <SidebarSection label="Layer 4 — Water Automation">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Select a property to run water analysis.</p>
          ) : !activeProperty?.boundaryGeojson ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Draw a property boundary first to enable water analysis.</p>
          ) : !contourDataRef.current ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>Enable and load terrain contours (Layer 2) to unlock water analysis.</p>
          ) : (
            <div className="space-y-3">

              {/* ── Keyline Dam Locator ── */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#06b6d4" }}>
                  Keyline Dam Locator
                </div>
                <p className="text-[10px] mb-2" style={{ color: "hsl(42, 15%, 55%)" }}>
                  Detects the Yeomans inflection point — where valley contours narrow then spread — and pins the optimal dam site.
                </p>
                {role === "designer" && (
                  <button
                    onClick={handleRunWaterAnalysis}
                    disabled={isAnalyzing}
                    className="w-full text-xs px-3 py-2 rounded font-medium transition-colors flex items-center justify-center gap-2"
                    style={{
                      background: isAnalyzing ? "hsl(103, 20%, 20%)" : "hsl(198, 80%, 22%)",
                      border: "1px solid hsl(198, 60%, 30%)",
                      color: "hsl(42, 28%, 88%)",
                      opacity: isAnalyzing ? 0.6 : 1,
                    }}
                  >
                    {isAnalyzing ? (
                      <>
                        <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "#06b6d4" }} />
                        Analysing contours…
                      </>
                    ) : (
                      "💧 Run Keyline Analysis"
                    )}
                  </button>
                )}
                {waterAnalysis?.damSite && (
                  <div className="mt-2 rounded p-2 text-[10px] space-y-0.5" style={{ background: "hsl(198, 40%, 12%)", border: "1px solid hsl(198, 40%, 20%)" }}>
                    <div className="font-semibold" style={{ color: "#38bdf8" }}>💧 Keyline Dam Site found</div>
                    <div style={{ color: "hsl(42, 15%, 65%)" }}>Elevation: <span style={{ color: "#e2d5b5" }}>{waterAnalysis.damSite.properties.elevation.toFixed(1)} m</span></div>
                    <div style={{ color: "hsl(42, 15%, 65%)" }}>Inter-contour gap: <span style={{ color: "#e2d5b5" }}>{waterAnalysis.damSite.properties.interContourSpacingM} m</span></div>
                    <div style={{ color: "hsl(42, 15%, 50%)" }}>Click the 💧 marker on the map for details.</div>
                  </div>
                )}
                {waterAnalysis && !waterAnalysis.damSite && (
                  <div className="mt-2 text-[10px] rounded p-2" style={{ background: "hsl(30, 30%, 12%)", color: "hsl(42, 15%, 55%)" }}>
                    Not enough contour variation to detect a valley inflection. Try a property with more relief.
                  </div>
                )}
              </div>

              {/* ── Optimal Water Lines ── */}
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#22c55e" }}>
                  Optimal Water Lines
                </div>

                {/* min uphill threshold */}
                <div className="mb-2">
                  <label className="text-[10px] flex items-center justify-between mb-1" style={{ color: "hsl(42, 15%, 55%)" }}>
                    <span>Min uphill area</span>
                    <span style={{ color: "#e2d5b5" }}>{minUphillAcres.toFixed(2)} ac</span>
                  </label>
                  <input
                    type="range"
                    min={0.1}
                    max={5}
                    step={0.1}
                    value={minUphillAcres}
                    onChange={(e) => setMinUphillAcres(parseFloat(e.target.value))}
                    className="w-full h-1.5 rounded appearance-none cursor-pointer"
                    style={{ accentColor: "#06b6d4" }}
                  />
                </div>

                {role === "designer" && (
                  <button
                    onClick={() => {
                      if (!waterAnalysis) handleRunWaterAnalysis();
                      setWaterHighlightsActive((v) => !v);
                    }}
                    className="w-full text-xs px-3 py-2 rounded font-medium transition-colors"
                    style={{
                      background: waterHighlightsActive ? "hsl(142, 50%, 18%)" : "hsl(103, 35%, 17%)",
                      border: `1px solid ${waterHighlightsActive ? "#15803d" : "hsl(103, 30%, 22%)"}`,
                      color: "hsl(42, 28%, 88%)",
                    }}
                  >
                    {waterHighlightsActive ? "✓ Highlights On — Click to Hide" : "✦ Highlight Optimal Water Lines"}
                  </button>
                )}

                {waterAnalysis && waterHighlightsActive && (
                  <div className="mt-2.5 space-y-2">
                    {/* Longest swales */}
                    {waterAnalysis.longestSwales.length > 0 && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider mb-1 font-semibold" style={{ color: "#15803d" }}>
                          Top {waterAnalysis.longestSwales.length} Longest Swales
                        </div>
                        {waterAnalysis.longestSwales.map((swale, i) => (
                          <div key={i} className="rounded p-1.5 mb-1 text-[10px]" style={{ background: "hsl(142, 30%, 10%)", border: "1px solid #15803d33" }}>
                            <div className="flex items-center justify-between mb-0.5">
                              <span style={{ color: "#4ade80" }}>#{swale.properties.rank} · {swale.properties.lengthM.toLocaleString()} m</span>
                              <span style={{ color: "hsl(42, 15%, 55%)" }}>{swale.properties.elevation.toFixed(1)} m elev</span>
                            </div>
                            {role === "designer" && (
                              <button
                                onClick={() => handleConvertToSwale(swale, `Longest Swale #${swale.properties.rank} (${swale.properties.elevation.toFixed(0)}m)`)}
                                className="mt-1 w-full text-[9px] px-2 py-1 rounded transition-colors"
                                style={{ background: "hsl(142, 35%, 14%)", border: "1px solid #15803d", color: "#4ade80" }}
                              >
                                Save to Swale Layer
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Highest swale */}
                    {waterAnalysis.highestSwale && (
                      <div>
                        <div className="text-[9px] uppercase tracking-wider mb-1 font-semibold" style={{ color: "#06b6d4" }}>
                          Highest Practical Swale
                        </div>
                        <div className="rounded p-1.5 text-[10px]" style={{ background: "hsl(198, 30%, 10%)", border: "1px solid #06b6d433" }}>
                          <div className="flex items-center justify-between mb-0.5">
                            <span style={{ color: "#67e8f9" }}>{waterAnalysis.highestSwale.properties.lengthM.toLocaleString()} m long</span>
                            <span style={{ color: "hsl(42, 15%, 55%)" }}>{waterAnalysis.highestSwale.properties.elevation.toFixed(1)} m elev</span>
                          </div>
                          <div style={{ color: "hsl(42, 15%, 55%)" }}>
                            ~{waterAnalysis.highestSwale.properties.uphillAreaAcres} ac uphill
                          </div>
                          {role === "designer" && (
                            <button
                              onClick={() => handleConvertToSwale(
                                waterAnalysis.highestSwale!,
                                `Highest Practical Swale (${waterAnalysis.highestSwale!.properties.elevation.toFixed(0)}m)`,
                              )}
                              className="mt-1 w-full text-[9px] px-2 py-1 rounded transition-colors"
                              style={{ background: "hsl(198, 35%, 14%)", border: "1px solid #06b6d4", color: "#67e8f9" }}
                            >
                              Save to Swale Layer
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {waterAnalysis.longestSwales.length === 0 && !waterAnalysis.highestSwale && (
                      <div className="text-[10px] rounded p-2" style={{ background: "hsl(30, 30%, 12%)", color: "hsl(42, 15%, 55%)" }}>
                        No interior contour lines detected. The contours may all clip the boundary edge on this property.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* ── Saved Swale Layers ── */}
              {designedSwales.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#0ea5e9" }}>
                    Saved Swale Layers ({designedSwales.length})
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
                            className="shrink-0 text-[9px] px-1.5 py-0.5 rounded transition-colors"
                            style={{ border: "1px solid #c00", color: "#f87171", background: "none" }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Client note ── */}
              {role === "client" && (
                <p className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>
                  Water paths are highlighted on the map. Use the feedback pins (Layer 5) to drop comments directly onto proposed swale lines.
                </p>
              )}
            </div>
          )}
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
                    {drawBuildingOutlineMode ? "Click points on map · double-click to finish" : "⬛ Draw Building Outline"}
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
              {structures.length > 0 && !pendingStructure && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {structures.length} {structures.length === 1 ? "Structure" : "Structures"}
                  </div>
                  <div className="space-y-1 max-h-44 overflow-y-auto">
                    {structures.map((s) => {
                      const entry = STRUCTURE_TYPES.find((t) => t.value === s.structureType);
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span className="text-sm">{entry?.emoji ?? "📍"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{entry?.label ?? s.structureType}</div>
                          </div>
                          <button onClick={() => handleDeleteStructure(s.id)} className="text-[10px] flex-shrink-0" style={{ color: "hsl(0, 55%, 50%)" }}>
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
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
                      return (
                        <div key={s.id} className="flex items-center gap-2 px-2 py-1.5 rounded" style={{ background: "hsl(103, 35%, 14%)" }}>
                          <span className="text-sm">{entry?.emoji ?? "📍"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="text-[11px] font-medium truncate" style={{ color: "hsl(42, 28%, 85%)" }}>{s.label}</div>
                            <div className="text-[10px]" style={{ color: "hsl(42, 15%, 50%)" }}>{entry?.label ?? s.structureType}</div>
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
                  {drawPathwayMode ? "Click points on map · double-click to finish" : "✏ Draw Access or Pathway"}
                </button>
              )}
              {pathways.length > 0 && !pendingPathway && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
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
              {/* Zone visibility toggle */}
              <div className="flex items-center justify-between">
                <span className="text-[11px]" style={{ color: "hsl(42, 20%, 70%)" }}>Zone polygons</span>
                <button
                  onClick={() => setShowZones((v) => !v)}
                  className="text-[10px] px-2 py-0.5 rounded border"
                  style={{
                    borderColor: showZones ? "hsl(84, 38%, 38%)" : "hsl(103, 30%, 22%)",
                    color: showZones ? "hsl(84, 55%, 65%)" : "hsl(42, 15%, 50%)",
                    background: "transparent",
                  }}
                >
                  {showZones ? "Visible" : "Hidden"}
                </button>
              </div>

              {/* Zone legend */}
              <div className="space-y-1">
                {ZONE_STYLES.map((s) => (
                  <div key={s.zone} className="flex items-center gap-2">
                    <span style={{
                      display: "inline-block",
                      width: 14,
                      height: 14,
                      background: s.fillColor,
                      border: `1.5px solid ${s.color}`,
                      borderRadius: 2,
                      flexShrink: 0,
                      opacity: 0.85,
                    }} />
                    <span className="text-[10px]" style={{ color: "hsl(42, 15%, 60%)" }}>{s.label}</span>
                  </div>
                ))}
              </div>

              {role === "designer" && (
                <>
                  {/* Generate default zones — requires Zone 0 (sector center) */}
                  <button
                    onClick={handleGenerateZones}
                    disabled={!sectorCenter || bulkReplaceZones.isPending}
                    title={!sectorCenter ? "Place Zone 0 center in Layer 3 first" : ""}
                    className="w-full text-xs px-3 py-2 rounded font-medium"
                    style={{
                      background: sectorCenter ? "hsl(84, 38%, 30%)" : "hsl(103, 25%, 18%)",
                      border: "1px solid hsl(103, 30%, 22%)",
                      color: sectorCenter ? "hsl(84, 55%, 80%)" : "hsl(42, 15%, 40%)",
                      cursor: sectorCenter ? "pointer" : "not-allowed",
                    }}
                  >
                    {bulkReplaceZones.isPending ? "Generating…" : !sectorCenter ? "⚠ Place Zone 0 center first" : "Generate Default Zones"}
                  </button>

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

              <p className="text-[10px]" style={{ color: "hsl(42, 15%, 40%)" }}>
                Zones radiate from Zone 0 (house). Generate using the Zone 0 center placed in Layer 3.
              </p>
            </div>
          )}
        </SidebarSection>

        <div className="flex-1" />
      </aside>

      {/* ── MAP ── */}
      <div className="flex-1 relative">
        <div ref={mapContainerRef} className="absolute inset-0" />
        {!mapLoaded && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "hsl(103, 18%, 8%)" }}>
            <div className="flex flex-col items-center gap-3">
              <div className="w-7 h-7 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(84, 38%, 42%)" }} />
              <span className="text-sm" style={{ color: "hsl(42, 20%, 55%)" }}>Loading map...</span>
            </div>
          </div>
        )}
      </div>

      {/* ── ONBOARDING MODAL ── */}
      {showOnboarding && activePropertyId && activeProperty?.boundaryGeojson && (
        <OnboardingModal
          propertyId={activePropertyId}
          propertyName={activeProperty.name}
          boundaryGeojson={activeProperty.boundaryGeojson as unknown as GeoJSON.Polygon}
          onClose={() => setShowOnboarding(false)}
        />
      )}
    </div>
  );
}

// ─── SUBCOMPONENTS ────────────────────────────────────────────────────────────

function SidebarSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
      <div className="text-[10px] font-semibold uppercase tracking-widest mb-2.5" style={{ color: "hsl(84, 35%, 52%)" }}>
        {label}
      </div>
      {children}
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
    <div className="flex items-center justify-between gap-2" style={{ opacity: disabled ? 0.4 : 1 }}>
      <div className="flex items-center gap-2 min-w-0">
        <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ background: color, opacity: active ? 1 : 0.3 }} />
        <span className="text-[11px] truncate" style={{ color: active ? "hsl(42, 28%, 85%)" : "hsl(42, 15%, 45%)" }}>
          {label}
        </span>
      </div>
      <button
        onClick={disabled ? undefined : onToggle}
        className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
        style={{ background: active ? "hsl(84, 38%, 42%)" : "hsl(103, 30%, 20%)", cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: active ? "18px" : "2px" }} />
      </button>
    </div>
  );
}
