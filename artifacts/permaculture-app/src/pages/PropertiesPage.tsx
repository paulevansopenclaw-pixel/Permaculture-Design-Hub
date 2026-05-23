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
    <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">

      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/70 backdrop-blur-sm px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/intake")}
            className="text-slate-500 hover:text-slate-200 transition-colors p-1 rounded"
            aria-label="Back"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100 tracking-tight">SITE REGISTRY</h1>
              <span className="text-[10px] font-mono bg-emerald-600/10 text-emerald-500 border border-emerald-600/20 px-1.5 py-0.5 rounded">
                {properties.length} {properties.length === 1 ? "SITE" : "SITES"}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-mono mt-0.5">TerraGuard OS · Property Management</p>
          </div>
        </div>

        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-[13px] font-bold tracking-wide uppercase transition-all bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 border border-emerald-600/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New Site
        </button>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-32">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin border-emerald-500" />
              <p className="text-[12px] text-slate-500 font-mono uppercase tracking-widest">Querying registry...</p>
            </div>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-5">
            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-500">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9,22 9,12 15,12 15,22"/>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-semibold text-slate-200 tracking-tight">No sites registered</h3>
              <p className="text-[13px] text-slate-500 mt-1 font-mono">
                Add your first site to begin autonomous property design
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="px-5 py-2.5 rounded-md text-[13px] font-bold tracking-wide uppercase transition-all bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 border border-emerald-600/30 shadow-[0_0_15px_rgba(16,185,129,0.1)] hover:shadow-[0_0_20px_rgba(16,185,129,0.25)]"
            >
              Register Site
            </button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-slate-900 border border-slate-800 rounded-lg p-5 hover:border-slate-600 hover:shadow-[0_0_20px_rgba(16,185,129,0.06)] transition-all group cursor-pointer relative"
                onClick={() => handleOpen(property.id)}
              >
                {/* Icon + delete row */}
                <div className="flex items-start justify-between mb-4">
                  <div className="w-9 h-9 rounded-md bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center flex-shrink-0">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                      <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                    </svg>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(property.id); }}
                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all p-1.5 rounded"
                    aria-label="Delete property"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/>
                      <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
                      <path d="M10,11v6M14,11v6"/>
                      <path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V6"/>
                    </svg>
                  </button>
                </div>

                {/* Name */}
                <h3 className="font-semibold text-slate-100 text-sm leading-snug mb-1 pr-2">
                  {property.name}
                </h3>

                {/* Area */}
                <p className="text-[11px] text-slate-500 font-mono mb-4">
                  {formatArea(property.areaHectares, property.areaAcres)}
                </p>

                {/* Footer row */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-600 font-mono uppercase tracking-wider">
                    {formatDate(property.createdAt)}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-500 opacity-0 group-hover:opacity-100 transition-opacity tracking-wide">
                    OPEN →
                  </span>
                </div>

                {/* Boundary badge */}
                {(property.areaHectares ?? 0) > 0 && (
                  <div className="absolute top-3 right-10 w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]" />
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ── Create Modal ─────────────────────────────────────────── */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => { setShowCreate(false); setNewName(""); }}
          />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-8 h-8 rounded-md bg-emerald-600/10 border border-emerald-600/20 flex items-center justify-center">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
                  <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100 tracking-tight">REGISTER NEW SITE</h2>
                <p className="text-[11px] text-slate-500 font-mono mt-0.5">Enter a designation for this property</p>
              </div>
            </div>

            <input
              autoFocus
              type="text"
              placeholder="e.g. Hillside Farm, North Ridge Parcel"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              className="w-full bg-slate-800 border border-slate-700 text-slate-100 placeholder-slate-600 rounded-md px-3 py-2.5 text-sm outline-none focus:border-emerald-600/50 focus:shadow-[0_0_0_2px_rgba(16,185,129,0.1)] transition-all font-mono"
            />

            <div className="flex gap-2 mt-4">
              <button
                onClick={() => { setShowCreate(false); setNewName(""); }}
                className="flex-1 py-2 rounded-md text-[13px] text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createProperty.isPending}
                className="flex-1 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide transition-all bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 border border-emerald-600/30 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(16,185,129,0.1)]"
              >
                {createProperty.isPending ? "Registering..." : "Register Site"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm Modal ──────────────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setDeleteId(null)}
          />
          <div className="relative bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-8 h-8 rounded-md bg-red-500/10 border border-red-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
                  <polyline points="3,6 5,6 21,6"/>
                  <path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/>
                  <path d="M10,11v6M14,11v6"/>
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100 tracking-tight">CONFIRM DELETION</h2>
                <p className="text-[12px] text-slate-400 mt-1 leading-relaxed">
                  This will permanently delete the site and all associated feedback pins. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-2 rounded-md text-[13px] text-slate-400 hover:text-slate-200 border border-slate-700 hover:border-slate-600 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteProperty.isPending}
                className="flex-1 py-2 rounded-md text-[13px] font-bold uppercase tracking-wide transition-all bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
