import React from "react";
import { Button } from "@/components/ui/button";

export default function FieldAlmanac() {
  return (
    <div className="min-h-screen bg-[#fcf9f2] text-[#1a1c18] font-serif antialiased selection:bg-[#4a5d3f] selection:text-[#fcf9f2]">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=IBM+Plex+Mono:ital,wght@0,400;0,500;1,400&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}} />

      {/* Header */}
      <header className="px-6 py-8 border-b border-[#2c3525]/15 flex justify-between items-center max-w-7xl mx-auto">
        <div className="text-2xl font-semibold tracking-tight">Pattern</div>
        <div className="font-mono text-xs uppercase tracking-widest text-[#4a5d3f]">Vol. I — Design Studio</div>
      </header>

      {/* Hero */}
      <section className="px-6 py-24 md:py-32 max-w-5xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl font-light tracking-tight leading-[1.1] mb-8 text-[#1a1c18]">
          Cultivate your land.<br />
          <span className="italic text-[#4a5d3f]">Regenerate your world.</span>
        </h1>
        <p className="text-lg md:text-xl max-w-2xl mx-auto text-[#2c3525]/80 mb-12 leading-relaxed">
          We help you turn your property into a thriving, productive, and resilient permaculture ecosystem. Design with nature, not against it.
        </p>
        <Button className="bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] rounded-none px-8 py-6 text-sm font-mono uppercase tracking-widest transition-colors">
          Start your enquiry
        </Button>
      </section>

      {/* Collage / Grid */}
      <section className="border-y border-[#2c3525]/15 py-12 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-12 auto-rows-[180px] gap-4">

            <figure className="relative group col-span-2 md:col-span-7 row-span-2">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/food-forest.png" alt="Food forest" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] flex justify-between">
                <span>Fig 1. Multi-strata food forest</span>
                <span>01</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-1 md:col-span-5 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/swale-contour.png" alt="Swales on contour" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] flex justify-between">
                <span>Fig 2. Hydrology & earthworks</span>
                <span>02</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-1 md:col-span-3 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/hands-soil.png" alt="Hands in soil" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">
                <span>Fig 3. Soil health</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-1 md:col-span-2 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/herbs-closeup.png" alt="Herbs" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">
                <span>Fig 4. Herbs</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-1 md:col-span-4 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/meadow-pollinators.png" alt="Meadow" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] flex justify-between">
                <span>Fig 5. Pollinator ecology</span>
                <span>03</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-1 md:col-span-4 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/harvest-basket.png" alt="Harvest basket" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">
                <span>Fig 6. Seasonal yield</span>
              </figcaption>
            </figure>

            <figure className="relative group col-span-2 md:col-span-8 row-span-1">
              <div className="overflow-hidden bg-[#e8e4da] h-full border border-[#2c3525]/10 p-1">
                <img src="/__mockup/images/property-aerial.png" alt="Aerial homestead" className="w-full h-full object-cover grayscale-[20%] sepia-[15%] mix-blend-multiply opacity-90 transition-transform duration-700 group-hover:scale-105" />
              </div>
              <figcaption className="absolute bottom-2 left-2 right-2 bg-[#fcf9f2]/85 backdrop-blur-sm px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f] flex justify-between">
                <span>Fig 7. Whole-site zonation</span>
                <span>04</span>
              </figcaption>
            </figure>

          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-24 px-6 max-w-5xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-light italic text-[#1a1c18] mb-6">The Pattern Method</h2>
          <div className="h-px w-16 bg-[#2c3525]/30 mx-auto"></div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-12 md:gap-8">
          <div className="relative pt-6 border-t border-[#2c3525]/20">
            <div className="absolute top-0 left-0 -mt-2 bg-[#fcf9f2] pr-4 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase I</div>
            <h3 className="text-xl font-medium mb-3 text-[#1a1c18]">Map your land</h3>
            <p className="text-[#2c3525]/80 leading-relaxed text-sm">We study your topography, hydrology, climate, and soil to understand the unique language of your property.</p>
          </div>
          <div className="relative pt-6 border-t border-[#2c3525]/20">
            <div className="absolute top-0 left-0 -mt-2 bg-[#fcf9f2] pr-4 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase II</div>
            <h3 className="text-xl font-medium mb-3 text-[#1a1c18]">Design with nature</h3>
            <p className="text-[#2c3525]/80 leading-relaxed text-sm">Drafting a holistic master plan that integrates water capture, food forests, animal systems, and human habitats.</p>
          </div>
          <div className="relative pt-6 border-t border-[#2c3525]/20">
            <div className="absolute top-0 left-0 -mt-2 bg-[#fcf9f2] pr-4 font-mono text-[10px] uppercase tracking-wider text-[#4a5d3f]">Phase III</div>
            <h3 className="text-xl font-medium mb-3 text-[#1a1c18]">Watch it flourish</h3>
            <p className="text-[#2c3525]/80 leading-relaxed text-sm">Implementation guidance to bring the design to life, establishing an ecosystem that grows richer year after year.</p>
          </div>
        </div>
      </section>

      {/* Additional full-width image & CTA */}
      <section className="border-t border-[#2c3525]/15">
        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="p-12 md:p-24 flex flex-col justify-center border-b md:border-b-0 md:border-r border-[#2c3525]/15 bg-[#f5f1e6]">
            <h2 className="text-4xl md:text-5xl font-light mb-6 leading-tight">Ready to observe<br />and interact?</h2>
            <p className="text-[#2c3525]/80 mb-10 max-w-md text-lg">Every great design begins with a conversation. Let us help you realize the potential of your land.</p>
            <div>
              <Button className="bg-[#2c3525] text-[#fcf9f2] hover:bg-[#4a5d3f] rounded-none px-8 py-6 text-sm font-mono uppercase tracking-widest transition-colors">
                Begin your design
              </Button>
            </div>
          </div>
          <div className="relative min-h-[500px]">
             <img src="/__mockup/images/garden-people.png" alt="People in garden" className="absolute inset-0 w-full h-full object-cover grayscale-[20%] sepia-[20%] mix-blend-multiply opacity-90" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 text-center border-t border-[#2c3525]/15 flex flex-col items-center bg-[#e8e4da]/30">
        <div className="text-3xl font-semibold tracking-tight text-[#1a1c18] mb-6">Pattern</div>
        <div className="flex gap-6 font-mono text-xs uppercase tracking-wider text-[#4a5d3f]">
          <span>© {new Date().getFullYear()} Pattern Studio</span>
          <span>·</span>
          <a href="#" className="hover:text-[#1a1c18] transition-colors border-b border-transparent hover:border-[#1a1c18]">Journal</a>
          <span>·</span>
          <a href="#" className="hover:text-[#1a1c18] transition-colors border-b border-transparent hover:border-[#1a1c18]">Enquire</a>
        </div>
      </footer>
    </div>
  );
}
