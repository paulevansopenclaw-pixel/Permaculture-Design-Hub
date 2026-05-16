import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import mapboxgl from "mapbox-gl";
// @ts-ignore
import MapboxDraw from "@mapbox/mapbox-gl-draw";
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

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string;
mapboxgl.accessToken = MAPBOX_TOKEN;

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

// Geocoding search
async function searchAddress(query: string) {
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&types=address,place,locality,district,country&limit=5`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.features ?? [];
}

export default function MapPage() {
  const [, navigate] = useLocation();
  const { role, setRole, activePropertyId, setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  // Map refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<InstanceType<typeof MapboxDraw> | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const pendingPinMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const hoverPopupRef = useRef<mapboxgl.Popup | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [webglError, setWebglError] = useState(false);

  // UI state
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

  // API
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

  // ─── MAP INITIALIZATION ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainerRef.current) return;

    let map: mapboxgl.Map;
    let hoverPopup: mapboxgl.Popup;

    try {
      map = new mapboxgl.Map({
        container: mapContainerRef.current,
        style: "mapbox://styles/mapbox/satellite-streets-v12",
        center: [0, 20],
        zoom: 2,
        attributionControl: false,
      });
    } catch {
      setWebglError(true);
      return;
    }

    map.addControl(new mapboxgl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new mapboxgl.NavigationControl(), "bottom-right");
    map.addControl(new mapboxgl.ScaleControl({ unit: "metric" }), "bottom-left");

    hoverPopup = new mapboxgl.Popup({
      closeButton: false,
      closeOnClick: false,
      offset: 5,
    });
    hoverPopupRef.current = hoverPopup;

    map.on("load", () => {
      map.addSource("boundary", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "boundary-fill",
        type: "fill",
        source: "boundary",
        paint: { "fill-color": "#2D6A1A", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "boundary-line",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#2D6A1A", "line-width": 2, "line-opacity": 0.9 },
      });

      map.addSource("contours", { type: "geojson", data: EMPTY_FC });
      map.addLayer({
        id: "contour-lines",
        type: "line",
        source: "contours",
        paint: { "line-color": "#8B6914", "line-width": 0.7, "line-opacity": 0.55 },
      });

      map.on("mousemove", "contour-lines", (e) => {
        map.getCanvas().style.cursor = "pointer";
        const features = e.features;
        if (features && features.length > 0) {
          const elev = features[0].properties?.elevation;
          if (elev != null) {
            hoverPopup
              .setLngLat(e.lngLat)
              .setHTML(`<div style="font-size:12px;font-weight:500">${Math.round(elev)} m</div>`)
              .addTo(map);
          }
        }
      });
      map.on("mouseleave", "contour-lines", () => {
        map.getCanvas().style.cursor = "";
        hoverPopup.remove();
      });

      setMapLoaded(true);
    });

    mapRef.current = map;
    return () => {
      hoverPopup?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ─── DRAW CONTROL (role-dependent) ────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (role === "designer") {
      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: { polygon: true, trash: true },
        styles: [
          {
            id: "gl-draw-polygon-fill",
            type: "fill",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            paint: { "fill-color": "#2D6A1A", "fill-opacity": 0.15 },
          },
          {
            id: "gl-draw-polygon-stroke",
            type: "line",
            filter: ["all", ["==", "$type", "Polygon"], ["!=", "mode", "static"]],
            paint: { "line-color": "#2D6A1A", "line-width": 2 },
          },
          {
            id: "gl-draw-point",
            type: "circle",
            filter: ["all", ["==", "$type", "Point"], ["==", "meta", "vertex"]],
            paint: { "circle-radius": 5, "circle-color": "#2D6A1A" },
          },
        ],
      });

      map.addControl(draw, "top-right");
      drawRef.current = draw;

      const handleDrawCreate = (e: any) => {
        const feature = e.features[0];
        if (!feature || feature.geometry.type !== "Polygon") return;
        const areaM2 = turf.area(feature);
        const ha = areaM2 / 10000;
        const ac = areaM2 / 4046.856;
        setPendingBoundary(feature.geometry as GeoJSON.Polygon);
        setPendingAreaHa(Math.round(ha * 100) / 100);
        setPendingAreaAc(Math.round(ac * 100) / 100);
      };

      const handleDrawUpdate = (e: any) => {
        const feature = e.features[0];
        if (!feature || feature.geometry.type !== "Polygon") return;
        const areaM2 = turf.area(feature);
        const ha = areaM2 / 10000;
        const ac = areaM2 / 4046.856;
        setPendingBoundary(feature.geometry as GeoJSON.Polygon);
        setPendingAreaHa(Math.round(ha * 100) / 100);
        setPendingAreaAc(Math.round(ac * 100) / 100);
      };

      const handleDrawDelete = () => {
        setPendingBoundary(null);
        setPendingAreaHa(null);
        setPendingAreaAc(null);
      };

      map.on("draw.create", handleDrawCreate);
      map.on("draw.update", handleDrawUpdate);
      map.on("draw.delete", handleDrawDelete);

      return () => {
        map.off("draw.create", handleDrawCreate);
        map.off("draw.update", handleDrawUpdate);
        map.off("draw.delete", handleDrawDelete);
        if (drawRef.current) {
          try { map.removeControl(draw); } catch { /* already removed */ }
          drawRef.current = null;
        }
        setPendingBoundary(null);
        setPendingAreaHa(null);
        setPendingAreaAc(null);
      };
    }
    return;
  }, [role, mapLoaded]);

  // ─── BOUNDARY LAYER ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource("boundary") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    const geojson = activeProperty?.boundaryGeojson;
    if (geojson) {
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: geojson as unknown as GeoJSON.Geometry, properties: {} }],
      };
      source.setData(fc);
      try {
        const bbox = turf.bbox(geojson as unknown as turf.AllGeoJSON);
        map.fitBounds([bbox[0], bbox[1], bbox[2], bbox[3]], { padding: 80, maxZoom: 16 });
      } catch { /* bad geometry */ }
    } else {
      source.setData(EMPTY_FC);
    }
  }, [activeProperty, mapLoaded]);

  // ─── CONTOUR GENERATION ───────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const source = map.getSource("contours") as mapboxgl.GeoJSONSource | undefined;
    if (!source) return;

    if (!showContours || !activeProperty?.boundaryGeojson) {
      source.setData(EMPTY_FC);
      return;
    }

    setIsGeneratingContours(true);
    generateContours(
      { type: "Feature", geometry: activeProperty.boundaryGeojson as unknown as GeoJSON.Geometry, properties: {} },
      MAPBOX_TOKEN,
    )
      .then((fc) => {
        const s = mapRef.current?.getSource("contours") as mapboxgl.GeoJSONSource | undefined;
        if (s) s.setData(fc);
      })
      .catch(console.error)
      .finally(() => setIsGeneratingContours(false));
    return;
  }, [showContours, activeProperty?.id, activeProperty?.boundaryGeojson, mapLoaded]);

  // ─── DROP-PIN CURSOR ──────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (role === "client" && dropPinMode) {
      const canvas = map.getCanvas();
      canvas.style.cursor = "crosshair";

      const handleClick = (e: mapboxgl.MapMouseEvent) => {
        setPendingPin({ lng: e.lngLat.lng, lat: e.lngLat.lat });
        setPinText("");
        setDropPinMode(false);
      };

      map.once("click", handleClick);
      return () => {
        canvas.style.cursor = "";
        map.off("click", handleClick);
      };
    }
    return;
  }, [role, dropPinMode, mapLoaded]);

  // ─── PENDING PIN MARKER ────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (pendingPinMarkerRef.current) {
      pendingPinMarkerRef.current.remove();
      pendingPinMarkerRef.current = null;
    }

    if (pendingPin) {
      const el = document.createElement("div");
      el.className = "comment-marker-el";
      el.style.background = "#f59e0b";
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([pendingPin.lng, pendingPin.lat])
        .addTo(map);
      pendingPinMarkerRef.current = marker;
    }

    return () => {
      if (pendingPinMarkerRef.current) {
        pendingPinMarkerRef.current.remove();
        pendingPinMarkerRef.current = null;
      }
    };
  }, [pendingPin, mapLoaded]);

  // ─── COMMENT MARKERS ──────────────────────────────────────────────────────
  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!activePropertyId) return;
      deleteComment.mutate(
        { propertyId: activePropertyId, commentId },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getListCommentsQueryKey(activePropertyId),
            });
          },
        },
      );
    },
    [activePropertyId, deleteComment, queryClient],
  );

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Remove old markers
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (!activePropertyId || !comments.length) return;

    const newMarkers = comments.map((comment) => {
      const el = document.createElement("div");
      el.className = "comment-marker-el";

      const deleteBtn =
        role === "designer"
          ? `<button id="del-${comment.id}" style="display:block;margin-top:8px;color:#dc2626;background:none;border:none;cursor:pointer;font-size:11px;padding:0;">Delete pin</button>`
          : "";

      const popup = new mapboxgl.Popup({ offset: 18, maxWidth: "220px" }).setHTML(
        `<div style="font-family:system-ui,sans-serif">
          <div style="font-size:10px;color:#888;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">${comment.authorRole}</div>
          <div style="font-size:13px;line-height:1.4">${comment.text}</div>
          ${deleteBtn}
        </div>`,
      );

      popup.on("open", () => {
        const btn = document.getElementById(`del-${comment.id}`);
        if (btn) btn.onclick = () => handleDeleteComment(comment.id);
      });

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([comment.lng, comment.lat])
        .setPopup(popup)
        .addTo(map);

      return marker;
    });

    markersRef.current = newMarkers;
  }, [comments, activePropertyId, mapLoaded, role, handleDeleteComment]);

  // ─── GEOCODING SEARCH ────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchAddress(searchQuery);
      setSearchResults(results);
      setShowDropdown(results.length > 0);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  function flyToResult(result: any) {
    const map = mapRef.current;
    if (!map) return;
    const [lng, lat] = result.center;
    map.flyTo({ center: [lng, lat], zoom: 14, duration: 1500 });
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
          if (drawRef.current) drawRef.current.deleteAll();
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
        data: {
          lng: pendingPin.lng,
          lat: pendingPin.lat,
          text: pinText.trim(),
          authorRole: "client",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getListCommentsQueryKey(activePropertyId),
          });
          setPendingPin(null);
          setPinText("");
        },
      },
    );
  }

  // ─── SEND BOUNDARY REQUEST (CLIENT) ───────────────────────────────────────
  function handleBoundaryRequest(text: string) {
    if (!activePropertyId || !text.trim()) return;
    createComment.mutate(
      {
        propertyId: activePropertyId,
        data: {
          lng: activeProperty?.boundaryGeojson
            ? (turf.centroid(activeProperty.boundaryGeojson as unknown as turf.AllGeoJSON).geometry.coordinates[0])
            : 0,
          lat: activeProperty?.boundaryGeojson
            ? (turf.centroid(activeProperty.boundaryGeojson as unknown as turf.AllGeoJSON).geometry.coordinates[1])
            : 0,
          text: `[Boundary request] ${text}`,
          authorRole: "client",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCommentsQueryKey(activePropertyId) });
        },
      },
    );
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  const displayAreaHa = pendingAreaHa ?? activeProperty?.areaHectares;
  const displayAreaAc = pendingAreaAc ?? activeProperty?.areaAcres;

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* ── SIDEBAR ── */}
      <aside
        className="w-72 flex-shrink-0 flex flex-col overflow-y-auto"
        style={{ background: "hsl(103, 48%, 11%)", borderRight: "1px solid hsl(103, 35%, 18%)" }}
      >
        {/* App header */}
        <div className="px-4 py-3 border-b" style={{ borderColor: "hsl(103, 35%, 18%)" }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-sm font-semibold tracking-tight" style={{ color: "hsl(42, 28%, 90%)" }}>
                PermaMap
              </h1>
              <p className="text-[10px] mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>
                Permaculture Design Studio
              </p>
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

          {/* Role toggle */}
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
              <button
                onClick={handleCreateProperty}
                className="px-2 py-1 rounded text-xs font-medium"
                style={{ background: "hsl(84, 38%, 42%)", color: "#fff" }}
              >
                Add
              </button>
              <button
                onClick={() => setShowNewPropForm(false)}
                className="px-2 py-1 rounded text-xs"
                style={{ color: "hsl(42, 15%, 55%)" }}
              >
                Cancel
              </button>
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
                style={{ background: "hsl(103, 35%, 17%)", borderColor: "hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)", border: "1px solid hsl(103, 30%, 22%)" }}
              >
                +
              </button>
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

        {/* ── LAYER 1: BOUNDARY ── */}
        <SidebarSection label="Layer 1 — Property Boundary">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>
              Select a property to manage its boundary.
            </p>
          ) : role === "designer" ? (
            <div className="space-y-2.5">
              <button
                onClick={() => drawRef.current?.changeMode("draw_polygon")}
                className="w-full text-xs px-3 py-2 rounded font-medium text-left transition-colors"
                style={{ background: "hsl(103, 35%, 17%)", border: "1px solid hsl(103, 30%, 22%)", color: "hsl(42, 28%, 88%)" }}
              >
                Draw Property Boundary
              </button>

              {(displayAreaHa || displayAreaAc) && (
                <div
                  className="rounded p-2.5"
                  style={{ background: "hsl(103, 35%, 14%)", border: "1px solid hsl(84, 35%, 28%)" }}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(84, 35%, 55%)" }}>
                    Area
                  </div>
                  <div className="text-sm font-bold" style={{ color: "hsl(42, 28%, 90%)" }}>
                    {displayAreaHa?.toFixed(2)} ha
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: "hsl(42, 15%, 55%)" }}>
                    {displayAreaAc?.toFixed(2)} acres
                  </div>
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
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>
              Generate 1m Contours
            </span>
            <button
              onClick={() => setShowContours((v) => !v)}
              disabled={!activeProperty?.boundaryGeojson}
              className="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
              style={{
                background: showContours ? "hsl(84, 38%, 42%)" : "hsl(103, 30%, 20%)",
                opacity: !activeProperty?.boundaryGeojson ? 0.4 : 1,
              }}
            >
              <span
                className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all"
                style={{ left: showContours ? "18px" : "2px" }}
              />
            </button>
          </div>

          {!activeProperty?.boundaryGeojson && (
            <p className="text-[10px]" style={{ color: "hsl(42, 15%, 45%)" }}>
              Set a property boundary first to enable contours.
            </p>
          )}

          {isGeneratingContours && (
            <div className="flex items-center gap-2 mt-1.5">
              <div className="w-3 h-3 border border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(84, 38%, 42%)" }} />
              <span className="text-[10px]" style={{ color: "hsl(42, 15%, 55%)" }}>
                Fetching elevation tiles...
              </span>
            </div>
          )}

          {showContours && !isGeneratingContours && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <div className="w-6 h-0.5 rounded" style={{ background: "hsl(35, 55%, 35%)" }} />
              <span className="text-[10px]" style={{ color: "hsl(42, 15%, 55%)" }}>
                1m interval contours (hover for elevation)
              </span>
            </div>
          )}
        </SidebarSection>

        {/* ── LAYER 3: COLLABORATION ── */}
        <SidebarSection label="Layer 3 — Feedback Pins">
          {!activePropertyId ? (
            <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>
              Select a property to manage feedback.
            </p>
          ) : role === "client" ? (
            <div className="space-y-2.5">
              {pendingPin ? (
                <div className="space-y-2">
                  <p className="text-[11px]" style={{ color: "hsl(42, 28%, 80%)" }}>
                    Pin placed. Add your feedback:
                  </p>
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
                    Your Feedback ({comments.filter(c => c.authorRole === "client").length})
                  </div>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto">
                    {comments.filter(c => c.authorRole === "client").map((c) => (
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
                <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>
                  No feedback pins yet. Client pins will appear here.
                </p>
              ) : (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "hsl(42, 15%, 50%)" }}>
                    {comments.length} {comments.length === 1 ? "Pin" : "Pins"} — click pins on map
                  </div>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {comments.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-start gap-2 px-2 py-2 rounded"
                        style={{ background: "hsl(103, 35%, 14%)" }}
                      >
                        <div className="w-2 h-2 rounded-full mt-0.5 flex-shrink-0" style={{ background: "#dc2626" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] mb-0.5" style={{ color: "hsl(42, 15%, 50%)" }}>{c.authorRole}</div>
                          <div className="text-[11px] leading-snug" style={{ color: "hsl(42, 25%, 80%)" }}>{c.text}</div>
                        </div>
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="flex-shrink-0 text-[10px] transition-colors"
                          style={{ color: "hsl(0, 55%, 50%)" }}
                        >
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
        {webglError && (
          <div className="absolute inset-0 flex items-center justify-center" style={{ background: "hsl(103, 18%, 8%)" }}>
            <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
              <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "hsl(103, 30%, 16%)" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: "hsl(84, 38%, 52%)" }}>
                  <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                  <line x1="12" y1="8" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <div>
                <h3 className="font-semibold mb-1.5" style={{ color: "hsl(42, 28%, 88%)" }}>
                  WebGL Not Available
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "hsl(42, 15%, 55%)" }}>
                  The Mapbox map requires WebGL, which isn't supported in this preview environment. Open the app in a real browser tab to use the full map interface.
                </p>
              </div>
              <div className="text-xs px-3 py-2 rounded" style={{ background: "hsl(103, 30%, 14%)", color: "hsl(84, 35%, 52%)", border: "1px solid hsl(103, 25%, 20%)" }}>
                The sidebar, property management, and all API features remain fully functional.
              </div>
            </div>
          </div>
        )}
        {!mapLoaded && !webglError && (
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
        <p className="text-[11px]" style={{ color: "hsl(42, 15%, 50%)" }}>
          No boundary set yet. Request a change below.
        </p>
      )}

      <div>
        <div className="text-[10px] mb-1" style={{ color: "hsl(42, 15%, 55%)" }}>
          Request Boundary Change
        </div>
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
