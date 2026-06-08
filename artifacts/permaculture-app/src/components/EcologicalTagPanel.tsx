import { useState, useEffect } from "react";
import { getGuildProfile, getTagsGuildProfiles, ALL_ECOLOGICAL_TAGS, type EcologicalFunction } from "@/lib/guildGuide";

interface Props {
  featureType: "swale" | "zone" | "pathway" | "structure";
  featureId: string;
  featureLabel: string;
  currentTags: string[];
  onSave: (tags: string[]) => void;
  onClose: () => void;
  isSaving?: boolean;
}

const LAYER_COLOR: Record<string, string> = {
  canopy: "#4a5d3f",
  "sub-canopy": "#7AAF68",
  shrub: "#8FAD6A",
  herbaceous: "#C4875A",
  "ground-cover": "#b5a36a",
  vine: "#7a6b4a",
};

const SECTION_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  canopy:       { bg: "rgba(74,93,63,0.15)",  text: "#7AAF68", label: "Canopy & Sub-canopy" },
  nitrogenFixer:{ bg: "rgba(74,107,46,0.15)", text: "#9DC08B", label: "Nitrogen Fixers" },
  accumulator:  { bg: "rgba(196,135,90,0.15)",text: "#C4875A", label: "Dynamic Accumulators" },
  insectary:    { bg: "rgba(181,163,106,0.15)",text:"#D4C07A", label: "Insectary Plants" },
};

export default function EcologicalTagPanel({ featureType, featureId: _id, featureLabel, currentTags, onSave, onClose, isSaving }: Props) {
  const [tags, setTags] = useState<string[]>(currentTags);
  const [dirty, setDirty] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(tags[0] ?? null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setTags(currentTags); setDirty(false); setExpanded(currentTags[0] ?? null); }, [_id]);

  function toggleTag(value: string) {
    setTags((prev) => {
      const next = prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value];
      setDirty(true);
      if (!expanded && next.length) setExpanded(next[0]);
      return next;
    });
  }

  const guildProfiles = getTagsGuildProfiles(tags);
  const featureTypeLabel = { swale: "Swale", zone: "Zone", pathway: "Pathway", structure: "Structure" }[featureType];

  return (
    <div
      style={{
        background: "hsl(94,40%,10%)",
        borderTop: "1px solid hsl(94,35%,18%)",
        display: "flex",
        flexDirection: "column",
        maxHeight: "60vh",
        overflowY: "auto",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid hsl(94,35%,18%)", flexShrink: 0 }}
      >
        <div>
          <p style={{ color: "hsl(44,58%,62%)", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            Ecological Tags
          </p>
          <p style={{ color: "hsl(42,15%,55%)", fontSize: 10, marginTop: 1 }}>
            {featureTypeLabel}: {featureLabel}
          </p>
        </div>
        <button onClick={onClose} style={{ color: "hsl(42,15%,55%)", fontSize: 16, lineHeight: 1, background: "none", border: "none", cursor: "pointer" }}>✕</button>
      </div>

      {/* Tag chips */}
      <div className="px-3 pt-2 pb-1" style={{ flexShrink: 0 }}>
        <div className="flex flex-wrap gap-1">
          {ALL_ECOLOGICAL_TAGS.map(({ value, label }) => {
            const active = tags.includes(value);
            return (
              <button
                key={value}
                onClick={() => toggleTag(value)}
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  padding: "2px 7px",
                  borderRadius: 2,
                  border: active ? "1px solid hsl(44,58%,52%)" : "1px solid hsl(94,20%,28%)",
                  background: active ? "rgba(194,120,30,0.18)" : "transparent",
                  color: active ? "hsl(44,58%,72%)" : "hsl(42,15%,50%)",
                  cursor: "pointer",
                  transition: "all 0.15s",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Save */}
      {dirty && (
        <div className="px-3 pb-2" style={{ flexShrink: 0 }}>
          <button
            onClick={() => { onSave(tags); setDirty(false); }}
            disabled={isSaving}
            style={{
              width: "100%",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              padding: "4px 0",
              background: "hsl(44,58%,42%)",
              color: "hsl(44,58%,90%)",
              border: "none",
              cursor: isSaving ? "default" : "pointer",
              opacity: isSaving ? 0.6 : 1,
              borderRadius: 2,
            }}
          >
            {isSaving ? "Saving…" : "Save tags"}
          </button>
        </div>
      )}

      {/* Guild guide */}
      {guildProfiles.length > 0 && (
        <div className="px-3 pb-3" style={{ flexShrink: 0 }}>
          <p style={{ color: "hsl(42,15%,45%)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
            Guild Guide
          </p>
          {guildProfiles.map(({ tag, profile }) => (
            <div key={tag} style={{ marginBottom: 8 }}>
              <button
                onClick={() => setExpanded(expanded === tag ? null : tag)}
                style={{
                  width: "100%",
                  textAlign: "left",
                  background: "hsl(94,35%,13%)",
                  border: "1px solid hsl(94,35%,20%)",
                  borderRadius: 3,
                  padding: "4px 8px",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <span style={{ color: "hsl(44,58%,68%)", fontSize: 10, fontWeight: 700 }}>{profile.label}</span>
                <span style={{ color: "hsl(42,15%,50%)", fontSize: 10 }}>{expanded === tag ? "▲" : "▼"}</span>
              </button>

              {expanded === tag && (
                <div style={{ background: "hsl(94,35%,11%)", border: "1px solid hsl(94,35%,18%)", borderTop: "none", borderRadius: "0 0 3px 3px", padding: "6px 8px" }}>
                  <p style={{ color: "hsl(42,15%,55%)", fontSize: 9, lineHeight: 1.5, marginBottom: 6 }}>{profile.description}</p>

                  {(["canopy", "nitrogenFixer", "accumulator", "insectary"] as const).map((section) => {
                    const species = profile[section];
                    if (!species.length) return null;
                    const sc = SECTION_COLORS[section];
                    return (
                      <div key={section} style={{ marginBottom: 5, background: sc.bg, borderRadius: 2, padding: "4px 6px" }}>
                        <p style={{ color: sc.text, fontSize: 8, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: 3 }}>
                          {sc.label}
                        </p>
                        {species.map((sp) => (
                          <div key={sp.latinName} style={{ marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                              <span style={{ color: "hsl(44,58%,75%)", fontSize: 9, fontWeight: 600 }}>{sp.name}</span>
                              <span style={{ color: "hsl(42,15%,45%)", fontSize: 8, fontStyle: "italic" }}>{sp.latinName}</span>
                            </div>
                            <p style={{ color: "hsl(42,15%,50%)", fontSize: 8, lineHeight: 1.4, marginTop: 1 }}>{sp.notes}</p>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tags.length === 0 && (
        <p style={{ color: "hsl(42,15%,40%)", fontSize: 9, padding: "4px 12px 8px", fontStyle: "italic" }}>
          Select tags above to see guild planting guides for this feature.
        </p>
      )}
    </div>
  );
}
