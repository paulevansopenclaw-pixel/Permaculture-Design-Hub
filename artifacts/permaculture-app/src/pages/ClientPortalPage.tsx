import { Link, useLocation } from "wouter";
import { useAppStore } from "@/store/useAppStore";
import { useGetProperty, getGetPropertyQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { resolveObjectUrl } from "@/lib/objectUrl";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const img = (name: string) => `${BASE}/images/${name}`;

const TIERS = [
  {
    phase: "Phase I",
    name: "Discovery",
    tagline: "Your project takes root.",
    description: "Site overview, your submitted brief, and inspiration board.",
    previewImg: "food-forest.png",
  },
  {
    phase: "Phase II",
    name: "Site Reading",
    tagline: "Understanding your land.",
    description: "Terrain analysis, solar & wind sectors, water budget, soil assessment.",
    previewImg: "swale-contour.png",
    linkLabel: "View Site Analysis",
    linkHref: "/analysis",
  },
  {
    phase: "Phase III",
    name: "The Design",
    tagline: "Your master plan, revealed.",
    description: "Zone layout, forest garden layers, water systems, plant guilds.",
    previewImg: "property-aerial.png",
    linkLabel: "View Design Plans",
    linkHref: "/plans",
  },
  {
    phase: "Phase IV",
    name: "Full Dossier",
    tagline: "The complete picture.",
    description: "Implementation guide, full presentation, downloadable design report.",
    previewImg: "garden-people.png",
    linkLabel: "Open Presentation",
  },
];

function LockIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function TierCard({
  tier,
  index,
  clientTier,
  propertyId,
  isLast,
}: {
  tier: typeof TIERS[number];
  index: number;
  clientTier: number;
  propertyId: string;
  isLast: boolean;
}) {
  const isUnlocked = index <= clientTier;
  const isNext = index === clientTier + 1;

  if (isUnlocked) {
    return (
      <div className={`border border-[#2c3525]/20 bg-[#fcf9f2] ${!isLast ? "border-b-0" : ""}`}>
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr]">
          {/* Left label strip */}
          <div className="border-b md:border-b-0 md:border-r border-[#2c3525]/15 p-8 md:p-10 flex flex-col justify-between bg-[#f0ede4]">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f]">{tier.phase}</span>
              <h3 className="text-2xl font-light mt-2 text-[#1a1c18]">{tier.name}</h3>
            </div>
            <div className="mt-6 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#4a5d3f] flex items-center justify-center text-[#fcf9f2]">
                <CheckIcon />
              </span>
              <span className="font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Unlocked</span>
            </div>
          </div>

          {/* Right content */}
          <div className="p-8 md:p-10">
            <p className="text-xl font-light italic text-[#2c3525] mb-2">{tier.tagline}</p>
            <p className="text-sm text-[#2c3525]/70 leading-relaxed mb-6">{tier.description}</p>

            {/* Tier-specific content */}
            {index === 0 && (
              <div className="text-sm font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] border-t border-[#2c3525]/15 pt-4">
                Your site is active in the Pattern studio.
              </div>
            )}
            {index > 0 && tier.linkHref && (
              <Link
                href={index === 3 ? `/presentation/${propertyId}` : tier.linkHref}
                className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-[#fcf9f2] bg-[#2c3525] hover:bg-[#4a5d3f] px-6 py-3 transition-colors"
              >
                {tier.linkLabel}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden ${!isLast ? "border-b-0" : ""} border border-[#2c3525]/20`} style={{ minHeight: 260 }}>
      {/* Blurred background image */}
      <div className="absolute inset-0">
        <img
          src={img(tier.previewImg)}
          alt=""
          aria-hidden
          className="w-full h-full object-cover"
          style={{ filter: "blur(12px) brightness(0.25) saturate(0.6)", transform: "scale(1.1)" }}
        />
      </div>

      {/* Content overlay */}
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between h-full p-10 md:p-14 gap-8">
        <div className="flex flex-col items-start gap-4">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#fcf9f2]/50">{tier.phase}</span>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full border border-[#fcf9f2]/30 flex items-center justify-center text-[#fcf9f2]/60">
              <LockIcon />
            </div>
            <h3 className="text-2xl md:text-3xl font-light text-[#fcf9f2]">{tier.name}</h3>
          </div>
          <p className="text-[#fcf9f2]/60 text-sm max-w-sm leading-relaxed">{tier.description}</p>
        </div>

        <div className="flex flex-col items-center md:items-end gap-3 shrink-0">
          {isNext && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-[#fcf9f2]/40 mb-1">Next to unlock</span>
          )}
          <button
            className="font-mono text-xs uppercase tracking-widest border border-[#fcf9f2]/30 text-[#fcf9f2]/70 hover:border-[#fcf9f2]/60 hover:text-[#fcf9f2] px-6 py-3 transition-colors"
            onClick={() => alert("Contact your designer to unlock this phase.")}
          >
            Request access →
          </button>
        </div>
      </div>
    </div>
  );
}

function NoProjectScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center py-32 px-6 text-center">
      <p className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f] mb-6">Your journey</p>
      <h2 className="text-4xl md:text-5xl font-light text-[#1a1c18] mb-6 leading-tight">
        No active project<br /><em className="text-[#4a5d3f]">yet.</em>
      </h2>
      <p className="text-[#2c3525]/70 max-w-sm mb-10 leading-relaxed">
        Your designer will link your project here once your design journey begins. Check back soon, or start an enquiry if you haven't already.
      </p>
      <Link
        href="/enquire"
        className="font-mono text-xs uppercase tracking-widest bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] px-8 py-4 transition-colors"
      >
        Start an enquiry
      </Link>
    </div>
  );
}

export default function ClientPortalPage() {
  const { activePropertyId, setRole } = useAppStore();
  const { logout } = useAuth();
  const [, navigate] = useLocation();

  const { data: property, isLoading } = useGetProperty(activePropertyId ?? "", {
    query: { enabled: !!activePropertyId, queryKey: getGetPropertyQueryKey(activePropertyId ?? "") },
  });

  const clientTier = (property?.clientTier ?? 0) as number;

  return (
    <div className="min-h-screen bg-[#fcf9f2] text-[#1a1c18] font-serif antialiased flex flex-col">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}} />

      {/* Header */}
      <header className="px-6 py-6 border-b border-[#2c3525]/15 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="text-2xl font-semibold tracking-tight hover:opacity-70 transition-opacity">Pattern</Link>
        <div className="flex items-center gap-6">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f] hidden md:block">
            Your Design Journey
          </span>
          <button
            onClick={() => { setRole("designer"); navigate("/properties"); }}
            className="font-mono text-[10px] uppercase tracking-widest text-[#2c3525]/50 hover:text-[#2c3525] border-b border-transparent hover:border-[#2c3525]/40 pb-px transition-all"
          >
            ← Studio
          </button>
        </div>
      </header>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f] animate-pulse">Loading your project…</span>
        </div>
      )}

      {!isLoading && !activePropertyId && <NoProjectScreen />}

      {!isLoading && property && (
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-16">

          {/* Property hero */}
          <div className="mb-16 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-8 items-end border-b border-[#2c3525]/15 pb-12">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f]">Your property</span>
              <h1 className="text-4xl md:text-5xl font-light tracking-tight mt-3 text-[#1a1c18] leading-tight">
                {property.name}
              </h1>
              {(property.areaHectares ?? 0) > 0 && (
                <p className="text-[#2c3525]/60 font-mono text-xs mt-3">
                  {property.areaHectares?.toFixed(2)} ha · {property.areaAcres?.toFixed(2)} ac
                </p>
              )}
            </div>

            {/* Tier progress */}
            <div className="flex flex-col items-end gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f]">Design progress</span>
              <div className="flex items-center gap-2">
                {TIERS.map((t, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full border flex items-center justify-center transition-colors ${
                        i <= clientTier
                          ? "bg-[#2c3525] border-[#2c3525] text-[#fcf9f2]"
                          : "border-[#2c3525]/25 text-[#2c3525]/30"
                      }`}
                    >
                      {i <= clientTier ? (
                        <CheckIcon />
                      ) : (
                        <span className="font-mono text-[9px]">{i + 1}</span>
                      )}
                    </div>
                    {i < TIERS.length - 1 && (
                      <div className={`w-6 h-px ${i < clientTier ? "bg-[#2c3525]" : "bg-[#2c3525]/20"}`} />
                    )}
                  </div>
                ))}
              </div>
              <span className="font-mono text-[9px] uppercase tracking-wider text-[#2c3525]/50">
                {TIERS[Math.min(clientTier, TIERS.length - 1)].name} unlocked
              </span>
            </div>
          </div>

          {/* Tier cards */}
          <div className="border border-[#2c3525]/20">
            {TIERS.map((tier, i) => (
              <TierCard
                key={i}
                tier={tier}
                index={i}
                clientTier={clientTier}
                propertyId={property.id}
                isLast={i === TIERS.length - 1}
              />
            ))}
          </div>

          {/* Tile image if available */}
          {property.tileImage && (
            <div className="mt-12 border border-[#2c3525]/15 overflow-hidden" style={{ height: 240 }}>
              <img
                src={resolveObjectUrl(property.tileImage)}
                alt={property.name}
                className="w-full h-full object-cover"
                style={{ filter: "grayscale(15%) sepia(10%)", opacity: 0.9 }}
              />
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="border-t border-[#2c3525]/15 py-8 px-6">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <span className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f]">Pattern Studio</span>
          <Link href="/enquire" className="font-mono text-[10px] uppercase tracking-widest text-[#2c3525]/50 hover:text-[#2c3525] border-b border-transparent hover:border-[#2c3525]/40 pb-px transition-all">
            New enquiry
          </Link>
        </div>
      </footer>
    </div>
  );
}
