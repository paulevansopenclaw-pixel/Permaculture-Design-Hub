import { forwardRef } from "react";
import type { Property, ClientBrief } from "@workspace/api-client-react";

const PARCHMENT = "#efe6d3";
const PARCHMENT_2 = "#e7dcc4";
const INK = "#2c2416";
const RULE = "#6b5f4e";

export interface SoilPlateProps {
  property: Property;
  brief?: ClientBrief | null;
  width?: number;
  height?: number;
}

// USDA soil texture triangle — barycentric placement.
// Corners: top = 100% clay, bottom-left = 100% sand, bottom-right = 100% silt.
function trianglePoint(
  clay: number,
  sand: number,
  silt: number,
  apex: [number, number],
  bl: [number, number],
  br: [number, number],
): [number, number] {
  const t = clay + sand + silt || 1;
  const c = clay / t;
  const sa = sand / t;
  const si = silt / t;
  return [c * apex[0] + sa * bl[0] + si * br[0], c * apex[1] + sa * bl[1] + si * br[1]];
}

export const SoilPlate = forwardRef<SVGSVGElement, SoilPlateProps>(function SoilPlate(
  { property, brief, width = 1000, height = 720 },
  ref,
) {
  const clay = brief?.soilClay ?? null;
  const sand = brief?.soilSand ?? null;
  const silt = brief?.soilSilt ?? null;
  const ph = brief?.soilPH ?? null;
  const oc = brief?.soilOrganicCarbonGkg ?? null;
  const tex = brief?.soilTextureClass ?? null;

  const raw = (clay ?? 0) + (sand ?? 0) + (silt ?? 0);
  const cp = raw > 0 ? Math.round(((clay ?? 0) / raw) * 100) : 30;
  const sp = raw > 0 ? Math.round(((sand ?? 0) / raw) * 100) : 40;
  const sip = raw > 0 ? Math.max(0, 100 - cp - sp) : 30;

  const PAD = 64;

  // Triangle geometry (left half of plate).
  const triSize = 360;
  const triLeft = PAD + 40;
  const triBottom = height - 150;
  const apex: [number, number] = [triLeft + triSize / 2, triBottom - triSize * 0.866];
  const bl: [number, number] = [triLeft, triBottom];
  const br: [number, number] = [triLeft + triSize, triBottom];
  const sample = raw > 0 ? trianglePoint(cp, sp, sip, apex, bl, br) : null;

  // gridlines every 20%
  const grid: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let p = 20; p < 100; p += 20) {
    const f = p / 100;
    // lines parallel to each side
    grid.push({
      x1: apex[0] + (bl[0] - apex[0]) * f,
      y1: apex[1] + (bl[1] - apex[1]) * f,
      x2: apex[0] + (br[0] - apex[0]) * f,
      y2: apex[1] + (br[1] - apex[1]) * f,
    });
    grid.push({
      x1: bl[0] + (apex[0] - bl[0]) * f,
      y1: bl[1] + (apex[1] - bl[1]) * f,
      x2: bl[0] + (br[0] - bl[0]) * f,
      y2: bl[1] + (br[1] - bl[1]) * f,
    });
    grid.push({
      x1: br[0] + (apex[0] - br[0]) * f,
      y1: br[1] + (apex[1] - br[1]) * f,
      x2: br[0] + (bl[0] - br[0]) * f,
      y2: br[1] + (bl[1] - br[1]) * f,
    });
  }

  // Right column: horizon profile + readouts
  const colX = triLeft + triSize + 70;
  const hz = [
    { l: "O", name: "Organic", fill: "#3d1f0a", h: 34 },
    { l: "A", name: "Topsoil", fill: `hsl(25,${38 + cp * 0.5}%,${36 - cp * 0.12}%)`, h: 74 },
    { l: "B", name: "Subsoil", fill: `hsl(18,${28 + cp * 0.6}%,${32 - cp * 0.1}%)`, h: 88 },
    { l: "C", name: "Parent", fill: "#c4b5a5", h: 52 },
  ];

  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      style={{ display: "block", background: PARCHMENT, fontFamily: "'Inter', system-ui, sans-serif" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <radialGradient id="sp-vignette" cx="50%" cy="42%" r="70%">
          <stop offset="0%" stopColor={PARCHMENT} />
          <stop offset="100%" stopColor={PARCHMENT_2} />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#sp-vignette)" />
      <rect x={26} y={26} width={width - 52} height={height - 52} fill="none" stroke={RULE} strokeWidth="2.5" />
      <rect x={32} y={32} width={width - 64} height={height - 64} fill="none" stroke={RULE} strokeWidth="0.75" />

      <text x={PAD + 4} y={PAD + 6} fontSize="13" fontWeight={800} fill={INK} fontFamily="monospace" letterSpacing="0.12em">
        USDA SOIL TEXTURE
      </text>

      {raw <= 0 ? (
        <text x={width / 2} y={height / 2} textAnchor="middle" fontSize="13" fill={RULE} fontFamily="monospace">
          Soil composition not recorded — complete the intake survey.
        </text>
      ) : (
        <g>
          {/* triangle gridlines */}
          {grid.map((g, i) => (
            <line key={i} x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="#cdbf9f" strokeWidth="0.6" />
          ))}
          {/* triangle outline */}
          <path
            d={`M${apex[0]},${apex[1]} L${bl[0]},${bl[1]} L${br[0]},${br[1]} Z`}
            fill="none"
            stroke={INK}
            strokeWidth="1.75"
          />
          {/* axis labels */}
          <text x={apex[0]} y={apex[1] - 14} textAnchor="middle" fontSize="11" fontWeight={700} fill={INK}>
            100% Clay
          </text>
          <text
            x={(apex[0] + bl[0]) / 2 - 46}
            y={(apex[1] + bl[1]) / 2}
            textAnchor="middle"
            fontSize="10"
            fontWeight={600}
            fill={RULE}
            transform={`rotate(-60 ${(apex[0] + bl[0]) / 2 - 46} ${(apex[1] + bl[1]) / 2})`}
          >
            ← Clay %
          </text>
          <text
            x={(apex[0] + br[0]) / 2 + 46}
            y={(apex[1] + br[1]) / 2}
            textAnchor="middle"
            fontSize="10"
            fontWeight={600}
            fill={RULE}
            transform={`rotate(60 ${(apex[0] + br[0]) / 2 + 46} ${(apex[1] + br[1]) / 2})`}
          >
            Silt % →
          </text>
          <text x={bl[0]} y={bl[1] + 20} textAnchor="middle" fontSize="11" fontWeight={700} fill={INK}>
            100% Sand
          </text>
          <text x={br[0]} y={br[1] + 20} textAnchor="middle" fontSize="11" fontWeight={700} fill={INK}>
            100% Silt
          </text>
          <text x={(bl[0] + br[0]) / 2} y={bl[1] + 36} textAnchor="middle" fontSize="10" fontWeight={600} fill={RULE}>
            ← Sand %
          </text>

          {/* sample point */}
          {sample && (
            <g>
              <circle cx={sample[0]} cy={sample[1]} r={7} fill="#0891b2" stroke="#fff" strokeWidth="2" />
              <circle cx={sample[0]} cy={sample[1]} r={13} fill="none" stroke="#0891b2" strokeWidth="1.25" strokeOpacity={0.5} />
              <text x={sample[0] + 16} y={sample[1] + 4} fontSize="11" fontWeight={700} fill="#0e7490" stroke={PARCHMENT} strokeWidth="3" paintOrder="stroke">
                {tex ?? `${cp}/${sip}/${sp}`}
              </text>
            </g>
          )}

          {/* horizon profile column */}
          <text x={colX} y={apex[1] + 6} fontSize="11" fontWeight={700} fill={INK}>
            Profile
          </text>
          {hz.map((h, i) => {
            const y = apex[1] + 18 + hz.slice(0, i).reduce((a, b) => a + b.h + 3, 0);
            return (
              <g key={h.l}>
                <rect x={colX} y={y} width={70} height={h.h} fill={h.fill} stroke={INK} strokeWidth="0.5" />
                <text x={colX + 82} y={y + 16} fontSize="11" fontWeight={800} fill={INK} fontFamily="monospace">
                  {h.l}
                </text>
                <text x={colX + 82} y={y + 30} fontSize="9" fill={RULE}>
                  {h.name}
                </text>
              </g>
            );
          })}

          {/* readouts: composition + pH + OC */}
          {(() => {
            const rx = colX + 190;
            const bars = [
              { l: "Clay", p: cp, c: RULE },
              { l: "Silt", p: sip, c: "#9c8f78" },
              { l: "Sand", p: sp, c: INK },
            ];
            return (
              <g>
                <text x={rx} y={apex[1] + 6} fontSize="11" fontWeight={700} fill={INK}>
                  Composition
                </text>
                {bars.map((b, i) => {
                  const yy = apex[1] + 22 + i * 30;
                  return (
                    <g key={b.l}>
                      <text x={rx} y={yy} fontSize="9" fontWeight={600} fill={RULE} fontFamily="monospace">
                        {b.l}
                      </text>
                      <text x={rx + 150} y={yy} textAnchor="end" fontSize="9" fontWeight={800} fill={INK} fontFamily="monospace">
                        {b.p}%
                      </text>
                      <rect x={rx} y={yy + 4} width={150} height={6} fill="#d8ccb0" />
                      <rect x={rx} y={yy + 4} width={(150 * b.p) / 100} height={6} fill={b.c} />
                    </g>
                  );
                })}
                {ph != null && (
                  <g transform={`translate(${rx}, ${apex[1] + 130})`}>
                    <text x="0" y="0" fontSize="9" fontWeight={600} fill={RULE} fontFamily="monospace">
                      pH
                    </text>
                    <text x="150" y="0" textAnchor="end" fontSize="11" fontWeight={800} fill={INK} fontFamily="monospace">
                      {ph}
                    </text>
                    <rect x="0" y="6" width="150" height="8" fill="url(#sp-ph)" />
                    <rect x="0" y="6" width="150" height="8" fill="none" stroke={INK} strokeWidth="0.5" />
                    <rect x={Math.max(0, Math.min(146, ((ph - 4) / 6) * 150)) - 1.5} y="3" width="3" height="14" fill="#fff" stroke={INK} strokeWidth="1" />
                  </g>
                )}
                {oc != null && oc > 0 && (
                  <g transform={`translate(${rx}, ${apex[1] + 175})`}>
                    <text x="0" y="0" fontSize="9" fontWeight={600} fill={RULE} fontFamily="monospace">
                      Organic C
                    </text>
                    <text x="150" y="0" textAnchor="end" fontSize="9" fontWeight={800} fill={INK} fontFamily="monospace">
                      {oc} g/kg
                    </text>
                    <rect x="0" y="6" width="150" height="6" fill="#d8ccb0" />
                    <rect x="0" y="6" width={Math.min(150, oc * 6)} height="6" fill={RULE} />
                  </g>
                )}
              </g>
            );
          })()}
          <linearGradient id="sp-ph" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="33%" stopColor="#facc15" />
            <stop offset="55%" stopColor="#22c55e" />
            <stop offset="78%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#8b5cf6" />
          </linearGradient>
        </g>
      )}

      {/* title block */}
      {(() => {
        const tbW = 320;
        const tbH = 70;
        const tx = width - 36 - tbW;
        const ty = height - 36 - tbH;
        return (
          <g transform={`translate(${tx}, ${ty})`}>
            <rect x="0" y="0" width={tbW} height={tbH} fill="#fffdf8" stroke={INK} strokeWidth="1.5" />
            <line x1="0" y1="34" x2={tbW} y2="34" stroke={RULE} strokeWidth="0.75" />
            <text x="12" y="22" fontSize="14" fontWeight={800} fill={INK} fontFamily="Georgia, serif">
              {property.name}
            </text>
            <text x={tbW - 12} y="22" textAnchor="end" fontSize="9" fill={RULE} fontFamily="monospace">
              TERRAGUARD OS
            </text>
            <text x="12" y="54" fontSize="11" fontWeight={600} fill={INK}>
              Soil Profile Plate
            </text>
            <text x={tbW - 12} y="54" textAnchor="end" fontSize="9" fill={RULE} fontFamily="monospace">
              {new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
            </text>
          </g>
        );
      })()}
    </svg>
  );
});
