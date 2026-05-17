import React, { useState } from 'react';
import { ChevronRight, Grid3X3, Plus, Search, ChevronDown } from 'lucide-react';

const LAYERS = [
  { id: 'satellite', label: 'Satellite Imagery', color: '#3b82f6' },
  { id: 'boundary', label: 'Property Boundary', color: '#16a34a' },
  { id: 'contours', label: 'Terrain Contours', color: '#ef4444' },
  { id: 'sectors', label: 'Sectors', color: '#d97706' },
  { id: 'solar', label: 'Solar Arcs', color: '#f59e0b' },
  { id: 'water', label: 'Water Analysis', color: '#0ea5e9' },
  { id: 'structures', label: 'Structures', color: '#6366f1' },
  { id: 'pathways', label: 'Pathways', color: '#78716c' },
  { id: 'zones', label: 'Zone Mapping', color: '#84cc16' },
];

const SECTIONS = [
  'Client Brief',
  'Property Boundary',
  'Terrain Contours',
  'Sector Analysis',
  'Water Automation',
  'Feedback Pins',
  'Structures',
  'Access & Pathways',
  'Zone Mapping',
];

function Toggle({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className="relative inline-flex h-4 w-7 items-center rounded-full transition-colors duration-200 focus:outline-none flex-shrink-0"
      style={{ backgroundColor: active ? '#2563eb' : '#d1d5db' }}
    >
      <span
        className="inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform duration-200"
        style={{ transform: active ? 'translateX(14px)' : 'translateX(2px)' }}
      />
    </button>
  );
}

export default function Clean() {
  const [mode, setMode] = useState<'engineer' | 'client'>('engineer');
  const [layersOpen, setLayersOpen] = useState(true);
  const [activeLayers, setActiveLayers] = useState<Record<string, boolean>>(
    Object.fromEntries(LAYERS.map((l) => [l.id, l.id !== 'contours' && l.id !== 'sectors']))
  );
  const [openSection, setOpenSection] = useState<number | null>(0);

  const toggleLayer = (id: string) =>
    setActiveLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="flex h-screen w-full bg-gray-50 overflow-hidden" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* SIDEBAR */}
      <div className="w-[280px] flex-shrink-0 h-full bg-white border-r border-gray-200 flex flex-col overflow-y-auto">

        {/* HEADER */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm font-semibold text-gray-900 tracking-tight">TerraGuard</div>
              <div className="text-[10px] text-gray-400 mt-0.5 tracking-wide uppercase">Land Security Platform</div>
            </div>
            <button className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <Grid3X3 size={15} />
            </button>
          </div>

          {/* MODE TOGGLE */}
          <div className="flex gap-1 p-0.5 bg-gray-100 rounded-lg">
            <button
              onClick={() => setMode('engineer')}
              className="flex-1 py-1 text-xs font-medium rounded-md transition-all duration-150"
              style={
                mode === 'engineer'
                  ? { backgroundColor: '#fff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                  : { color: '#6b7280' }
              }
            >
              Engineer
            </button>
            <button
              onClick={() => setMode('client')}
              className="flex-1 py-1 text-xs font-medium rounded-md transition-all duration-150"
              style={
                mode === 'client'
                  ? { backgroundColor: '#fff', color: '#111827', boxShadow: '0 1px 2px rgba(0,0,0,0.08)' }
                  : { color: '#6b7280' }
              }
            >
              Client
            </button>
          </div>
        </div>

        {/* PROPERTY SELECTOR */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Active Property</div>
          <div className="flex gap-1.5">
            <select className="flex-1 text-xs text-gray-800 bg-white border border-gray-200 rounded-md px-2.5 py-1.5 outline-none appearance-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all">
              <option>Echo Valley Ranch</option>
              <option>Northridge Estate</option>
            </select>
            <button className="px-2.5 py-1.5 rounded-md border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors text-xs">
              <Plus size={13} />
            </button>
          </div>
        </div>

        {/* ADDRESS SEARCH */}
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Address Search</div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search address or coordinates…"
              className="w-full text-xs text-gray-800 bg-white border border-gray-200 rounded-md pl-7 pr-3 py-1.5 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all placeholder:text-gray-400"
            />
          </div>
        </div>

        {/* LAYER VISIBILITY */}
        <div className="border-b border-gray-100">
          <button
            onClick={() => setLayersOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors"
          >
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Layers</span>
            {layersOpen
              ? <ChevronDown size={13} className="text-gray-400" />
              : <ChevronRight size={13} className="text-gray-400" />}
          </button>

          {layersOpen && (
            <div className="px-4 pb-3 space-y-2">
              {LAYERS.map((layer) => (
                <div key={layer.id} className="flex items-center gap-2">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: activeLayers[layer.id] ? layer.color : '#d1d5db' }}
                  />
                  <span
                    className="flex-1 text-xs"
                    style={{ color: activeLayers[layer.id] ? '#111827' : '#9ca3af' }}
                  >
                    {layer.label}
                  </span>
                  <Toggle active={activeLayers[layer.id]} onToggle={() => toggleLayer(layer.id)} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* SECTIONS */}
        <div className="flex-1">
          {SECTIONS.map((section, idx) => {
            const isOpen = openSection === idx;
            return (
              <div key={idx} className="border-b border-gray-100 last:border-b-0">
                <button
                  onClick={() => setOpenSection(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                >
                  <span
                    className="text-xs font-medium"
                    style={{ color: isOpen ? '#2563eb' : '#374151' }}
                  >
                    {section}
                  </span>
                  <ChevronRight
                    size={13}
                    className="transition-transform duration-200 flex-shrink-0"
                    style={{
                      color: isOpen ? '#2563eb' : '#9ca3af',
                      transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    }}
                  />
                </button>

                {isOpen && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-gray-500 leading-relaxed mb-2">
                      No data recorded yet. Assign a boundary to get started.
                    </p>
                    <button
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors"
                    >
                      Add details →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* MAP AREA */}
      <div className="flex-1 relative overflow-hidden bg-gray-100">

        {/* Grid */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'linear-gradient(#e5e7eb 1px, transparent 1px), linear-gradient(to right, #e5e7eb 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            opacity: 0.7,
          }}
        />

        {/* Property outline */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.9 }}>
          <polygon
            points="340,120 720,140 820,360 660,520 320,480 220,300"
            fill="rgba(37,99,235,0.04)"
            stroke="#2563eb"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <circle cx="340" cy="120" r="3" fill="#2563eb" />
          <circle cx="720" cy="140" r="3" fill="#2563eb" />
          <circle cx="820" cy="360" r="3" fill="#2563eb" />
          <circle cx="660" cy="520" r="3" fill="#2563eb" />
          <circle cx="320" cy="480" r="3" fill="#2563eb" />
          <circle cx="220" cy="300" r="3" fill="#2563eb" />
          <text x="490" y="340" textAnchor="middle" fill="#6b7280" fontSize="11" fontFamily="Inter,sans-serif" fontWeight="500">
            Echo Valley Ranch
          </text>
          <text x="490" y="356" textAnchor="middle" fill="#9ca3af" fontSize="10" fontFamily="Inter,sans-serif">
            420.5 ac
          </text>
        </svg>

        {/* Map controls */}
        <div className="absolute top-3 right-3 flex flex-col gap-1.5">
          {['+', '−'].map((label) => (
            <button
              key={label}
              className="w-7 h-7 bg-white border border-gray-200 rounded-md text-sm text-gray-600 font-medium hover:bg-gray-50 shadow-sm transition-colors flex items-center justify-center"
            >
              {label}
            </button>
          ))}
        </div>

        {/* Coordinate chip */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-white border border-gray-200 rounded-md px-3 py-1.5 shadow-sm">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
          <span className="text-[11px] text-gray-500 font-mono">45.0234° N  110.1234° W</span>
        </div>

        {/* Scale bar */}
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-1">
          <div className="flex items-end gap-0">
            <div className="w-16 border-b-2 border-l-2 border-gray-400 h-2" />
            <div className="w-16 border-b-2 border-r-2 border-gray-400 h-2 bg-gray-300 opacity-40" />
          </div>
          <span className="text-[10px] text-gray-400 font-mono">500m</span>
        </div>
      </div>
    </div>
  );
}
