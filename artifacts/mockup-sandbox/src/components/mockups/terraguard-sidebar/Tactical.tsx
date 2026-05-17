import React, { useState } from "react";
import { Grid, Plus, ChevronRight, ChevronDown, Search } from "lucide-react";
import "./_group.css";

const LAYERS = [
  { id: "sat", label: "SATELLITE IMAGERY" },
  { id: "prop", label: "PROPERTY BOUNDARY" },
  { id: "terr", label: "TERRAIN CONTOURS" },
  { id: "sect", label: "SECTORS" },
  { id: "sol", label: "SOLAR ARCS" },
  { id: "wat", label: "WATER ANALYSIS" },
  { id: "str", label: "STRUCTURES" },
  { id: "path", label: "PATHWAYS" },
  { id: "zone", label: "ZONE MAPPING" },
];

const SECTIONS = [
  "CLIENT BRIEF",
  "PROPERTY BOUNDARY",
  "TERRAIN CONTOURS",
  "SECTOR ANALYSIS",
  "WATER AUTOMATION",
  "FEEDBACK PINS",
  "STRUCTURES",
  "ACCESS & PATHWAYS",
  "ZONE MAPPING",
];

export function Tactical() {
  const [activeMode, setActiveMode] = useState<"ENGINEER" | "CLIENT">("ENGINEER");
  const [layersOpen, setLayersOpen] = useState(true);
  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({
    sat: true,
    prop: true,
    terr: false,
    sect: true,
    sol: false,
    wat: true,
    str: false,
    path: false,
    zone: true,
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    "SYS-01": true,
  });

  const toggleLayer = (id: string) => {
    setLayerStates((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSection = (id: string) => {
    setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="flex h-screen w-full font-['JetBrains_Mono'] text-xs" style={{ backgroundColor: "#080c10" }}>
      {/* LEFT SIDEBAR */}
      <div 
        className="w-72 flex-shrink-0 flex flex-col h-full overflow-y-auto overflow-x-hidden border-r"
        style={{ 
          backgroundColor: "#090c0f", 
          borderColor: "#1a2a38",
          color: "#4a6070"
        }}
      >
        {/* HEADER */}
        <div className="p-4 border-b border-[#1a2a38]">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-[#00d4ff] font-bold text-sm tracking-widest">TERRAGUARD</h1>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mt-1">Land Security Platform</div>
            </div>
            <button className="text-[#4a6070] hover:text-[#00d4ff] transition-colors">
              <Grid size={16} />
            </button>
          </div>

          <div className="flex p-0.5 rounded border border-[#1a2a38] bg-black/50">
            <button
              onClick={() => setActiveMode("ENGINEER")}
              className={`flex-1 py-1.5 text-center transition-all ${
                activeMode === "ENGINEER" 
                  ? "bg-[#00d4ff] text-[#090c0f] font-bold" 
                  : "text-[#4a6070] hover:text-[#00d4ff]/70"
              }`}
            >
              ENGINEER
            </button>
            <button
              onClick={() => setActiveMode("CLIENT")}
              className={`flex-1 py-1.5 text-center transition-all ${
                activeMode === "CLIENT" 
                  ? "bg-[#00d4ff] text-[#090c0f] font-bold" 
                  : "text-[#4a6070] hover:text-[#00d4ff]/70"
              }`}
            >
              CLIENT
            </button>
          </div>
        </div>

        {/* PROPERTY SELECTOR */}
        <div className="p-4 border-b border-[#1a2a38]">
          <label className="block text-[10px] tracking-widest mb-2">ACTIVE PROPERTY</label>
          <div className="flex gap-2">
            <select className="flex-1 bg-transparent border border-[#1a2a38] text-[#4a6070] p-1.5 outline-none focus:border-[#00d4ff] appearance-none rounded-none">
              <option>SITE_ALPHA_7</option>
              <option>SITE_BRAVO_9</option>
            </select>
            <button className="border border-[#1a2a38] p-1.5 text-[#4a6070] hover:text-[#00d4ff] hover:border-[#00d4ff] transition-colors">
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* ADDRESS SEARCH */}
        <div className="p-4 border-b border-[#1a2a38]">
          <label className="block text-[10px] tracking-widest mb-2">ADDRESS SEARCH</label>
          <div className="relative">
            <Search size={14} className="absolute left-2 top-1.5 text-[#1a2a38]" />
            <input 
              type="text" 
              placeholder="INPUT COORDINATES..." 
              className="w-full bg-transparent border border-[#1a2a38] text-[#4a6070] py-1.5 pl-8 pr-2 outline-none focus:border-[#00d4ff] placeholder:text-[#1a2a38]"
            />
          </div>
        </div>

        {/* LAYER VISIBILITY */}
        <div className="border-b border-[#1a2a38]">
          <button 
            onClick={() => setLayersOpen(!layersOpen)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-white/5 transition-colors"
          >
            <span className="tracking-widest">LAYER VISIBILITY</span>
            {layersOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
          
          {layersOpen && (
            <div className="px-4 pb-4 space-y-1.5">
              {LAYERS.map((layer) => (
                <div key={layer.id} className="flex justify-between items-center group">
                  <span className="opacity-80 group-hover:opacity-100 transition-opacity">{layer.label}</span>
                  <button 
                    onClick={() => toggleLayer(layer.id)}
                    className={`text-[10px] font-bold px-1.5 py-0.5 border transition-all ${
                      layerStates[layer.id] 
                        ? "text-[#00d4ff] border-[#00d4ff]/30 bg-[#00d4ff]/10" 
                        : "text-[#ff3b3b]/60 border-[#ff3b3b]/20 bg-transparent"
                    }`}
                  >
                    {layerStates[layer.id] ? "ACTIVE" : "STANDBY"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* COLLAPSIBLE SECTIONS */}
        <div className="flex-1 overflow-y-auto">
          {SECTIONS.map((section, idx) => {
            const sysId = `SYS-${String(idx + 1).padStart(2, '0')}`;
            const isOpen = openSections[sysId];
            return (
              <div key={sysId} className="border-b border-[#1a2a38]">
                <button 
                  onClick={() => toggleSection(sysId)}
                  className={`w-full flex items-center justify-between p-4 text-left transition-colors ${
                    isOpen ? "bg-black/30" : "hover:bg-white/5"
                  }`}
                >
                  <span className={`tracking-widest ${isOpen ? "text-[#00d4ff]" : ""}`}>
                    {sysId} / {section}
                  </span>
                  {isOpen ? <ChevronDown size={14} className="text-[#00d4ff]" /> : <ChevronRight size={14} />}
                </button>
                
                {isOpen && (
                  <div className="p-4 bg-black/20 text-[#4a6070] border-t border-[#1a2a38]/50">
                    {/* Placeholder content for depth */}
                    <div className="space-y-3">
                      <div className="flex justify-between border-b border-[#1a2a38] pb-1">
                        <span>STATUS</span>
                        <span className="text-[#00d4ff]">NOMINAL</span>
                      </div>
                      <div className="flex justify-between border-b border-[#1a2a38] pb-1">
                        <span>INTEGRITY</span>
                        <span>98.4%</span>
                      </div>
                      <div className="flex justify-between border-b border-[#1a2a38] pb-1">
                        <span>LAST UPDATE</span>
                        <span>T-MINUS 4m</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT MAP AREA */}
      <div className="flex-1 relative overflow-hidden tactical-bg-grid flex items-center justify-center">
        {/* Subtle radial gradient overlay for depth */}
        <div className="absolute inset-0 bg-radial from-transparent to-[#080c10] pointer-events-none" />
        
        {/* Tactical overlay elements */}
        <div className="absolute top-8 left-8 text-[#00d4ff]/40 text-xs font-['JetBrains_Mono']">
          <div>LAT: 34.0522° N</div>
          <div>LNG: 118.2437° W</div>
          <div className="mt-2 text-[#ff3b3b]/60">TARGET LOCK: ENGAGED</div>
        </div>

        <div className="absolute bottom-8 right-8 text-[#4a6070] text-xs font-['JetBrains_Mono'] text-right">
          <div>SCALE 1:5000</div>
          <div>ELEVATION: +412m</div>
        </div>

        {/* Crosshair center */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border border-[#00d4ff]/10 rounded-full flex items-center justify-center pointer-events-none">
          <div className="w-1 h-4 bg-[#00d4ff]/20 absolute top-0" />
          <div className="w-1 h-4 bg-[#00d4ff]/20 absolute bottom-0" />
          <div className="w-4 h-1 bg-[#00d4ff]/20 absolute left-0" />
          <div className="w-4 h-1 bg-[#00d4ff]/20 absolute right-0" />
        </div>

        {/* Animated markers */}
        <div className="absolute top-1/3 left-1/3">
          <div className="tactical-marker" />
          <div className="absolute top-3 left-3 text-[#00d4ff] text-[10px]">TGT-A</div>
        </div>
        
        <div className="absolute top-2/3 left-1/2">
          <div className="tactical-marker" />
          <div className="absolute top-3 left-3 text-[#00d4ff] text-[10px]">TGT-B</div>
        </div>
        
        <div className="absolute top-1/2 right-1/4">
          <div className="tactical-marker" style={{ backgroundColor: "#ff3b3b", boxShadow: "0 0 8px #ff3b3b" }} />
          <div className="absolute top-3 left-3 text-[#ff3b3b] text-[10px]">ANOMALY</div>
        </div>
      </div>
    </div>
  );
}

export default Tactical;
