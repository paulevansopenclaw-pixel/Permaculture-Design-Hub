export type EcologicalFunction =
  | "windbreak"
  | "swale"
  | "food-forest"
  | "habitat-corridor"
  | "water-harvesting"
  | "nitrogen-fixer"
  | "dynamic-accumulator"
  | "living-fence"
  | "other";

export interface GuildSpecies {
  name: string;
  latinName: string;
  sizeClass: "canopy" | "sub-canopy" | "shrub" | "herbaceous" | "ground-cover" | "vine";
  notes: string;
}

export interface GuildLayer {
  role: string;
  species: GuildSpecies[];
}

export interface GuildProfile {
  label: string;
  description: string;
  canopy: GuildSpecies[];
  nitrogenFixer: GuildSpecies[];
  accumulator: GuildSpecies[];
  insectary: GuildSpecies[];
}

const GUILD_GUIDE: Record<EcologicalFunction, GuildProfile> = {
  windbreak: {
    label: "Windbreak Shelterbelt",
    description:
      "A multi-row barrier of deep-rooted, wind-firm species that reduces wind speed, prevents soil erosion, and creates warm microclimate pockets leeward.",
    canopy: [
      { name: "Casuarina / Sheoak", latinName: "Casuarina cunninghamiana", sizeClass: "canopy", notes: "Extremely wind-firm; N-fixer; fast-establishing outer row" },
      { name: "Tuckeroo", latinName: "Cupaniopsis anacardioides", sizeClass: "canopy", notes: "Dense evergreen canopy; salt & wind tolerant" },
      { name: "Spotted Gum", latinName: "Corymbia maculata", sizeClass: "canopy", notes: "Deep taproot; retains leaves under wind stress; habitat trees" },
      { name: "Brush Box", latinName: "Lophostemon confertus", sizeClass: "canopy", notes: "Reliable tall barrier; responds well to coppicing" },
    ],
    nitrogenFixer: [
      { name: "Tagasaste / Tree Lucerne", latinName: "Chamaecytisus proliferus", sizeClass: "sub-canopy", notes: "Fast-growing N-fixer; fodder; inner belt rows" },
      { name: "Wattles (local species)", latinName: "Acacia spp.", sizeClass: "sub-canopy", notes: "Pioneer N-fixers; nurse trees for slower-growing canopy" },
      { name: "Leucaena", latinName: "Leucaena leucocephala", sizeClass: "shrub", notes: "High-protein fodder + N-fixation; trim to hedge for density" },
    ],
    accumulator: [
      { name: "Russian Comfrey", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Mine K, Ca, Si; chop-and-drop at base of belt" },
      { name: "Yarrow", latinName: "Achillea millefolium", sizeClass: "herbaceous", notes: "Dynamic accumulator; repels aphids from belt" },
    ],
    insectary: [
      { name: "Borage", latinName: "Borago officinalis", sizeClass: "herbaceous", notes: "Intense bee magnet; self-seeds along belt base" },
      { name: "Phacelia", latinName: "Phacelia tanacetifolia", sizeClass: "herbaceous", notes: "Superior parasitoid wasp habitat; sow annually on south edge" },
      { name: "Lavender", latinName: "Lavandula angustifolia", sizeClass: "shrub", notes: "Long flowering season; low maintenance; fragrant deterrent" },
    ],
  },

  swale: {
    label: "Swale Riparian Guild",
    description:
      "Moisture-loving, erosion-controlling assemblage planted along swale banks and berms to slow water, build organic matter, and harvest nutrients from runoff.",
    canopy: [
      { name: "Weeping Willow (managed)", latinName: "Salix babylonica", sizeClass: "canopy", notes: "Coppice every 3 yrs; root system captures bank; biomass mulch" },
      { name: "River She-oak", latinName: "Casuarina cunninghamiana", sizeClass: "canopy", notes: "Streambank stabiliser; N-fixer; tolerates inundation" },
      { name: "Lilly Pilly", latinName: "Syzygium luehmannii", sizeClass: "sub-canopy", notes: "Edible fruit; dense roots stabilise berm; bird habitat" },
    ],
    nitrogenFixer: [
      { name: "Alder (Black)", latinName: "Alnus glutinosa", sizeClass: "canopy", notes: "Riparian N-fixer; fixes 40–100 kg N/ha/yr; deciduous mulch" },
      { name: "Lotus / Bird's-foot Trefoil", latinName: "Lotus corniculatus", sizeClass: "ground-cover", notes: "Berm groundcover N-fixer; tolerates waterlogging" },
    ],
    accumulator: [
      { name: "Russian Comfrey", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Classic swale companion; mine phosphorus from deeper soils" },
      { name: "Water Cress", latinName: "Nasturtium officinale", sizeClass: "herbaceous", notes: "Edible; bioindicator of clean flow; grows in swale channel" },
      { name: "Vetiver Grass", latinName: "Vetiveria zizanioides", sizeClass: "herbaceous", notes: "Deep-rooted berm reinforcement; silica accumulator" },
    ],
    insectary: [
      { name: "Blue Ginger", latinName: "Dichorisandra thyrsiflora", sizeClass: "shrub", notes: "Shade-tolerant; long-season bee flower in moist spots" },
      { name: "Meadowsweet", latinName: "Filipendula ulmaria", sizeClass: "herbaceous", notes: "Traditional riparian insectary; vanilla-scented; moist shade" },
    ],
  },

  "food-forest": {
    label: "Food Forest Guild",
    description:
      "A seven-layer stacked polyculture modelled on a woodland edge — each layer occupies a different vertical niche, maximising caloric yield, biodiversity, and self-fertility.",
    canopy: [
      { name: "Apple / Pear", latinName: "Malus / Pyrus spp.", sizeClass: "canopy", notes: "Caloric staple; choose local heritage for climate fit" },
      { name: "Mulberry", latinName: "Morus nigra", sizeClass: "canopy", notes: "Prolific; chicken forage; silk-worm potential; fast shade" },
      { name: "Avocado", latinName: "Persea americana", sizeClass: "canopy", notes: "High calorie; needs wind protection from shelterbelt" },
      { name: "Black Locust", latinName: "Robinia pseudoacacia", sizeClass: "canopy", notes: "Canopy N-fixer; coppice for biomass; edible flowers" },
    ],
    nitrogenFixer: [
      { name: "Siberian Pea Shrub", latinName: "Caragana arborescens", sizeClass: "shrub", notes: "Hardy sub-canopy N-fixer; edible seed; excellent for cold sites" },
      { name: "Tagasaste", latinName: "Chamaecytisus proliferus", sizeClass: "sub-canopy", notes: "Fast biomass; N-fix; chop-drop mulch source" },
      { name: "Autumn Olive", latinName: "Elaeagnus umbellata", sizeClass: "shrub", notes: "N-fix + edible berry; thorny edge guild plant" },
    ],
    accumulator: [
      { name: "Comfrey (Bocking 14)", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Sterile cultivar; prolific chop-drop; K, P, Ca concentrator" },
      { name: "Dandelion", latinName: "Taraxacum officinale", sizeClass: "herbaceous", notes: "Deep tap-root brings up Ca, K; edible; bee early-season" },
      { name: "Chicory", latinName: "Cichorium intybus", sizeClass: "herbaceous", notes: "Tap-root Ca, K, Fe accumulator; breaks compaction" },
    ],
    insectary: [
      { name: "Phacelia", latinName: "Phacelia tanacetifolia", sizeClass: "herbaceous", notes: "Parasitoid wasp habitat; sow between tree rows each spring" },
      { name: "Borage", latinName: "Borago officinalis", sizeClass: "herbaceous", notes: "Pollinator magnet; companion to fruit trees; edible flower" },
      { name: "Dill", latinName: "Anethum graveolens", sizeClass: "herbaceous", notes: "Swallowtail caterpillar host; lacewing and hoverfly attractor" },
    ],
  },

  "habitat-corridor": {
    label: "Wildlife Habitat Corridor",
    description:
      "A linked belt of native structural complexity connecting remnant patches — providing shelter, nesting, foraging, and movement routes for invertebrates, birds, and mammals.",
    canopy: [
      { name: "Ironbark (local)", latinName: "Eucalyptus spp.", sizeClass: "canopy", notes: "Hard timber + nectar; retain hollow-bearing veterans" },
      { name: "Forest She-oak", latinName: "Allocasuarina torulosa", sizeClass: "sub-canopy", notes: "Cockatoo seed source; lightweight N-fix; understorey-friendly" },
      { name: "Quandong", latinName: "Santalum acuminatum", sizeClass: "sub-canopy", notes: "Native fruit; emu dispersal; semi-parasitic on Acacia" },
    ],
    nitrogenFixer: [
      { name: "Golden Wattle", latinName: "Acacia pycnantha", sizeClass: "sub-canopy", notes: "Rapid corridor pioneer; seeds for finches; N-fix" },
      { name: "Blackwood Wattle", latinName: "Acacia melanoxylon", sizeClass: "canopy", notes: "Timber + N; excellent understorey; dense bird habitat" },
    ],
    accumulator: [
      { name: "Native Grasses (local mix)", latinName: "Themeda / Microlaena spp.", sizeClass: "ground-cover", notes: "Kangaroo food; insect habitat; C-sequestration base" },
      { name: "Bracken Fern", latinName: "Pteridium esculentum", sizeClass: "herbaceous", notes: "Reptile shelter; establish only in shaded areas; control spread" },
    ],
    insectary: [
      { name: "Native Bee Mix", latinName: "Brachyscome / Goodenia spp.", sizeClass: "herbaceous", notes: "Attract stingless bees; interplant at corridor edges" },
      { name: "Grevillea (local)", latinName: "Grevillea spp.", sizeClass: "shrub", notes: "Year-round honeyeater nectar; insect-pollinated" },
      { name: "Saltbush", latinName: "Atriplex nummularia", sizeClass: "shrub", notes: "Multi-use browse; insect habitat; drought-proof; mineral-rich leaf" },
    ],
  },

  "water-harvesting": {
    label: "Water Harvesting Zone",
    description:
      "Vegetation supporting maximum infiltration, evapotranspiration management, and flood-pulse capture — roots open soil pores while surface mulch slows runoff.",
    canopy: [
      { name: "River Red Gum", latinName: "Eucalyptus camaldulensis", sizeClass: "canopy", notes: "Thrives with episodic flooding; roots fracture hardpan" },
      { name: "Poplar (managed)", latinName: "Populus nigra", sizeClass: "canopy", notes: "Coppice every 4 yrs; massive transpiration draws down water table" },
    ],
    nitrogenFixer: [
      { name: "Honey Locust", latinName: "Gleditsia triacanthos", sizeClass: "canopy", notes: "Deep N-fix root; pods as high-protein animal fodder; drought bridge" },
      { name: "Bladder Senna", latinName: "Colutea arborescens", sizeClass: "shrub", notes: "Drought + waterlogging tolerant; N-fix; pioneer on bare soils" },
    ],
    accumulator: [
      { name: "Comfrey", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Mulch & mineral pump on infiltration basin berms" },
      { name: "Taro", latinName: "Colocasia esculenta", sizeClass: "herbaceous", notes: "Edible starchy root; tolerates waterlogging; large leaf mulch" },
    ],
    insectary: [
      { name: "Water Mint", latinName: "Mentha aquatica", sizeClass: "herbaceous", notes: "Spreads at water margins; pungent beetle deterrent; bee forage" },
      { name: "Elderflower", latinName: "Sambucus nigra", sizeClass: "shrub", notes: "Moisture-loving; edible flower + berry; powerful insectary shrub" },
    ],
  },

  "nitrogen-fixer": {
    label: "Nitrogen-Fixing Pioneer",
    description:
      "Leguminous or actinorrhizal species that convert atmospheric N₂ into plant-available ammonium — building soil fertility for the entire guild over time.",
    canopy: [
      { name: "Black Locust", latinName: "Robinia pseudoacacia", sizeClass: "canopy", notes: "50–100 kg N/ha/yr; coppice for biomass; edible flowers" },
      { name: "Alder (Green)", latinName: "Alnus viridis", sizeClass: "sub-canopy", notes: "Mountain N-fixer; excellent nurse for slow-growing species" },
    ],
    nitrogenFixer: [
      { name: "Tagasaste", latinName: "Chamaecytisus proliferus", sizeClass: "sub-canopy", notes: "Most productive N-fix in temperate systems; protein-rich fodder" },
      { name: "Tip Gorse", latinName: "Ulex europaeus (managed)", sizeClass: "shrub", notes: "Nurse shrub in cold sites; fix then chop; control spread strictly" },
    ],
    accumulator: [
      { name: "Comfrey", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Works synergistically below N-fixers as mineral miner" },
    ],
    insectary: [
      { name: "White Clover", latinName: "Trifolium repens", sizeClass: "ground-cover", notes: "Living mulch N-fixer underplant; bee forage; lawn alternative" },
      { name: "Sweet Clover", latinName: "Melilotus officinalis", sizeClass: "herbaceous", notes: "Biennial N-fixer; bee plant; deep taproot breaks compaction" },
    ],
  },

  "dynamic-accumulator": {
    label: "Dynamic Accumulator Patch",
    description:
      "Deep-rooted forbs and semi-woody plants that mine subsoil minerals and concentrate them in easily-composted biomass — the fertility pumps of the food forest.",
    canopy: [
      { name: "Mulberry", latinName: "Morus nigra", sizeClass: "canopy", notes: "Prolific leaf biomass for mineral chop-drop mulch" },
    ],
    nitrogenFixer: [
      { name: "Autumn Olive", latinName: "Elaeagnus umbellata", sizeClass: "shrub", notes: "N-fix + Ca, Fe accumulation; vigorous chop-drop candidate" },
    ],
    accumulator: [
      { name: "Russian Comfrey (Bocking 14)", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Champion K, Ca, Si, N accumulator; 4–6 cuts/year; tap-root to 1.8 m" },
      { name: "Dandelion", latinName: "Taraxacum officinale", sizeClass: "herbaceous", notes: "Ca, K, Fe, Mg; edible; beneficial throughout garden" },
      { name: "Chicory", latinName: "Cichorium intybus", sizeClass: "herbaceous", notes: "Deep tap-root K, Ca, Fe; break compaction; drought-hardy" },
      { name: "Yarrow", latinName: "Achillea millefolium", sizeClass: "herbaceous", notes: "Sulphur, K, Cu, phosphorus; activates compost heap" },
      { name: "Stinging Nettle", latinName: "Urtica dioica", sizeClass: "herbaceous", notes: "Fe, Si, K; liquid feed plant; insectary; edible young leaf" },
    ],
    insectary: [
      { name: "Phacelia", latinName: "Phacelia tanacetifolia", sizeClass: "herbaceous", notes: "Parasitoid wasps; interplant between accumulator patches" },
      { name: "Fennel", latinName: "Foeniculum vulgare", sizeClass: "herbaceous", notes: "Hoverfly and predatory wasp attractor; accumulates K" },
    ],
  },

  "living-fence": {
    label: "Living Fence / Hedgerow",
    description:
      "Multi-functional boundary of densely planted shrubs and sub-canopy trees providing windbreak, wildlife corridor, food, and property demarcation simultaneously.",
    canopy: [
      { name: "Hawthorn", latinName: "Crataegus monogyna", sizeClass: "sub-canopy", notes: "Impenetrable thorny hedge; edible berry; bird habitat; windbreak" },
      { name: "Sloe / Blackthorn", latinName: "Prunus spinosa", sizeClass: "shrub", notes: "Thorny barrier; edible sloe berry for gin; bird winter food" },
    ],
    nitrogenFixer: [
      { name: "Siberian Pea Shrub", latinName: "Caragana arborescens", sizeClass: "shrub", notes: "Hedge N-fixer; edible seed; withstands heavy pruning to shape" },
      { name: "Gorse (tip only)", latinName: "Ulex europaeus", sizeClass: "shrub", notes: "Impenetrable windbreak N-fixer; must be managed — never let seed" },
    ],
    accumulator: [
      { name: "Elder", latinName: "Sambucus nigra", sizeClass: "sub-canopy", notes: "Edible flower + berry; chop-drop; grows from any cutting" },
      { name: "Comfrey (hedge base)", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Mineral pump at hedge base; chop into hedge drip-line" },
    ],
    insectary: [
      { name: "Wild Rose", latinName: "Rosa canina", sizeClass: "shrub", notes: "Hips as bird food; dense thorny structure; pollinator flower" },
      { name: "Borage", latinName: "Borago officinalis", sizeClass: "herbaceous", notes: "Edge insectary; self-seeds along fence line annually" },
    ],
  },

  other: {
    label: "General Polyculture",
    description:
      "Mixed ecological planting following broad permaculture guild principles: pair nitrogen-fixers with canopy, accumulators with roots, insectaries with productive species.",
    canopy: [
      { name: "Mulberry", latinName: "Morus nigra", sizeClass: "canopy", notes: "Productive canopy anchor; wide climate tolerance" },
      { name: "Tagasaste", latinName: "Chamaecytisus proliferus", sizeClass: "sub-canopy", notes: "N-fixer sub-canopy; rapid establishment; evergreen shelter" },
    ],
    nitrogenFixer: [
      { name: "Wattles (local)", latinName: "Acacia spp.", sizeClass: "sub-canopy", notes: "Pioneer N-fix; nurse for slower species; shelter for seedlings" },
      { name: "White Clover", latinName: "Trifolium repens", sizeClass: "ground-cover", notes: "Underplant N-fixer; living mulch; constant bee forage" },
    ],
    accumulator: [
      { name: "Comfrey", latinName: "Symphytum × uplandicum", sizeClass: "herbaceous", notes: "Universal mineral pump; chop-drop at drip-line 4x/year" },
      { name: "Yarrow", latinName: "Achillea millefolium", sizeClass: "herbaceous", notes: "Attracts predatory insects; compost activator; drought-hardy" },
    ],
    insectary: [
      { name: "Phacelia", latinName: "Phacelia tanacetifolia", sizeClass: "herbaceous", notes: "Annual insectary; sow in bare gaps each spring" },
      { name: "Lavender", latinName: "Lavandula angustifolia", sizeClass: "shrub", notes: "Long-season bee forage; aromatic pest deterrent; low maintenance" },
    ],
  },
};

export function getGuildProfile(fn: string): GuildProfile {
  return GUILD_GUIDE[fn as EcologicalFunction] ?? GUILD_GUIDE.other;
}

export function getTagsGuildProfiles(tags: string[]): Array<{ tag: string; profile: GuildProfile }> {
  const seen = new Set<string>();
  const results: Array<{ tag: string; profile: GuildProfile }> = [];
  for (const tag of tags) {
    const key = tag as EcologicalFunction;
    if (!seen.has(key) && GUILD_GUIDE[key]) {
      seen.add(key);
      results.push({ tag, profile: GUILD_GUIDE[key] });
    }
  }
  return results;
}

export const ALL_ECOLOGICAL_TAGS: Array<{ value: EcologicalFunction; label: string }> = [
  { value: "windbreak",           label: "Windbreak" },
  { value: "swale",               label: "Swale" },
  { value: "food-forest",         label: "Food Forest" },
  { value: "habitat-corridor",    label: "Habitat Corridor" },
  { value: "water-harvesting",    label: "Water Harvesting" },
  { value: "nitrogen-fixer",      label: "Nitrogen Fixer" },
  { value: "dynamic-accumulator", label: "Dynamic Accumulator" },
  { value: "living-fence",        label: "Living Fence" },
  { value: "other",               label: "Other" },
];
