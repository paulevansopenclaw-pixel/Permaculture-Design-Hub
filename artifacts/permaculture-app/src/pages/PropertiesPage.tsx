import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  useListProperties,
  useCreateProperty,
  useDeleteProperty,
  useUpdateProperty,
  getListPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";

// ── Design tokens ─────────────────────────────────────────────────────────────
const INK = "#111";
const A = "#1d4ed8";   // modern cobalt blue — replaces terracotta
const RULE = "2px solid #111";
const LIGHT = "#f7f7f7";

// ── Image resize helper ───────────────────────────────────────────────────────
async function resizeToDataUrl(file: File, maxPx = 600): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(rawDataUrl);
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxPx / Math.max(w, h, 1));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx || canvas.width === 0 || canvas.height === 0) { resolve(rawDataUrl); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.src = rawDataUrl;
  });
}

function formatArea(ha: number | null | undefined, ac: number | null | undefined) {
  if (!ha && !ac) return "No boundary set";
  return `${ha?.toFixed(2) ?? "?"} ha · ${ac?.toFixed(2) ?? "?"} ac`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric", month: "short", day: "numeric",
  });
}

// ── Property tile card ────────────────────────────────────────────────────────
function PropertyCard({
  property,
  onOpen,
  onDelete,
  onImageUpload,
}: {
  property: { id: string; name: string; areaHectares?: number | null; areaAcres?: number | null; tileImage?: string | null; createdAt: string };
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onImageUpload: (dataUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [hovered, setHovered] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file, 600);
      onImageUpload(dataUrl);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  return (
    <div
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: RULE,
        background: "#fff",
        cursor: "pointer",
        position: "relative",
        transition: "box-shadow 0.12s",
        boxShadow: hovered ? "5px 5px 0 #111" : "none",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* ── Tile image area ─────────────────────────────────────────────── */}
      <div
        style={{
          height: 140,
          background: property.tileImage ? "transparent" : LIGHT,
          position: "relative",
          overflow: "hidden",
          borderBottom: "1px solid #e5e5e5",
          flexShrink: 0,
        }}
      >
        {property.tileImage ? (
          <img
            src={property.tileImage}
            alt={property.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21,15 16,10 5,21" />
            </svg>
            <span style={{ fontFamily: "monospace", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: "#ccc" }}>No image</span>
          </div>
        )}

        {/* Upload overlay — shown on hover */}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            style={{
              position: "absolute", inset: 0, width: "100%", height: "100%",
              background: "rgba(0,0,0,0.45)", border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            {uploading ? (
              <span style={{ fontFamily: "monospace", fontSize: 9, color: "#fff", letterSpacing: "0.1em", textTransform: "uppercase" }}>Uploading…</span>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
                  <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
                </svg>
                <span style={{ fontFamily: "monospace", fontSize: 8, color: "#fff", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                  {property.tileImage ? "Change photo" : "Upload photo"}
                </span>
              </>
            )}
          </button>
        )}

        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* ── Card header strip ────────────────────────────────────────────── */}
      <div style={{ padding: "10px 14px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={A} strokeWidth="2.5">
            <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
          </svg>
          <span style={{ fontFamily: "monospace", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: A, fontWeight: 900 }}>Site</span>
        </div>
        <button
          onClick={onDelete}
          style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, lineHeight: 0 }}
          onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#ccc")}
          aria-label="Delete property"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3,6 5,6 21,6"/>
            <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
            <path d="M10,11v6M14,11v6"/>
          </svg>
        </button>
      </div>

      {/* ── Card body ────────────────────────────────────────────────────── */}
      <div style={{ padding: "8px 14px 14px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <h3 style={{ margin: "0 0 4px", fontFamily: "monospace", fontSize: 13, fontWeight: 900, letterSpacing: "-0.02em", color: INK, textTransform: "uppercase" }}>
          {property.name}
        </h3>
        <p style={{ margin: "0 0 12px", fontFamily: "monospace", fontSize: 9, color: "#bbb", letterSpacing: "0.06em" }}>
          {formatArea(property.areaHectares, property.areaAcres)}
        </p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid #f0f0f0", paddingTop: 8 }}>
          <span style={{ fontFamily: "monospace", fontSize: 8, color: "#ccc", letterSpacing: "0.08em" }}>{formatDate(property.createdAt)}</span>
          <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 900, color: A, letterSpacing: "0.08em" }}>OPEN →</span>
        </div>
      </div>

      {/* Boundary dot */}
      {(property.areaHectares ?? 0) > 0 && (
        <div style={{ position: "absolute", top: 10, right: 40, width: 6, height: 6, background: A, borderRadius: "50%" }} />
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PropertiesPage() {
  const [, navigate] = useLocation();
  const { setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: properties = [], isLoading } = useListProperties();
  const createProperty = useCreateProperty();
  const deleteProperty = useDeleteProperty();
  const updateProperty = useUpdateProperty();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    createProperty.mutate(
      { data: { name: newName.trim() } },
      {
        onSuccess: (property) => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setShowCreate(false);
          setNewName("");
          setActivePropertyId(property.id);
          navigate("/intake");
        },
      },
    );
  }

  function handleOpen(id: string) {
    setActivePropertyId(id);
    navigate("/intake");
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteProperty.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setDeleteId(null);
        },
      },
    );
  }

  function handleImageUpload(id: string, tileImage: string) {
    updateProperty.mutate(
      { id, data: { tileImage } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() }) },
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK }}>

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header style={{ background: "#fff", borderBottom: RULE, position: "sticky", top: 0, zIndex: 10, padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 16 }}>🛡</span>
          <div style={{ width: 1, height: 18, background: "#ddd" }} />
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: INK }}>TerraGuard OS</span>
            <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: A, marginLeft: 12 }}>Site Registry</span>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 16px", background: A, color: "#fff", border: `2px solid ${A}`, cursor: "pointer" }}
        >
          + New Site
        </button>
      </header>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      <main style={{ maxWidth: 980, margin: "0 auto", padding: "40px 40px 60px" }}>

        <div style={{ borderBottom: "4px solid #111", paddingBottom: 16, marginBottom: 32 }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: A, marginBottom: 6 }}>Property Management</div>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", color: INK, textTransform: "uppercase" }}>Site Registry</h1>
          {!isLoading && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa", marginTop: 8, letterSpacing: "0.08em" }}>
              {properties.length} {properties.length === 1 ? "site" : "sites"} registered
            </div>
          )}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#bbb" }}>Loading registry…</span>
          </div>
        ) : properties.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 20 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9,22 9,12 15,12 15,22"/>
            </svg>
            <div style={{ textAlign: "center" }}>
              <p style={{ margin: 0, fontFamily: "monospace", fontSize: 13, fontWeight: 900, color: INK, textTransform: "uppercase" }}>No sites registered</p>
              <p style={{ margin: "6px 0 0", fontFamily: "monospace", fontSize: 10, color: "#bbb" }}>Add your first site to begin</p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "9px 22px", background: INK, color: "#fff", border: RULE, cursor: "pointer" }}
            >
              Register First Site
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {properties.map((property) => (
              <PropertyCard
                key={property.id}
                property={property}
                onOpen={() => handleOpen(property.id)}
                onDelete={(e) => { e.stopPropagation(); setDeleteId(property.id); }}
                onImageUpload={(dataUrl) => handleImageUpload(property.id, dataUrl)}
              />
            ))}
          </div>
        )}
      </main>

      {/* ── Create Modal ─────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={() => { setShowCreate(false); setNewName(""); }} />
          <div style={{ position: "relative", background: "#fff", border: RULE, width: "100%", maxWidth: 420, margin: "0 16px", padding: 28 }}>
            <h2 style={{ margin: "0 0 5px", fontFamily: "monospace", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: INK }}>Register New Site</h2>
            <p style={{ margin: "0 0 20px", fontFamily: "monospace", fontSize: 9, color: "#bbb", textTransform: "uppercase", letterSpacing: "0.12em" }}>Enter a name for this property</p>
            <input
              autoFocus
              type="text"
              placeholder="e.g. Hillside Farm, North Ridge Parcel"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "monospace", fontSize: 13, padding: "10px 12px", border: RULE, background: "#fff", color: INK, outline: "none" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => { setShowCreate(false); setNewName(""); }}
                style={{ flex: 1, padding: "9px 0", fontFamily: "monospace", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: "#fff", color: "#888", border: "2px solid #ddd", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createProperty.isPending}
                style={{ flex: 1, padding: "9px 0", fontFamily: "monospace", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: A, color: "#fff", border: `2px solid ${A}`, cursor: "pointer", opacity: (!newName.trim() || createProperty.isPending) ? 0.4 : 1 }}
              >
                {createProperty.isPending ? "Registering…" : "Register Site"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Modal ─────────────────────────────────────────────────── */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.35)" }} onClick={() => setDeleteId(null)} />
          <div style={{ position: "relative", background: "#fff", border: RULE, width: "100%", maxWidth: 380, margin: "0 16px", padding: 28 }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: "monospace", fontSize: 13, fontWeight: 900, textTransform: "uppercase", color: INK }}>Confirm Deletion</h2>
            <p style={{ margin: "0 0 20px", fontFamily: "monospace", fontSize: 10, color: "#666", lineHeight: 1.7 }}>
              This will permanently delete the site and all associated data. This cannot be undone.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => setDeleteId(null)}
                style={{ flex: 1, padding: "9px 0", fontFamily: "monospace", fontSize: 10, fontWeight: 900, textTransform: "uppercase", background: "#fff", color: "#888", border: "2px solid #ddd", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteProperty.isPending}
                style={{ flex: 1, padding: "9px 0", fontFamily: "monospace", fontSize: 10, fontWeight: 900, textTransform: "uppercase", background: "#fff", color: "#ef4444", border: "2px solid #ef4444", cursor: "pointer", opacity: deleteProperty.isPending ? 0.4 : 1 }}
              >
                {deleteProperty.isPending ? "Deleting…" : "Delete Site"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
