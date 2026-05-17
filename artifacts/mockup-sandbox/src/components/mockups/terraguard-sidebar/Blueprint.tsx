import React, { useState } from 'react';
import { 
  Grid, 
  Plus, 
  Search, 
  ChevronRight, 
  ChevronDown,
  Layers,
  Map as MapIcon,
  Settings,
  MoreHorizontal
} from 'lucide-react';

export default function Blueprint() {
  const [mode, setMode]] = useState<'engineer' | 'client'>('engineer');
  const [layersOpen, setLayersOpen] = useState(true);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'I — CLIENT BRIEF': true,
  });

  const [layerStates, setLayerStates] = useState<Record<string, boolean>>({
    'Satellite Imagery': true,
    'Property Boundary': true,
    'Terrain Contours': false,
    'Sectors': false,
    'Solar Arcs': true,
    'Water Analysis': false,
    'Structures': true,
    'Pathways': false,
    'Zone Mapping': false,
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const toggleLayer = (layer: string) => {
    setLayerStates(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };

  const sections = [
    'I — CLIENT BRIEF',
    'II — PROPERTY BOUNDARY',
    'III — TERRAIN CONTOURS',
    'IV — SECTOR ANALYSIS',
    'V — WATER AUTOMATION',
    'VI — FEEDBACK PINS',
    'VII — STRUCTURES',
    'VIII — ACCESS & PATHWAYS',
    'IX — ZONE MAPPING'
  ];

  const layerColors = {
    'Satellite Imagery': '#3b82f6',
    'Property Boundary': '#22c55e',
    'Terrain Contours': '#ef4444',
    'Sectors': '#eab308',
    'Solar Arcs': '#f59e0b',
    'Water Analysis': '#3b82f6',
    'Structures': '#1e3a8a',
    'Pathways': '#92400e',
    'Zone Mapping': '#eab308',
  };

  return (
    <div className="flex h-screen w-full overflow-hidden font-sans text-slate-300 selection:bg-[#c8922a] selection:text-[#0d1526]" style={{ backgroundColor: '#0a1020' }}>
      
      {/* LEFT SIDEBAR */}
      <div 
        className="w-[320px] flex-shrink-0 h-full overflow-y-auto border-r flex flex-col"
        style={{ 
          backgroundColor: '#0d1526',
          borderColor: '#c8922a',
          boxShadow: '4px 0 24px rgba(0,0,0,0.5)'
        }}
      >
        {/* HEADER */}
        <div className="p-6 border-b" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white mb-1" style={{ fontFamily: '"Playfair Display", serif' }}>
                TerraGuard
              </h1>
              <p className="text-[10px] tracking-[0.2em] uppercase" style={{ color: '#7a8fa6' }}>
                Land Security Platform
              </p>
            </div>
            <button className="p-2 border rounded hover:bg-[#c8922a]/10 transition-colors" style={{ borderColor: 'rgba(200, 146, 42, 0.5)', color: '#c8922a' }}>
              <Grid size={16} />
            </button>
          </div>

          {/* MODE TOGGLE */}
          <div className="flex p-1 rounded-sm border" style={{ borderColor: 'rgba(200, 146, 42, 0.3)', backgroundColor: 'rgba(10, 16, 32, 0.5)' }}>
            <button 
              onClick={() => setMode('engineer')}
              className={`flex-1 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all ${mode === 'engineer' ? 'shadow-sm' : ''}`}
              style={{
                backgroundColor: mode === 'engineer' ? '#c8922a' : 'transparent',
                color: mode === 'engineer' ? '#0d1526' : '#7a8fa6'
              }}
            >
              Engineer
            </button>
            <button 
              onClick={() => setMode('client')}
              className={`flex-1 py-1.5 text-xs font-semibold tracking-wider uppercase transition-all ${mode === 'client' ? 'shadow-sm' : ''}`}
              style={{
                backgroundColor: mode === 'client' ? '#c8922a' : 'transparent',
                color: mode === 'client' ? '#0d1526' : '#7a8fa6'
              }}
            >
              Client
            </button>
          </div>
        </div>

        {/* PROPERTY SELECTOR */}
        <div className="p-6 border-b" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
          <label className="block text-[10px] font-bold tracking-[0.15em] mb-3 uppercase" style={{ color: '#7a8fa6' }}>
            Active Property
          </label>
          <div className="flex gap-2">
            <select 
              className="flex-1 bg-transparent border rounded-sm px-3 py-2 text-sm text-white appearance-none outline-none focus:border-[#c8922a]"
              style={{ borderColor: 'rgba(200, 146, 42, 0.5)' }}
            >
              <option value="1">Alpha Site — 420.5 Acres</option>
              <option value="2">Bravo Site — 105.2 Acres</option>
            </select>
            <button className="px-3 border rounded-sm flex items-center justify-center hover:bg-[#c8922a]/10 transition-colors" style={{ borderColor: 'rgba(200, 146, 42, 0.5)', color: '#c8922a' }}>
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* ADDRESS SEARCH */}
        <div className="p-6 border-b" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
          <label className="block text-[10px] font-bold tracking-[0.15em] mb-3 uppercase" style={{ color: '#7a8fa6' }}>
            Address Search
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#7a8fa6' }} />
            <input 
              type="text" 
              placeholder="Enter coordinates or address..."
              className="w-full bg-transparent border rounded-sm pl-9 pr-3 py-2 text-sm text-white outline-none focus:border-[#c8922a] placeholder:text-[#7a8fa6]/50"
              style={{ borderColor: 'rgba(200, 146, 42, 0.5)' }}
            />
          </div>
        </div>

        {/* LAYER VISIBILITY */}
        <div className="border-b" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
          <button 
            className="w-full p-6 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
            onClick={() => setLayersOpen(!layersOpen)}
          >
            <div className="flex items-center gap-3">
              <Layers size={16} style={{ color: '#c8922a' }} />
              <span className="text-[11px] font-bold tracking-[0.15em] uppercase text-white">Layer Visibility</span>
            </div>
            {layersOpen ? <ChevronDown size={14} style={{ color: '#c8922a' }} /> : <ChevronRight size={14} style={{ color: '#c8922a' }} />}
          </button>
          
          {layersOpen && (
            <div className="px-6 pb-6 space-y-3">
              {Object.entries(layerStates).map(([layer, isActive]) => (
                <div key={layer} className="flex items-center justify-between group cursor-pointer" onClick={() => toggleLayer(layer)}>
                  <div className="flex items-center gap-3">
                    <span 
                      className="text-[10px]" 
                      style={{ color: isActive ? layerColors[layer as keyof typeof layerColors] : '#475569' }}
                    >
                      ■
                    </span>
                    <span className="text-xs tracking-wide" style={{ color: isActive ? '#e2e8f0' : '#7a8fa6' }}>
                      {layer}
                    </span>
                  </div>
                  
                  {/* Custom Toggle Switch */}
                  <div 
                    className="w-8 h-4 rounded-full relative transition-colors duration-300 border"
                    style={{ 
                      backgroundColor: isActive ? 'rgba(200, 146, 42, 0.2)' : 'rgba(255,255,255,0.05)',
                      borderColor: isActive ? '#c8922a' : 'rgba(122, 143, 166, 0.3)'
                    }}
                  >
                    <div 
                      className="absolute top-[1px] w-3 h-3 rounded-full transition-transform duration-300"
                      style={{
                        backgroundColor: isActive ? '#c8922a' : '#7a8fa6',
                        left: isActive ? 'calc(100% - 14px)' : '2px'
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTIONS */}
        <div className="flex-1">
          {sections.map((section) => {
            const isOpen = openSections[section];
            return (
              <div key={section} className="border-b" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
                <button 
                  className="w-full p-5 flex items-center justify-between hover:bg-white/[0.02] transition-colors text-left"
                  onClick={() => toggleSection(section)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-4 rounded-sm" style={{ backgroundColor: isOpen ? '#c8922a' : 'transparent' }} />
                    <span className="text-[11px] font-bold tracking-[0.15em] uppercase" style={{ color: isOpen ? '#c8922a' : '#7a8fa6' }}>
                      {section}
                    </span>
                  </div>
                  {isOpen ? <ChevronDown size={14} style={{ color: '#c8922a' }} /> : <ChevronRight size={14} style={{ color: '#7a8fa6' }} />}
                </button>
                
                {isOpen && (
                  <div className="px-9 pb-6 text-sm" style={{ color: '#7a8fa6' }}>
                    {section === 'I — CLIENT BRIEF' && (
                      <div className="space-y-4">
                        <p className="leading-relaxed text-xs">Primary objective: Establish self-sufficient resilient compound with minimal ecological footprint.</p>
                        <div className="p-3 border rounded-sm bg-[#0a1020]/50" style={{ borderColor: 'rgba(200, 146, 42, 0.2)' }}>
                          <div className="flex justify-between text-[10px] uppercase tracking-wider mb-2 text-white">
                            <span>Threat Level</span>
                            <span style={{ color: '#c8922a' }}>Moderate</span>
                          </div>
                          <div className="w-full bg-[#1e293b] h-1 rounded-full overflow-hidden">
                            <div className="h-full bg-[#c8922a] w-[45%]" />
                          </div>
                        </div>
                        <button className="text-[10px] tracking-widest uppercase border-b pb-1 hover:text-white transition-colors" style={{ borderColor: '#c8922a', color: '#c8922a' }}>
                          Edit Parameters →
                        </button>
                      </div>
                    )}
                    {section !== 'I — CLIENT BRIEF' && (
                      <div className="py-4 text-center border border-dashed opacity-50 text-xs" style={{ borderColor: '#7a8fa6' }}>
                        No data available for this section.
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT MAP AREA */}
      <div className="flex-1 relative overflow-hidden bg-[#0a1020]">
        
        {/* Hex Grid Background Pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='104' viewBox='0 0 60 104' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l30 17.32v34.64L30 69.28 0 51.96V17.32L30 0z' fill='none' stroke='%23c8922a' stroke-width='1'/%3E%3C/svg%3E")`,
            backgroundSize: '60px 104px'
          }}
        />

        {/* Topographic Lines (Simulated with radial gradients) */}
        <div 
          className="absolute inset-0 opacity-[0.1] pointer-events-none"
          style={{
            backgroundImage: 'radial-gradient(circle at 30% 40%, transparent 20%, #c8922a 21%, transparent 22%, transparent 35%, #c8922a 36%, transparent 37%, transparent 50%, #c8922a 51%, transparent 52%)',
            backgroundSize: '100% 100%'
          }}
        />

        {/* Property Boundary Polygon */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px]">
          <svg width="100%" height="100%" viewBox="0 0 600 400" className="opacity-80 drop-shadow-lg">
            {/* Fill */}
            <polygon 
              points="100,50 450,80 550,250 400,380 150,320 50,200" 
              fill="rgba(200, 146, 42, 0.05)" 
              stroke="#c8922a" 
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            {/* Structure Markers */}
            <rect x="250" y="150" width="40" height="30" fill="rgba(200, 146, 42, 0.2)" stroke="#c8922a" strokeWidth="1" />
            <rect x="200" y="220" width="25" height="25" fill="rgba(200, 146, 42, 0.2)" stroke="#c8922a" strokeWidth="1" />
          </svg>

          {/* Markers */}
          <div className="absolute top-[145px] left-[245px] w-3 h-3 bg-[#c8922a] rotate-45 shadow-[0_0_10px_rgba(200,146,42,0.8)]" />
          <div className="absolute top-[215px] left-[195px] w-3 h-3 bg-[#c8922a] rotate-45 shadow-[0_0_10px_rgba(200,146,42,0.8)]" />
          <div className="absolute top-[315px] left-[395px] w-2 h-2 border border-[#c8922a] rotate-45" />
          <div className="absolute top-[45px] left-[95px] w-2 h-2 border border-[#c8922a] rotate-45" />
        </div>

        {/* UI Overlays on Map */}
        <div className="absolute bottom-8 right-8 flex gap-3">
          <div className="bg-[#0d1526] border px-4 py-2 rounded-sm shadow-xl flex items-center gap-4" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-[#7a8fa6]">Coordinates</div>
              <div className="text-xs font-mono text-white">45.0234° N, 110.1234° W</div>
            </div>
            <div className="w-[1px] h-6 bg-[#c8922a]/30" />
            <div className="text-right">
              <div className="text-[9px] uppercase tracking-widest text-[#7a8fa6]">Elevation</div>
              <div className="text-xs font-mono text-[#c8922a]">1,204m</div>
            </div>
          </div>
        </div>

        <div className="absolute top-8 right-8">
          <div className="flex flex-col gap-2">
            <button className="w-10 h-10 bg-[#0d1526] border rounded-sm shadow-xl flex items-center justify-center text-[#c8922a] hover:bg-[#c8922a]/10 transition-colors" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
              <MapIcon size={18} />
            </button>
            <button className="w-10 h-10 bg-[#0d1526] border rounded-sm shadow-xl flex items-center justify-center text-[#7a8fa6] hover:bg-[#c8922a]/10 transition-colors hover:text-[#c8922a]" style={{ borderColor: 'rgba(200, 146, 42, 0.3)' }}>
              <Settings size={18} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
