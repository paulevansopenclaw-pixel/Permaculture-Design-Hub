import React from 'react';
import { Button } from '@/components/ui/button';
import { ArrowRight, Leaf, Map, Sprout } from 'lucide-react';

export default function LivingMosaic() {
  return (
    <div className="min-h-screen bg-[#F9F6F0] text-[#2C3522] font-sans selection:bg-[#E27D60] selection:text-white">
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=Lato:wght@300;400;700&display=swap');
        
        .font-serif {
          font-family: 'Playfair Display', serif;
        }
        .font-sans {
          font-family: 'Lato', sans-serif;
        }
      `}} />

      {/* Navigation */}
      <nav className="flex justify-between items-center py-6 px-8 md:px-16 border-b border-[#2C3522]/10">
        <div className="font-serif text-3xl font-bold tracking-tighter text-[#2C3522]">Pattern</div>
        <Button className="bg-[#859873] hover:bg-[#687B56] text-white rounded-none px-6 py-2 h-auto text-sm tracking-widest uppercase transition-colors">
          Start your enquiry
        </Button>
      </nav>

      {/* Hero Section */}
      <header className="px-8 md:px-16 pt-20 pb-32 max-w-7xl mx-auto flex flex-col items-center text-center">
        <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl leading-[1.1] mb-8 text-[#2C3522] max-w-4xl mx-auto">
          Design your land.<br/>
          <span className="italic text-[#E27D60]">Cultivate abundance.</span>
        </h1>
        <p className="text-lg md:text-xl text-[#4A5D23] max-w-2xl mx-auto mb-12 font-light leading-relaxed">
          We help you turn your property into a thriving, productive, regenerative permaculture ecosystem. A living mosaic crafted for generations to come.
        </p>
        <Button className="bg-[#E27D60] hover:bg-[#C86448] text-white rounded-none px-10 py-7 text-lg shadow-xl shadow-[#E27D60]/20 transition-all hover:scale-105">
          Begin your design
          <ArrowRight className="ml-3 w-5 h-5" />
        </Button>
      </header>

      {/* The Collage Section */}
      <section className="px-4 md:px-12 py-16 bg-[#F0EBE1]">
        <div className="max-w-7xl mx-auto relative h-[800px] md:h-[1200px]">
          
          <div className="absolute top-0 left-0 w-[45%] md:w-[40%] z-10 shadow-2xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/swale-contour.png" alt="Swale contour" className="w-full h-auto object-cover border-[12px] border-white" />
            <div className="bg-white px-4 py-2 text-xs uppercase tracking-widest text-[#859873] inline-block mt-2">Macro Patterns</div>
          </div>

          <div className="absolute top-[10%] right-[5%] w-[40%] md:w-[35%] z-20 shadow-2xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/hands-soil.png" alt="Hands in soil" className="w-full h-auto object-cover border-[12px] border-[#F9F6F0]" />
          </div>

          <div className="absolute top-[40%] left-[10%] w-[35%] md:w-[30%] z-30 shadow-2xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/food-forest.png" alt="Food forest" className="w-full h-auto object-cover border-[16px] border-white" />
          </div>

          <div className="absolute top-[35%] right-[15%] w-[45%] md:w-[45%] z-10 shadow-xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/garden-people.png" alt="People in garden" className="w-full h-auto object-cover border-[8px] border-[#2C3522]" />
            <div className="bg-[#2C3522] text-[#F9F6F0] px-4 py-2 text-xs uppercase tracking-widest inline-block mt-2">Community</div>
          </div>
          
          <div className="absolute bottom-[10%] left-[25%] w-[40%] md:w-[35%] z-40 shadow-2xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/harvest-basket.png" alt="Harvest basket" className="w-full h-auto object-cover border-[12px] border-white" />
          </div>

          <div className="absolute bottom-[0%] right-[5%] w-[35%] md:w-[30%] z-30 shadow-2xl hover:z-50 transition-all duration-500 hover:scale-[1.02]">
            <img src="/__mockup/images/herbs-closeup.png" alt="Herbs closeup" className="w-full h-auto object-cover border-[12px] border-[#E27D60]" />
          </div>

        </div>
      </section>

      {/* Feature Section */}
      <section className="py-32 px-8 md:px-16 max-w-6xl mx-auto">
        <h2 className="font-serif text-4xl md:text-5xl text-center mb-20 text-[#2C3522]">
          How it feels to work with <span className="italic">Pattern</span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16 md:gap-12">
          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-[#E27D60]/10 flex items-center justify-center mb-6 text-[#E27D60]">
              <Map className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h3 className="font-serif text-2xl font-bold mb-4">Map your land</h3>
            <p className="text-[#4A5D23] leading-relaxed font-light">
              We begin by deeply observing the contours, water flows, and microclimates of your property. Understanding what is already there is the foundation of brilliant design.
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-[#859873]/10 flex items-center justify-center mb-6 text-[#859873]">
              <Leaf className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h3 className="font-serif text-2xl font-bold mb-4">Design with nature</h3>
            <p className="text-[#4A5D23] leading-relaxed font-light">
              We weave together your goals with ecological wisdom. Every swale, food forest, and habitat zone is placed to create a self-sustaining, resilient system.
            </p>
          </div>

          <div className="flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-[#D4A373]/10 flex items-center justify-center mb-6 text-[#D4A373]">
              <Sprout className="w-8 h-8" strokeWidth={1.5} />
            </div>
            <h3 className="font-serif text-2xl font-bold mb-4">Watch it flourish</h3>
            <p className="text-[#4A5D23] leading-relaxed font-light">
              Step into a landscape that grows richer every year. Enjoy the harvest, the returning wildlife, and the peace of living in harmony with your environment.
            </p>
          </div>
        </div>
      </section>

      {/* Second Image Block */}
      <section className="bg-[#2C3522] text-[#F9F6F0] py-24 px-8 md:px-16 flex flex-col md:flex-row items-center gap-16">
        <div className="flex-1 max-w-xl">
          <h2 className="font-serif text-4xl md:text-5xl mb-8 leading-tight">
            Ready to <i className="text-[#859873]">transform</i> your acres into Eden?
          </h2>
          <p className="text-lg text-[#F9F6F0]/80 mb-10 font-light leading-relaxed">
            Whether you have a small suburban block or a sprawling rural property, the principles of permaculture can unlock its true potential. Let's create something beautiful together.
          </p>
          <Button className="bg-[#F9F6F0] hover:bg-white text-[#2C3522] rounded-none px-10 py-7 text-lg shadow-xl shadow-black/20 transition-all hover:scale-105">
            Start your enquiry
          </Button>
        </div>
        <div className="flex-1 w-full">
          <div className="relative">
            <img src="/__mockup/images/property-aerial.png" alt="Property aerial" className="w-full h-auto object-cover border-[8px] border-[#4A5D23]" />
            <img src="/__mockup/images/meadow-pollinators.png" alt="Meadow" className="w-1/2 absolute -bottom-10 -left-10 border-[8px] border-[#2C3522] shadow-2xl" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#1A2014] text-[#F9F6F0]/60 py-16 text-center flex flex-col items-center justify-center">
        <div className="font-serif text-4xl font-bold tracking-tighter text-[#F9F6F0] mb-8">Pattern</div>
        <p className="text-sm uppercase tracking-widest font-light">Permaculture Design Studio &copy; {new Date().getFullYear()}</p>
      </footer>
    </div>
  );
}
