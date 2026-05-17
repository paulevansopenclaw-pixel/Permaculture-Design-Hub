import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Grid, Plus, Search, Map as MapIcon, Layers, Settings2 } from 'lucide-react';

const COLORS = {
  bgSidebar: '#f5f0e8',
  bgMap: '#e8dcc8',
  border: '#c8b89a',
  textPrimary: '#2a1a0a',
  textSecondary: '#8a6a50',
  accentDark: '#3d2410',
  accentOrange: '#c4702a',
};

// Layer definition
type LayerDef = {
  id: string;
  label: string;
  color: string;
};

const LAYERS: LayerDef[] = [
  { id: 'satellite', label: 'Satellite Imagery', color: '#4a7c9d' },
  { id: 'boundary', label: 'Property Boundary', color: '#5b8a5b' },
  { id: 'contours', label: 'Terrain Contours', color: '#a64d4d' },
  { id: 'sectors', label: 'Sectors', color: '#c49a45' },
  { id: 'solar', label: 'Solar Arcs', color: '#c4702a' },
  { id: 'water', label: 'Water Analysis', color: '#4a7c9d' },
  { id: 'structures', label: 'Structures', color: '#3d4a60' },
  { id: 'pathways', label: 'Pathways', color: '#7a5c43' },
  { id: 'zones', label: 'Zone Mapping', color: '#c4b545' },
];

const SECTIONS = [
  'Client Brief',
  'Layer 1 — Property Boundary',
  'Layer 2 — Terrain Contours',
  'Layer 3 — Sector Analysis',
  'Layer 4 — Water Automation',
  'Layer 5 — Feedback Pins',
  'Layer 6 — Structures',
  'Layer 7 — Access & Pathways',
  'Layer 8 — Zone Mapping',
];

export default function Field() {
  const [mode, setMode] = useState<'engineer' | 'client'>('engineer');
  const [layersOpen, setLayersOpen] = useState(true);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    LAYERS.reduce((acc, layer) => ({ ...acc, [layer.id]: true }), {})
  );
  
  const [openSection, setOpenSection] = useState<number | null>(1); // Default Layer 1 open

  const toggleLayer = (id: string) => {
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleSection = (index: number) => {
    setOpenSection(prev => prev === index ? null : index);
  };

  return (
    <div className="flex h-screen w-full font-sans overflow-hidden text-sm" style={{ backgroundColor: COLORS.bgSidebar, color: COLORS.textPrimary }}>
      {/* SIDEBAR */}
      <div 
        className="w-[320px] flex-shrink-0 h-full flex flex-col overflow-y-auto"
        style={{ borderRight: `1px solid ${COLORS.border}` }}
      >
        {/* HEADER */}
        <div className="p-5 pb-4 flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-xl font-bold tracking-tight uppercase" style={{ fontFamily: '"Courier New", Courier, monospace', color: COLORS.accentDark }}>
                TerraGuard
              </h1>
              <p className="text-[10px] tracking-widest uppercase mt-0.5" style={{ color: COLORS.textSecondary }}>
                Land Security Platform
              </p>
            </div>
            <button className="p-1.5 hover:bg-black/5 rounded" style={{ color: COLORS.textSecondary }}>
              <Grid size={16} />
            </button>
          </div>

          {/* MODE TOGGLE */}
          <div className="flex p-0.5 rounded-sm" style={{ border: `1px solid ${COLORS.border}` }}>
            <button
              onClick={() => setMode('engineer')}
              className={`flex-1 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors`}
              style={mode === 'engineer' ? { backgroundColor: COLORS.accentDark, color: COLORS.bgSidebar } : { color: COLORS.textSecondary }}
            >
              Engineer
            </button>
            <button
              onClick={() => setMode('client')}
              className={`flex-1 py-1.5 text-xs font-semibold tracking-wide uppercase transition-colors`}
              style={mode === 'client' ? { backgroundColor: COLORS.accentDark, color: COLORS.bgSidebar } : { color: COLORS.textSecondary }}
            >
              Client
            </button>
          </div>
        </div>

        {/* PROPERTY SELECTOR */}
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <label className="block text-[10px] tracking-widest uppercase mb-2 font-semibold" style={{ color: COLORS.textSecondary }}>
            Active Property
          </label>
          <div className="flex gap-2">
            <select 
              className="flex-1 bg-transparent px-2 py-1.5 text-xs outline-none appearance-none cursor-pointer"
              style={{ border: `1px solid ${COLORS.border}` }}
            >
              <option>Echo Valley Ranch</option>
              <option>Northridge Estate</option>
            </select>
            <button 
              className="w-8 flex items-center justify-center hover:bg-black/5 transition-colors"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            >
              <Plus size={14} />
            </button>
          </div>
        </div>

        {/* ADDRESS SEARCH */}
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <label className="block text-[10px] tracking-widest uppercase mb-2 font-semibold" style={{ color: COLORS.textSecondary }}>
            Address Search
          </label>
          <div className="relative">
            <input 
              type="text" 
              placeholder="Enter coordinates or address..."
              className="w-full bg-transparent px-2 py-1.5 pl-7 text-xs outline-none placeholder:opacity-50"
              style={{ border: `1px solid ${COLORS.border}`, color: COLORS.textPrimary }}
            />
            <Search size={12} className="absolute left-2.5 top-2.5 opacity-50" />
          </div>
        </div>

        {/* LAYER VISIBILITY */}
        <div className="py-2" style={{ borderTop: `1px solid ${COLORS.border}` }}>
          <button 
            onClick={() => setLayersOpen(!layersOpen)}
            className="w-full flex items-center justify-between px-5 py-2 hover:bg-black/5 transition-colors"
          >
            <span className="text-[10px] tracking-widest uppercase font-semibold" style={{ color: COLORS.textSecondary }}>
              Layer Visibility
            </span>
            {layersOpen ? <ChevronDown size={14} opacity={0.5} /> : <ChevronRight size={14} opacity={0.5} />}
          </button>
          
          {layersOpen && (
            <div className="px-5 py-2 flex flex-col gap-1.5">
              {LAYERS.map(layer => (
                <div key={layer.id} className="flex items-center justify-between group cursor-pointer" onClick={() => toggleLayer(layer.id)}>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: layer.color, opacity: activeLayers[layer.id] ? 1 : 0.3 }} />
                    <span className="text-xs tracking-tight" style={{ color: activeLayers[layer.id] ? COLORS.textPrimary : COLORS.textSecondary }}>
                      {layer.label}
                    </span>
                  </div>
                  <span 
                    className="text-[9px] font-bold tracking-wider" 
                    style={{ color: activeLayers[layer.id] ? COLORS.accentDark : COLORS.border }}
                  >
                    {activeLayers[layer.id] ? 'ON' : 'OFF'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTIONS LIST */}
        <div className="flex-1 pb-10">
          {SECTIONS.map((section, idx) => {
            const isOpen = openSection === idx;
            return (
              <div key={idx} style={{ borderTop: `1px solid ${COLORS.border}` }}>
                <button
                  onClick={() => toggleSection(idx)}
                  className="w-full flex items-center justify-between px-5 py-3 hover:bg-black/5 transition-colors relative"
                >
                  {isOpen && (
                    <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: COLORS.accentDark }} />
                  )}
                  <span className="text-sm font-medium tracking-tight" style={{ color: isOpen ? COLORS.accentDark : COLORS.textPrimary }}>
                    {section}
                  </span>
                  <ChevronRight size={14} className={`transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} style={{ color: COLORS.textSecondary }} />
                </button>
                
                {isOpen && (
                  <div className="px-5 py-3 pl-8 text-xs bg-black/5" style={{ color: COLORS.textSecondary }}>
                    <p className="mb-2">Survey notes recorded in field logic format. Establish primary control points before proceeding with zone allocation.</p>
                    <div className="flex gap-2 mt-3">
                      <button className="px-3 py-1 text-[10px] uppercase tracking-widest font-semibold border" style={{ borderColor: COLORS.accentDark, color: COLORS.accentDark }}>
                        Edit Data
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MAP AREA */}
      <div className="flex-1 h-full relative overflow-hidden flex items-center justify-center" style={{ backgroundColor: COLORS.bgMap }}>
        {/* Topo Map Background Pattern */}
        <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
          backgroundImage: `
            radial-gradient(ellipse at center, transparent 0%, transparent 60%, ${COLORS.accentDark} 100%),
            repeating-radial-gradient(circle at 50% 50%, transparent 0, transparent 40px, ${COLORS.accentDark} 41px, transparent 42px),
            repeating-radial-gradient(circle at 30% 70%, transparent 0, transparent 30px, ${COLORS.accentDark} 31px, transparent 32px)
          `,
          backgroundSize: '100% 100%, 800px 800px, 600px 600px'
        }} />
        
        {/* Grid Overlay */}
        <div className="absolute inset-0 pointer-events-none" style={{
          backgroundImage: `
            linear-gradient(to right, ${COLORS.border} 1px, transparent 1px),
            linear-gradient(to bottom, ${COLORS.border} 1px, transparent 1px)
          `,
          backgroundSize: '100px 100px',
          opacity: 0.3
        }} />

        {/* Survey Markers */}
        <div className="absolute top-1/3 left-1/3 w-3 h-3 flex items-center justify-center">
          <div className="absolute w-px h-full" style={{ backgroundColor: COLORS.accentDark }} />
          <div className="absolute w-full h-px" style={{ backgroundColor: COLORS.accentDark }} />
          <span className="absolute left-4 top-2 text-[10px] font-mono tracking-tighter" style={{ color: COLORS.accentDark }}>PT-01</span>
        </div>
        
        <div className="absolute top-1/2 left-2/3 w-3 h-3 flex items-center justify-center">
          <div className="absolute w-px h-full" style={{ backgroundColor: COLORS.accentDark }} />
          <div className="absolute w-full h-px" style={{ backgroundColor: COLORS.accentDark }} />
          <span className="absolute left-4 top-2 text-[10px] font-mono tracking-tighter" style={{ color: COLORS.accentDark }}>PT-02</span>
        </div>

        {/* Map Center Reticle */}
        <div className="relative w-8 h-8 flex items-center justify-center opacity-30 pointer-events-none">
          <div className="absolute w-px h-full" style={{ backgroundColor: COLORS.textPrimary }} />
          <div className="absolute w-full h-px" style={{ backgroundColor: COLORS.textPrimary }} />
          <div className="absolute w-4 h-4 border rounded-full" style={{ borderColor: COLORS.textPrimary }} />
        </div>

        {/* Scale indicator */}
        <div className="absolute bottom-6 right-6 border-l border-r border-b px-8 py-1 h-3 flex items-end justify-center" style={{ borderColor: COLORS.accentDark, color: COLORS.accentDark }}>
          <span className="text-[9px] font-mono mb-2 block">100m</span>
        </div>
      </div>
    </div>
  );
}
