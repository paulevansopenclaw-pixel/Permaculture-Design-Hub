import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const img = (name: string) => `${BASE}/images/${name}`;

function EnquireButton({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/enquire"
      className="inline-block bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] rounded-none px-8 py-4 text-sm font-mono uppercase tracking-widest transition-colors"
    >
      {children}
    </Link>
  );
}

export default function PatternLanding() {
  return (
    <div className="min-h-screen bg-[#fcf9f2] text-[#1a1c18] font-serif antialiased selection:bg-[#4a5d3f] selection:text-[#fcf9f2]">
      <style dangerouslySetInnerHTML={{ __html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        .img-tint { filter: grayscale(15%) sepia(12%); mix-blend-mode: multiply; opacity: 0.92; }
      `}} />

      {/* Header */}
      <header className="px-6 py-8 border-b border-[#2c3525]/15 flex justify-between items-center max-w-7xl mx-auto">
        <div className="text-2xl font-semibold tracking-tight">Pattern</div>
        <div className="font-mono text-xs uppercase tracking-widest text-[#4a5d3f]">Vol. I — Design Studio</div>
      </header>

      {/* ── Hero: asymmetric split ── */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[1fr_420px] lg:grid-cols-[1fr_560px] min-h-[72vh]">
        {/* Left: headline */}
        <div className="flex flex-col justify-center px-6 md:px-12 py-20 md:py-0 border-b md:border-b-0 md:border-r border-[#2c3525]/15">
          <h1 className="text-5xl md:text-6xl lg:text-7xl font-light tracking-tight leading-[1.05] mb-8 text-[#1a1c18]">
            Cultivate<br />your land.<br />
            <span className="italic text-[#4a5d3f]">Regenerate<br />your world.</span>
          </h1>
          <p className="text-base md:text-lg max-w-sm text-[#2c3525]/75 mb-10 leading-relaxed">
            We help you turn your property into a thriving, productive, and resilient permaculture ecosystem. Design with nature, not against it.
          </p>
          <div>
            <EnquireButton>Start your enquiry</EnquireButton>
          </div>
        </div>

        {/* Right: stacked image pair */}
        <div className="hidden md:grid grid-rows-2 h-full">
          <div className="overflow-hidden border-b border-[#2c3525]/15">
            <img src={img("food-forest.png")} alt="Food forest" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="overflow-hidden">
            <img src={img("swale-contour.png")} alt="Swales on contour" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
        </div>
      </section>

      {/* ── Editorial collage ── */}
      <section className="border-t border-[#2c3525]/15">
        {/* Row 1: wide landscape + text card */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] border-b border-[#2c3525]/15" style={{height: "360px"}}>
          <div className="overflow-hidden border-r border-[#2c3525]/15">
            <img src={img("property-aerial.png")} alt="Aerial view of homestead" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="bg-[#e8e4da] flex flex-col justify-end p-8 md:p-10">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f] mb-3">The practice</p>
            <p className="text-2xl md:text-3xl font-light leading-snug text-[#1a1c18]">
              Every site has a<br /><em>pattern waiting<br />to be read.</em>
            </p>
          </div>
        </div>

        {/* Row 2: three equal columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 border-b border-[#2c3525]/15" style={{height: "280px"}}>
          <div className="overflow-hidden border-r border-[#2c3525]/15">
            <img src={img("hands-soil.png")} alt="Hands in soil" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="overflow-hidden border-r border-[#2c3525]/15">
            <img src={img("meadow-pollinators.png")} alt="Pollinator meadow" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="overflow-hidden">
            <img src={img("harvest-basket.png")} alt="Seasonal harvest" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
        </div>

        {/* Row 3: narrow + wide + dark pull-quote */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr]" style={{height: "320px"}}>
          <div className="overflow-hidden border-r border-[#2c3525]/15">
            <img src={img("herbs-closeup.png")} alt="Herbs" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="overflow-hidden border-r border-[#2c3525]/15">
            <img src={img("garden-people.png")} alt="Designers at work in the garden" className="img-tint w-full h-full object-cover transition-transform duration-700 hover:scale-105" />
          </div>
          <div className="bg-[#2c3525] flex flex-col justify-center px-8 py-10">
            <p className="text-[#fcf9f2]/50 font-mono text-[9px] uppercase tracking-widest mb-4">Principle</p>
            <p className="text-[#fcf9f2] text-lg font-light italic leading-snug">
              "Observe and interact."
            </p>
          </div>
        </div>
      </section>

      {/* ── The Pattern Method — staggered ── */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="flex items-baseline gap-6 mb-16">
          <h2 className="text-3xl md:text-4xl font-light italic text-[#1a1c18]">The Pattern Method</h2>
          <div className="flex-1 h-px bg-[#2c3525]/20 hidden md:block"></div>
        </div>

        {/* Phase I — left-anchored */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] border-t border-[#2c3525]/20">
          <div className="py-10 pr-0 md:pr-12 border-b md:border-b-0 md:border-r border-[#2c3525]/20">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase I</span>
            <h3 className="text-2xl font-medium mt-3 text-[#1a1c18]">Map your land</h3>
          </div>
          <div className="py-10 md:pl-12 border-b border-[#2c3525]/20">
            <p className="text-[#2c3525]/80 leading-relaxed max-w-lg">We study your topography, hydrology, climate, and soil to understand the unique language of your property.</p>
          </div>
        </div>

        {/* Phase II — center-shifted */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_2fr] border-b border-[#2c3525]/20">
          <div className="hidden md:block" />
          <div className="py-10 md:px-8 border-b md:border-b-0 md:border-x border-[#2c3525]/20 text-center">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase II</span>
            <h3 className="text-2xl font-medium mt-3 text-[#1a1c18]">Design with nature</h3>
          </div>
          <div className="py-10 md:pl-12">
            <p className="text-[#2c3525]/80 leading-relaxed max-w-sm">Drafting a holistic master plan that integrates water capture, food forests, animal systems, and human habitats.</p>
          </div>
        </div>

        {/* Phase III — right-anchored */}
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] border-b border-[#2c3525]/20">
          <div className="hidden md:block border-r border-[#2c3525]/20" />
          <div className="py-10 md:pl-12">
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase III</span>
            <h3 className="text-2xl font-medium mt-3 mb-3 text-[#1a1c18]">Watch it flourish</h3>
            <p className="text-[#2c3525]/80 leading-relaxed text-sm">Implementation guidance that establishes an ecosystem growing richer year after year.</p>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA: image-led ── */}
      <section className="border-t border-[#2c3525]/15">
        <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr]">
          <div className="relative min-h-[440px]">
            <img src={img("food-forest.png")} alt="Lush food forest" className="absolute inset-0 w-full h-full object-cover img-tint" />
          </div>
          <div className="p-12 md:p-16 flex flex-col justify-center bg-[#f0ede4] border-l border-[#2c3525]/15">
            <p className="font-mono text-[10px] uppercase tracking-widest text-[#4a5d3f] mb-6">Ready to begin?</p>
            <h2 className="text-3xl md:text-4xl font-light mb-6 leading-tight">Observe and<br />interact with<br /><em>your land.</em></h2>
            <p className="text-[#2c3525]/75 mb-10 text-sm leading-relaxed max-w-xs">Every great design begins with a conversation. Let us help you realise the full potential of your property.</p>
            <div>
              <EnquireButton>Begin your design</EnquireButton>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-[#2c3525]/15 flex flex-col md:flex-row justify-between items-center gap-4 bg-[#e8e4da]/30 max-w-7xl mx-auto">
        <div className="text-2xl font-semibold tracking-tight text-[#1a1c18]">Pattern</div>
        <div className="flex gap-6 font-mono text-xs uppercase tracking-wider text-[#4a5d3f]">
          <span>© {new Date().getFullYear()} Pattern Studio</span>
          <span>·</span>
          <Link href="/enquire" className="hover:text-[#1a1c18] transition-colors border-b border-transparent hover:border-[#1a1c18]">Enquire</Link>
        </div>
      </footer>
    </div>
  );
}
