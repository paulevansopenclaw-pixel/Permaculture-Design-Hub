import { useState, useRef } from "react";
import { useLocation } from "wouter";
import patternMark from "@assets/pattern-mark.png";
import {
  useListProperties,
  useCreateProperty,
  useDeleteProperty,
  useUpdateProperty,
  useClaimProperty,
  getListPropertiesQueryKey,
} from "@workspace/api-client-react";
import { resolveObjectUrl } from "@/lib/objectUrl";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import {
  Shield, Map, BarChart3, FolderOpen, FileText,
  PenLine, CheckCircle2, MessageSquare, Droplets,
  Ruler, ClipboardList, Plus, Settings, Users,
  ArrowUpRight, Trash2, ImagePlus, MapPin,
} from "lucide-react";

// ── Palette ───────────────────────────────────────────────────────────────────
const PAPER  = "#f8f5f0";
const CARD   = "#fffdf9";
const INK    = "#2c2416";
const MID    = "#6b5f4e";
const DIM    = "#a89880";
const RULE   = "1px solid #ddd6cc";
const GREEN  = "#2d6a4f";
const BLUE   = "#1d4ed8";
const shadow = (px = 6, a = 0.07) =>
  `0 ${px / 2}px ${px}px rgba(44,36,22,${a}), 0 1px 2px rgba(44,36,22,0.04)`;

// ── Helpers ───────────────────────────────────────────────────────────────────
async function resizeToDataUrl(file: File, maxPx = 600): Promise<string> {
  const rawDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = (e) => resolve(e.target!.result as string);
    reader.onerror = () => reject(new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });
  return new Promise<string>((resolve) => {
    const img = new Image();
    img.onerror = () => resolve(rawDataUrl);
    img.onload  = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      const scale = Math.min(1, maxPx / Math.max(w, h, 1));
      const canvas = document.createElement("canvas");
      canvas.width  = Math.round(w * scale);
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
  return new Date(dateStr).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Property card ─────────────────────────────────────────────────────────────
function PropertyCard({
  property, onOpen, onDelete, onImageUpload,
}: {
  property: { id: string; name: string; areaHectares?: number | null; areaAcres?: number | null; tileImage?: string | null; status?: string | null; createdAt: string };
  onOpen: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onImageUpload: (dataUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [hovered,   setHovered]   = useState(false);
  const hasBoundary = (property.areaHectares ?? 0) > 0;
  const isEnquiry = property.status === "enquiry";

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
        background: CARD, borderRadius: 12, border: RULE, overflow: "hidden",
        cursor: "pointer",
        boxShadow: hovered ? shadow(18, 0.13) : shadow(5),
        transform: hovered ? "translateY(-2px)" : "none",
        transition: "all 0.2s ease",
        display: "flex", flexDirection: "column",
      }}
    >
      {/* Photo area */}
      <div style={{ height: 130, position: "relative", overflow: "hidden", flexShrink: 0, background: "#e8e2d8" }}>
        {property.tileImage ? (
          <img src={resolveObjectUrl(property.tileImage)} alt={property.name}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block",
                     filter: hovered ? "brightness(1.05)" : "brightness(0.97)", transition: "filter 0.2s" }} />
        ) : (
          <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: "linear-gradient(135deg, #e8e2d8 0%, #d4cdc4 100%)" }}>
            <MapPin size={24} color="#b8b0a4" strokeWidth={1.2} />
            <span style={{ fontSize: 10, color: "#b8b0a4", letterSpacing: "0.06em" }}>No photo yet</span>
          </div>
        )}
        {/* Gradient overlay */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, transparent 45%, rgba(44,36,22,0.5))" }} />

        {/* New enquiry badge */}
        {isEnquiry && (
          <div style={{ position: "absolute", top: 8, left: 8, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#fff", background: BLUE, padding: "3px 8px", borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }}>
            New enquiry
          </div>
        )}

        {/* Property name on photo */}
        <div style={{ position: "absolute", bottom: 10, left: 12, right: 36 }}>
          <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 14, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.5)", lineHeight: 1.25 }}>{property.name}</div>
        </div>

        {/* Upload overlay on hover */}
        {hovered && (
          <button
            onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
            style={{ position: "absolute", top: 8, right: 8, width: 30, height: 30, borderRadius: 7, background: "rgba(0,0,0,0.55)", border: "1px solid rgba(255,255,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
          >
            {uploading ? <span style={{ fontSize: 8, color: "#fff" }}>…</span> : <ImagePlus size={13} color="#fff" />}
          </button>
        )}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFile} />
      </div>

      {/* Card body */}
      <div style={{ padding: "12px 14px 14px", flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: MID }}>{formatArea(property.areaHectares, property.areaAcres)}</span>
          {hasBoundary && (
            <span style={{ fontSize: 9, color: GREEN, background: GREEN + "18", padding: "2px 7px", borderRadius: 12, border: `1px solid ${GREEN}38`, fontWeight: 600 }}>Mapped</span>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 8, borderTop: RULE }}>
          <span style={{ fontSize: 10, color: DIM }}>{formatDate(property.createdAt)}</span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={onDelete}
              style={{ background: "none", border: "none", cursor: "pointer", color: DIM, padding: 2, display: "flex", alignItems: "center" }}
              onMouseEnter={e => (e.currentTarget.style.color = "#ef4444")}
              onMouseLeave={e => (e.currentTarget.style.color = DIM)}
              aria-label="Delete"
            >
              <Trash2 size={13} />
            </button>
            <span style={{ fontSize: 10, fontWeight: 600, color: hovered ? GREEN : MID, display: "flex", alignItems: "center", gap: 3, transition: "color 0.15s" }}>
              Open <ArrowUpRight size={12} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function PropertiesPage() {
  const [, navigate]     = useLocation();
  const { setActivePropertyId } = useAppStore();
  const queryClient      = useQueryClient();

  const { data: properties = [], isLoading } = useListProperties();
  const createProperty   = useCreateProperty();
  const deleteProperty   = useDeleteProperty();
  const updateProperty   = useUpdateProperty();
  const claimProperty    = useClaimProperty();

  const [showCreate, setShowCreate] = useState(false);
  const [newName,    setNewName]    = useState("");
  const [deleteId,   setDeleteId]   = useState<string | null>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    createProperty.mutate(
      { data: { name: newName.trim() } },
      {
        onSuccess: (property) => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setShowCreate(false); setNewName("");
          setActivePropertyId(property.id);
          navigate("/intake");
        },
      },
    );
  }

  async function handleOpen(id: string, status?: string | null) {
    if (status === "enquiry") {
      // Claim the lead for this designer BEFORE entering the workspace so the
      // intake page never loads an unowned property.
      try {
        await claimProperty.mutateAsync({ id });
        await queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
      } catch {
        // Someone else already claimed it (or it vanished) — refresh and bail.
        await queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
        return;
      }
    }
    setActivePropertyId(id);
    navigate("/intake");
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteProperty.mutate(
      { id: deleteId },
      { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() }); setDeleteId(null); } },
    );
  }

  function handleImageUpload(id: string, tileImage: string) {
    updateProperty.mutate(
      { id, data: { tileImage } },
      { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() }) },
    );
  }

  const totalArea   = properties.reduce((s, p) => s + (p.areaHectares ?? 0), 0);
  const mapped      = properties.filter(p => (p.areaHectares ?? 0) > 0).length;

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", background: PAPER, minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* ── Top nav ── */}
      <div style={{ height: 54, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", background: "#fff", borderBottom: RULE, boxShadow: shadow(4, 0.05), flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src={patternMark} alt="Pattern" style={{ height: 30, width: "auto" }} />
          <span style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: INK }}>Pattern</span>
        </div>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          {[{ Icon: Users, label: "Team" }, { Icon: Settings, label: "Settings" }].map(({ Icon, label }) => (
            <button key={label} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: MID, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
              <Icon size={14} strokeWidth={1.75} />{label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* ── Main ── */}
        <div style={{ flex: 1, padding: "28px", overflowY: "auto" }}>

          {/* Stats strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 28 }}>
            {[
              { Icon: Map,           label: "Properties",      value: String(properties.length) },
              { Icon: Ruler,         label: "Total Area",       value: totalArea > 0 ? `${totalArea.toFixed(1)} ha` : "—" },
              { Icon: MapPin,        label: "Boundary Mapped",  value: `${mapped}/${properties.length}` },
              { Icon: ClipboardList, label: "In Progress",      value: String(properties.length) },
            ].map(({ Icon, label, value }) => (
              <div key={label} style={{ background: CARD, borderRadius: 10, border: RULE, padding: "16px", boxShadow: shadow(3) }}>
                <Icon size={18} color={MID} strokeWidth={1.5} style={{ marginBottom: 10 }} />
                <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 22, color: INK }}>{value}</div>
                <div style={{ fontSize: 11, color: MID, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Section header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 20, color: INK }}>Your Properties</div>
              <div style={{ fontSize: 12, color: MID, marginTop: 2 }}>Click any property to open its design workspace</div>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              style={{ display: "flex", alignItems: "center", gap: 7, background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 12, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", boxShadow: `0 2px 8px ${GREEN}44` }}
            >
              <Plus size={14} strokeWidth={2.5} /> New Property
            </button>
          </div>

          {/* Property grid / empty state */}
          {isLoading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "80px 0" }}>
              <span style={{ fontSize: 12, color: DIM }}>Loading properties…</span>
            </div>
          ) : properties.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 0", gap: 18 }}>
              <div style={{ width: 60, height: 60, borderRadius: 14, background: GREEN + "18", border: `1px solid ${GREEN}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Map size={26} color={GREEN} strokeWidth={1.5} />
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 16, color: INK }}>No properties yet</div>
                <div style={{ fontSize: 12, color: MID, marginTop: 5 }}>Add your first property to start designing</div>
              </div>
              <button onClick={() => setShowCreate(true)} style={{ display: "flex", alignItems: "center", gap: 7, background: GREEN, color: "#fff", border: "none", borderRadius: 8, padding: "11px 22px", fontSize: 13, fontWeight: 600, fontFamily: "inherit", cursor: "pointer" }}>
                <Plus size={15} /> Create First Property
              </button>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
              {properties.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  onOpen={() => handleOpen(property.id, property.status)}
                  onDelete={(e) => { e.stopPropagation(); setDeleteId(property.id); }}
                  onImageUpload={(dataUrl) => handleImageUpload(property.id, dataUrl)}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Activity sidebar ── */}
        <div style={{ width: 248, borderLeft: RULE, background: "#fff", padding: "20px 18px", flexShrink: 0, overflowY: "auto" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.05em", marginBottom: 16 }}>DESIGN LAYERS</div>
          {[
            { Icon: ClipboardList, label: "Intake",       desc: "Survey + vision board",   path: "/intake"    },
            { Icon: Map,           label: "Map Workspace",desc: "Draw + annotate",          path: "/workspace" },
            { Icon: BarChart3,     label: "AI Analysis",  desc: "Water + sectors + zones",  path: "/analysis"  },
            { Icon: FolderOpen,    label: "Dossier",      desc: "Budget + plants",          path: "/dossier"   },
            { Icon: FileText,      label: "Presentation", desc: "Client PDF",               path: null         },
          ].map(({ Icon, label, desc, path }) => (
            <div key={label} style={{ display: "flex", gap: 10, marginBottom: 14, paddingBottom: 14, borderBottom: RULE, cursor: path ? "pointer" : "default", opacity: path ? 1 : 0.5 }}>
              <div style={{ width: 30, height: 30, borderRadius: 7, background: GREEN + "12", border: `1px solid ${GREEN}28`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={14} color={GREEN} strokeWidth={1.75} />
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: INK }}>{label}</div>
                <div style={{ fontSize: 10, color: MID, marginTop: 1 }}>{desc}</div>
              </div>
            </div>
          ))}

          <div style={{ fontSize: 11, fontWeight: 600, color: MID, letterSpacing: "0.05em", marginBottom: 14, marginTop: 8 }}>RECENT ACTIVITY</div>
          {[
            { Icon: PenLine,       time: "Just now",  text: "Property dashboard opened" },
            { Icon: CheckCircle2,  time: "Today",     text: "System ready"              },
            { Icon: MessageSquare, time: "—",         text: "No client notes yet"       },
            { Icon: Droplets,      time: "—",         text: "No water data yet"         },
          ].map(({ Icon, time, text }, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 14, opacity: time === "—" ? 0.45 : 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: 7, background: "#f0ece5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Icon size={12} color={MID} strokeWidth={1.75} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: INK, lineHeight: 1.5 }}>{text}</div>
                <div style={{ fontSize: 10, color: DIM }}>{time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Create modal ── */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(44,36,22,0.35)" }} onClick={() => { setShowCreate(false); setNewName(""); }} />
          <div style={{ position: "relative", background: CARD, borderRadius: 14, border: RULE, width: "100%", maxWidth: 440, margin: "0 16px", padding: 28, boxShadow: shadow(24, 0.15) }}>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 18, color: INK, marginBottom: 5 }}>New Property</div>
            <div style={{ fontSize: 12, color: MID, marginBottom: 20 }}>Give your site a name to get started</div>
            <input
              autoFocus type="text" placeholder="e.g. Hillside Farm, North Ridge Parcel"
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              style={{ width: "100%", boxSizing: "border-box", fontSize: 14, padding: "11px 14px", border: RULE, borderRadius: 8, background: "#fff", color: INK, outline: "none", fontFamily: "inherit" }}
            />
            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowCreate(false); setNewName(""); }}
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, background: "#fff", color: MID, border: RULE, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button onClick={handleCreate} disabled={!newName.trim() || createProperty.isPending}
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, background: GREEN, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: (!newName.trim() || createProperty.isPending) ? 0.5 : 1 }}>
                {createProperty.isPending ? "Creating…" : "Create Property"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete modal ── */}
      {deleteId && (
        <div style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(44,36,22,0.35)" }} onClick={() => setDeleteId(null)} />
          <div style={{ position: "relative", background: CARD, borderRadius: 14, border: RULE, width: "100%", maxWidth: 400, margin: "0 16px", padding: 28, boxShadow: shadow(24, 0.15) }}>
            <div style={{ fontFamily: "Georgia, serif", fontWeight: 700, fontSize: 17, color: INK, marginBottom: 8 }}>Delete Property?</div>
            <p style={{ fontSize: 12, color: MID, lineHeight: 1.7, marginBottom: 20 }}>This will permanently delete the property and all its data. This cannot be undone.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setDeleteId(null)}
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, background: "#fff", color: MID, border: RULE, borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteProperty.isPending}
                style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 600, background: "#fff", color: "#ef4444", border: "1px solid #fca5a5", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", opacity: deleteProperty.isPending ? 0.5 : 1 }}>
                {deleteProperty.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
