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
  getListPropertiesQueryKey,
  getGetPropertyQueryKey,
  getListCommentsQueryKey,
} from "@workspace/api-client-react";
import { useAppStore, type Role } from "@/store/useAppStore";
import { generateContours } from "@/lib/contourEngine";

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

  const [mapboxToken, setMapboxToken] = useState("");
  const [mapLoaded, setMapLoaded] = useState(false);

  const [showSatellite, setShowSatellite] = useState(true);
  const [showBoundary, setShowBoundary] = useState(true);
  const [showContours, setShowContours] = useState(false);
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

  const createProperty = useCreateProperty();
  const updateProperty = useUpdateProperty();
  const createComment = useCreateComment();
  const deleteComment = useDeleteComment();

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

    map.on((L as any).Draw.Event.CREATED, (e: any) => {
      const layer = e.layer as L.Polygon;
      drawnItems.clearLayers();
      drawnItems.addLayer(layer);
      const feature = layer.toGeoJSON();
      const geometry = feature.geometry as GeoJSON.Polygon;
      setPendingBoundary(geometry);
      const ha = turf.area(feature) / 10000;
      setPendingAreaHa(ha);
      setPendingAreaAc(ha * 2.47105);
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
                onClick={() => { setRole(r); setDropPinMode(false); setPendingPin(null); }}
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

        {/* ── LAYER 3: FEEDBACK PINS ── */}
        <SidebarSection label="Layer 3 — Feedback Pins">
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
