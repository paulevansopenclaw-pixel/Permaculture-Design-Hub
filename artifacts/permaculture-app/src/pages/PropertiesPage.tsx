import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListProperties,
  useCreateProperty,
  useDeleteProperty,
  getListPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";

const INK = "#111";
const T = "#A0522D";
const RULE = "2px solid #111";

function formatArea(ha: number | null | undefined, ac: number | null | undefined) {
  if (!ha && !ac) return "No boundary set";
  return `${ha?.toFixed(2) ?? "?"} ha · ${ac?.toFixed(2) ?? "?"} ac`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PropertiesPage() {
  const [, navigate] = useLocation();
  const { setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: properties = [], isLoading } = useListProperties();
  const createProperty = useCreateProperty();
  const deleteProperty = useDeleteProperty();

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

  return (
    <div style={{ minHeight: "100vh", background: "#fff", color: INK }}>

      {/* Header */}
      <header style={{ background: "#fff", borderBottom: RULE, position: "sticky", top: 0, zIndex: 10, padding: "0 40px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 16 }}>🛡</span>
          <div style={{ width: 1, height: 18, background: "#ddd" }} />
          <div>
            <span style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase", color: INK }}>TerraGuard OS</span>
            <span style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: T, marginLeft: 12 }}>Site Registry</span>
          </div>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ fontFamily: "monospace", fontSize: 10, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase", padding: "7px 16px", background: T, color: "#fff", border: `2px solid ${T}`, cursor: "pointer" }}
        >
          + New Site
        </button>
      </header>

      {/* Content */}
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 40px 60px" }}>

        {/* Page title */}
        <div style={{ borderBottom: "4px solid #111", paddingBottom: 16, marginBottom: 32 }}>
          <div style={{ fontFamily: "monospace", fontSize: 9, textTransform: "uppercase", letterSpacing: "0.18em", color: T, marginBottom: 6 }}>Property Management</div>
          <h1 style={{ margin: 0, fontSize: 40, fontWeight: 900, letterSpacing: "-0.04em", color: INK, textTransform: "uppercase" }}>Site Registry</h1>
          {!isLoading && (
            <div style={{ fontFamily: "monospace", fontSize: 10, color: "#aaa", marginTop: 8, letterSpacing: "0.08em" }}>
              {properties.length} {properties.length === 1 ? "site" : "sites"} registered
            </div>
          )}
        </div>

        {isLoading ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
            <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.15em", textTransform: "uppercase", color: "#bbb" }}>Loading registry...</span>
          </div>
        ) : properties.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 20 }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.2">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9,22 9,12 15,12 15,22"/>
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
              <div
                key={property.id}
                onClick={() => handleOpen(property.id)}
                style={{ border: RULE, background: "#fff", cursor: "pointer", position: "relative", transition: "box-shadow 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.boxShadow = "4px 4px 0 #111")}
                onMouseLeave={e => (e.currentTarget.style.boxShadow = "none")}
              >
                {/* Card header */}
                <div style={{ borderBottom: "1px solid #e5e5e5", padding: "12px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#f7f7f7" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T} strokeWidth="2.5">
                      <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                    </svg>
                    <span style={{ fontFamily: "monospace", fontSize: 8, textTransform: "uppercase", letterSpacing: "0.12em", color: T, fontWeight: 900 }}>Site</span>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(property.id); }}
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", padding: 4, lineHeight: 0 }}
                    aria-label="Delete property"
                    onMouseEnter={e => ((e.currentTarget as HTMLButtonElement).style.color = "#ef4444")}
                    onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.color = "#ccc")}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
                      <path d="M10,11v6M14,11v6"/>
                    </svg>
                  </button>
                </div>

                {/* Card body */}
                <div style={{ padding: "16px" }}>
                  <h3 style={{ margin: "0 0 6px", fontFamily: "monospace", fontSize: 14, fontWeight: 900, letterSpacing: "-0.02em", color: INK, textTransform: "uppercase" }}>
                    {property.name}
                  </h3>
                  <p style={{ margin: "0 0 14px", fontFamily: "monospace", fontSize: 9, color: "#aaa", letterSpacing: "0.08em" }}>
                    {formatArea(property.areaHectares, property.areaAcres)}
                  </p>

                  {/* Footer */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "monospace", fontSize: 9, color: "#bbb", letterSpacing: "0.08em" }}>
                      {formatDate(property.createdAt)}
                    </span>
                    <span style={{ fontFamily: "monospace", fontSize: 9, fontWeight: 900, color: T, letterSpacing: "0.1em" }}>
                      OPEN →
                    </span>
                  </div>
                </div>

                {/* Boundary indicator */}
                {(property.areaHectares ?? 0) > 0 && (
                  <div style={{ position: "absolute", top: 12, right: 38, width: 6, height: 6, background: T, borderRadius: "50%" }} />
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Create Modal ──────────────────────────────────────────────────── */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => { setShowCreate(false); setNewName(""); }} />
          <div style={{ position: "relative", background: "#fff", border: RULE, width: "100%", maxWidth: 420, margin: "0 16px", padding: 28 }}>
            <h2 style={{ margin: "0 0 6px", fontFamily: "monospace", fontSize: 14, fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.01em", color: INK }}>Register New Site</h2>
            <p style={{ margin: "0 0 20px", fontFamily: "monospace", fontSize: 9, color: "#aaa", textTransform: "uppercase", letterSpacing: "0.12em" }}>Enter a designation for this property</p>

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
                style={{ flex: 1, padding: "9px 0", fontFamily: "monospace", fontSize: 10, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", background: INK, color: "#fff", border: RULE, cursor: "pointer", opacity: (!newName.trim() || createProperty.isPending) ? 0.4 : 1 }}
              >
                {createProperty.isPending ? "Registering..." : "Register Site"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ───────────────────────────────────────────── */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setDeleteId(null)} />
          <div style={{ position: "relative", background: "#fff", border: RULE, width: "100%", maxWidth: 380, margin: "0 16px", padding: 28 }}>
            <h2 style={{ margin: "0 0 8px", fontFamily: "monospace", fontSize: 13, fontWeight: 900, textTransform: "uppercase", color: INK }}>Confirm Deletion</h2>
            <p style={{ margin: "0 0 20px", fontFamily: "monospace", fontSize: 10, color: "#666", lineHeight: 1.7 }}>
              This will permanently delete the site and all associated data. This action cannot be undone.
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
                {deleteProperty.isPending ? "Deleting..." : "Delete Site"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
