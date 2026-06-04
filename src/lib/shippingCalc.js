// ════════════════════════════════════════════════════════════════════════════
// Custom95 shipping cost calculator
// ----------------------------------------------------------------------------
// Ported from the standalone Custom95_Shipping_Calculator.html so the exact
// customer shipping price can be computed inside the app (outbound shipments).
//
// Origin: Amsterdam, NL. Prices are excl. VAT, include a 25% margin and carrier
// fuel/GoGreen surcharges. Rate tables are DHL + Hive 2026.
// ════════════════════════════════════════════════════════════════════════════

// ── Box sizes (effective volume already carries a packing buffer) ────────────
export const BOXES = [
  { name: 'Small',  label: 'S — 30×20×10cm',  volume: 5,   maxWeight: 5 },
  { name: 'Medium', label: 'M — 40×30×20cm',  volume: 19,  maxWeight: 15 },
  { name: 'Large',  label: 'L — 50×40×30cm',  volume: 48,  maxWeight: 30 },
  { name: 'XL',     label: 'XL — 60×50×40cm', volume: 96,  maxWeight: 50 },
]

// ── DHL Economy (DDI) ────────────────────────────────────────────────────────
const ecoWeights = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,40,50,60,70,80,90,100]
const ecoZones = {
  1: [13.43,13.43,13.43,13.43,13.43,14.58,15.73,16.88,18.03,19.18,20.66,22.14,23.62,25.10,26.58,28.06,29.54,31.02,32.50,33.98,35.59,37.20,38.81,40.42,42.03,43.64,45.25,46.86,48.47,50.08,60.68,71.28,81.88,92.48,102.92,113.36,123.80],
  2: [15.28,15.28,15.28,15.28,15.28,16.69,18.10,19.51,20.92,22.33,24.34,26.35,28.36,30.37,32.38,34.39,36.40,38.41,40.42,42.43,44.63,46.83,49.03,51.23,53.43,55.63,57.83,60.03,62.23,64.43,93.73,123.03,152.33,181.63,210.93,240.23,269.53],
  3: [16.69,16.69,16.69,16.69,16.69,18.13,19.57,21.01,22.45,23.89,26.27,28.65,31.03,33.41,35.79,38.17,40.55,42.93,45.31,47.69,50.17,52.65,55.13,57.61,60.09,62.57,65.05,67.53,70.01,72.49,111.79,151.09,190.39,229.69,268.83,307.97,347.11],
  5: [18.07,18.07,18.07,18.07,18.07,19.51,20.95,22.39,23.83,25.27,27.75,30.23,32.71,35.19,37.67,40.15,42.63,45.11,47.59,50.07,54.42,58.77,63.12,67.47,71.82,76.17,80.52,84.87,89.22,93.57,135.87,178.17,220.47,262.77,305.13,347.49,389.85],
  6: [19.93,19.93,19.93,19.93,19.93,21.87,23.81,25.75,27.69,29.63,32.41,35.19,37.97,40.75,43.53,46.31,49.09,51.87,54.65,57.43,63.28,69.13,74.98,80.83,86.68,92.53,98.38,104.23,110.08,115.93,161.53,207.13,252.73,298.33,343.87,389.41,434.95],
}
const ecoCountryZone = {
  'Belgium':1,'Luxembourg':1,
  'Germany':2,
  'Austria':3,'Denmark':3,'France':3,'Italy':3,'Spain':3,'Vatican City':3,
  'Ireland':5,'Poland':5,'Portugal':5,'Sweden':5,
  'Bulgaria':6,'Croatia':6,'Czech Republic':6,'Estonia':6,'Finland':6,'Greece':6,'Hungary':6,'Latvia':6,'Lithuania':6,'Slovakia':6,'Slovenia':6,
}

// ── DHL Express (TDI + DOM) ──────────────────────────────────────────────────
const expWeights = [0.5,1,1.5,2,2.5,3,3.5,4,4.5,5,5.5,6,6.5,7,7.5,8,8.5,9,9.5,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,40,50,60,70]
const expZones = {
  A: [14.21,14.21,14.21,14.21,14.91,15.61,16.31,17.01,17.71,18.41,19.52,20.63,21.74,22.85,23.96,25.07,26.18,27.29,28.40,29.51,30.83,32.15,33.47,34.79,36.11,37.43,38.75,40.07,41.39,42.71,44.31,45.91,47.51,49.11,50.71,52.31,53.91,55.51,57.11,58.71,72.91,87.11,101.31,115.51],
  B: [17.31,17.31,17.31,17.31,18.38,19.25,20.12,20.99,21.86,22.73,24.11,25.49,26.87,28.25,29.63,31.01,32.39,33.77,35.15,36.53,38.97,41.41,43.85,46.29,48.73,51.17,53.61,56.05,58.49,60.93,63.81,66.69,69.57,72.45,75.33,78.21,81.09,83.97,86.85,89.73,143.13,196.53,249.93,303.33],
  C: [18.64,18.64,18.64,18.64,19.89,20.97,22.05,23.13,24.21,25.29,26.66,28.03,29.40,30.77,32.14,33.51,34.88,36.25,37.62,38.99,42.15,45.31,48.47,51.63,54.79,57.95,61.11,64.27,67.43,70.59,74.19,77.79,81.39,84.99,88.59,92.19,95.79,99.39,102.99,106.59,164.29,221.99,279.69,337.39],
  D: [20.40,20.40,20.40,20.40,21.90,23.24,24.58,25.92,27.26,28.60,30.45,32.30,34.15,36.00,37.85,39.70,41.55,43.40,45.25,47.10,50.58,54.06,57.54,61.02,64.50,67.98,71.46,74.94,78.42,81.90,85.92,89.94,93.96,97.98,102.00,106.02,110.04,114.06,118.08,122.10,184.20,246.30,308.40,370.50],
  DE: [15.98,15.98,15.98,15.98,16.86,17.56,18.26,18.96,19.66,20.36,21.70,23.04,24.38,25.72,27.06,28.40,29.74,31.08,32.42,33.76,35.90,38.04,40.18,42.32,44.46,46.60,48.74,50.88,53.02,55.16,57.72,60.28,62.84,65.40,67.96,70.52,73.08,75.64,78.20,80.76,120.76,160.76,200.76,240.76],
  NL: [12.06,12.06,12.06,12.06,12.68,13.28,13.88,14.48,15.08,15.68,16.84,18.00,19.16,20.32,21.48,22.64,23.80,24.96,26.12,27.28,27.72,28.16,28.60,29.04,29.48,29.92,30.36,30.80,31.24,31.68,32.26,32.84,33.42,34.00,34.58,35.16,35.74,36.32,36.90,37.48,49.78,62.08,74.38,86.68],
}
const expCountryZone = {
  'Belgium':'A','Luxembourg':'A',
  'Austria':'B','Denmark':'B','France':'B','Italy':'B','Spain':'B','Vatican City':'B',
  'Ireland':'C','Poland':'C','Portugal':'C','Sweden':'C',
  'Bulgaria':'D','Croatia':'D','Czech Republic':'D','Estonia':'D','Finland':'D','Greece':'D','Hungary':'D','Latvia':'D','Lithuania':'D','Slovakia':'D','Slovenia':'D',
  'Germany':'DE',
  'Netherlands':'NL',
}

// ── Hive cheapest carrier per country (< 2,500 orders/month tier) ─────────────
const hiveWeights = [1, 2, 3, 5, 10, 15, 30]
const hiveData = {
  'Austria':       { carrier: 'DPD AT',           speed: '2–6 days', rates: [5.72, 5.72, 6.63, 6.64, 9.20, 9.38, 10.06] },
  'Belgium':       { carrier: 'GLS FlexDelivery', speed: '2–5 days', rates: [9.57, 9.94, 11.32, 10.86, 12.69, 14.44, 21.48] },
  'Denmark':       { carrier: 'GLS FlexDelivery', speed: '3–6 days', rates: [10.09, 10.45, 10.81, 11.07, 15.35, 16.28, 30.45] },
  'France':        { carrier: 'GLS FlexDelivery', speed: '5–6 days', rates: [6.01, 6.93, 6.51, 6.57, 16.70, 13.58, 44.69] },
  'Germany':       { carrier: 'GLS DE Parcel',    speed: '1–3 days', rates: [3.07, 3.07, 3.37, 4.52, 6.24, 10.11, 20.78] },
  'Italy':         { carrier: 'GLS FlexDelivery', speed: '4–8 days', rates: [8.91, 8.91, 8.51, 11.41, 13.92, 15.08, 19.72] },
  'Netherlands':   { carrier: 'GLS FlexDelivery', speed: '1–3 days', rates: [7.63, 7.02, 6.48, 6.59, 6.92, 10.02, 14.17] },
  'Poland':        { carrier: 'InPost PL Parcel', speed: '1–2 days', rates: [3.75, 3.75, 3.75, 3.75, 3.75, 3.75, 3.75], maxWeight: 25 },
  'Spain':         { carrier: 'GLS FlexDelivery', speed: '3–7 days', rates: [10.97, 10.38, 11.32, 13.21, 14.95, 16.19, 43.83] },
  'United Kingdom':{ carrier: 'DHL Economy Paket',speed: '2–5 days', rates: [26.07, 26.87, 27.66, 29.26, 33.24, 37.23, 49.19] },
  'Sweden':        { carrier: 'GLS FlexDelivery', speed: '3–6 days', rates: [13.20, 13.52, 14.90, 16.60, 18.00, 22.00, 38.00] },
  'Portugal':      { carrier: 'GLS FlexDelivery', speed: '3–6 days', rates: [10.97, 10.38, 11.32, 13.21, 14.95, 16.19, 43.83] },
  'Ireland':       { carrier: 'GLS FlexDelivery', speed: '3–6 days', rates: [15.70, 15.60, 16.64, 17.20, 20.00, 24.00, 42.00] },
}

// ── Surcharge config ─────────────────────────────────────────────────────────
const FUEL_ECO = 0.20        // 20% fuel surcharge for DDI
const FUEL_EXP = 0.305       // 30.5% fuel surcharge for TDI/DOM
const GOGREEN_ECO = 0.02     // €0.02/kg for DDI
const GOGREEN_EXP = 0.25     // €0.25/kg for TDI/DOM
export const MARGIN = 0.25   // 25% margin
export const VAT_RATE = 0.21 // 21% Dutch VAT

// Sorted list of every destination we have rate data for (for a dropdown).
export const SHIPPING_COUNTRIES = [...new Set([
  ...Object.keys(expCountryZone),
  ...Object.keys(hiveData),
])].sort()

// ── Country normalisation ────────────────────────────────────────────────────
// Address country strings are messy ("NL", "Nederland", "Netherlands"). Map the
// common ISO codes / native names to the canonical English names used above.
const COUNTRY_ALIASES = {
  netherlands: 'Netherlands', nl: 'Netherlands', nld: 'Netherlands', nederland: 'Netherlands', holland: 'Netherlands', 'the netherlands': 'Netherlands',
  germany: 'Germany', de: 'Germany', deu: 'Germany', deutschland: 'Germany',
  belgium: 'Belgium', be: 'Belgium', bel: 'Belgium', belgie: 'Belgium', 'belgië': 'Belgium', belgique: 'Belgium',
  luxembourg: 'Luxembourg', lu: 'Luxembourg', lux: 'Luxembourg',
  austria: 'Austria', at: 'Austria', aut: 'Austria', 'österreich': 'Austria', osterreich: 'Austria',
  denmark: 'Denmark', dk: 'Denmark', dnk: 'Denmark', danmark: 'Denmark',
  france: 'France', fr: 'France', fra: 'France',
  italy: 'Italy', it: 'Italy', ita: 'Italy', italia: 'Italy',
  spain: 'Spain', es: 'Spain', esp: 'Spain', 'españa': 'Spain', espana: 'Spain',
  'vatican city': 'Vatican City', va: 'Vatican City', vatican: 'Vatican City',
  ireland: 'Ireland', ie: 'Ireland', irl: 'Ireland', eire: 'Ireland', 'éire': 'Ireland',
  poland: 'Poland', pl: 'Poland', pol: 'Poland', polska: 'Poland',
  portugal: 'Portugal', pt: 'Portugal', prt: 'Portugal',
  sweden: 'Sweden', se: 'Sweden', swe: 'Sweden', sverige: 'Sweden',
  bulgaria: 'Bulgaria', bg: 'Bulgaria', bgr: 'Bulgaria',
  croatia: 'Croatia', hr: 'Croatia', hrv: 'Croatia', hrvatska: 'Croatia',
  'czech republic': 'Czech Republic', cz: 'Czech Republic', cze: 'Czech Republic', czechia: 'Czech Republic', cesko: 'Czech Republic', 'česko': 'Czech Republic',
  estonia: 'Estonia', ee: 'Estonia', est: 'Estonia', eesti: 'Estonia',
  finland: 'Finland', fi: 'Finland', fin: 'Finland', suomi: 'Finland',
  greece: 'Greece', gr: 'Greece', grc: 'Greece', ellada: 'Greece',
  hungary: 'Hungary', hu: 'Hungary', hun: 'Hungary', magyarorszag: 'Hungary', 'magyarország': 'Hungary',
  latvia: 'Latvia', lv: 'Latvia', lva: 'Latvia', latvija: 'Latvia',
  lithuania: 'Lithuania', lt: 'Lithuania', ltu: 'Lithuania', lietuva: 'Lithuania',
  slovakia: 'Slovakia', sk: 'Slovakia', svk: 'Slovakia', slovensko: 'Slovakia',
  slovenia: 'Slovenia', si: 'Slovenia', svn: 'Slovenia', slovenija: 'Slovenia',
  'united kingdom': 'United Kingdom', uk: 'United Kingdom', gb: 'United Kingdom', gbr: 'United Kingdom', 'great britain': 'United Kingdom', england: 'United Kingdom', scotland: 'United Kingdom', wales: 'United Kingdom',
}

export function normalizeCountry(raw) {
  if (!raw) return null
  const cleaned = String(raw).trim().toLowerCase().replace(/\.+$/, '')
  if (!cleaned) return null
  return COUNTRY_ALIASES[cleaned] || null
}

// ── Product weight/volume estimation ─────────────────────────────────────────
// When a product has no stored unit weight/volume we guess a sensible default
// from its name, so the shipping cost can still be calculated automatically.
// Values mirror the standalone calculator's merch catalog (grams / millilitres).
// Order matters: more specific keywords are matched first.
export const PRODUCT_PRESETS = [
  { label: 'Sweatshirt',  grams: 450, ml: 1800, keywords: ['sweatshirt', 'sweater', 'crewneck', 'crew neck', 'jumper'] },
  { label: 'Hoodie',      grams: 500, ml: 2000, keywords: ['hoodie', 'hooded'] },
  { label: 'Polo',        grams: 300, ml: 1000, keywords: ['polo'] },
  { label: 'Long sleeve', grams: 250, ml: 900,  keywords: ['long sleeve', 'longsleeve', 'long-sleeve'] },
  { label: 'T-Shirt',     grams: 200, ml: 800,  keywords: ['t-shirt', 'tshirt', 't shirt', 'tee'] },
  { label: 'Beanie',      grams: 80,  ml: 500,  keywords: ['beanie'] },
  { label: 'Cap',         grams: 100, ml: 1500, keywords: ['cap', 'hat'] },
  { label: 'Mug',         grams: 400, ml: 1200, keywords: ['mug'] },
  { label: 'Bottle',      grams: 350, ml: 1500, keywords: ['bottle', 'flask'] },
  { label: 'Tote bag',    grams: 150, ml: 500,  keywords: ['tote'] },
  { label: 'Backpack',    grams: 600, ml: 5000, keywords: ['backpack', 'rucksack'] },
  { label: 'Notebook',    grams: 300, ml: 800,  keywords: ['notebook', 'notepad'] },
  { label: 'Pen',         grams: 100, ml: 300,  keywords: ['pen'] },
  { label: 'Socks',       grams: 50,  ml: 200,  keywords: ['sock'] },
  { label: 'Lanyard',     grams: 20,  ml: 100,  keywords: ['lanyard'] },
  { label: 'USB drive',   grams: 30,  ml: 100,  keywords: ['usb', 'flash drive', 'flashdrive'] },
  { label: 'Power bank',  grams: 200, ml: 300,  keywords: ['power bank', 'powerbank'] },
  { label: 'Sticker',     grams: 20,  ml: 100,  keywords: ['sticker'] },
  { label: 'Umbrella',    grams: 400, ml: 2000, keywords: ['umbrella'] },
]

// Returns { grams, ml, label } for the first preset whose keyword appears in the
// product name, or null when nothing matches.
export function guessProductDims(name) {
  if (!name) return null
  const n = String(name).toLowerCase()
  for (const p of PRODUCT_PRESETS) {
    if (p.keywords.some(k => n.includes(k))) return { grams: p.grams, ml: p.ml, label: p.label }
  }
  return null
}

// ── Core helpers (1:1 with the standalone calculator) ────────────────────────
export function interpolateRate(weightTiers, rates, weight) {
  if (weight <= 0) return 0
  if (weight > weightTiers[weightTiers.length - 1]) return null // over max

  const idx = weightTiers.indexOf(weight)
  if (idx >= 0) return rates[idx]

  for (let i = 0; i < weightTiers.length - 1; i++) {
    if (weight > weightTiers[i] && weight < weightTiers[i + 1]) {
      const w1 = weightTiers[i], w2 = weightTiers[i + 1]
      const r1 = rates[i], r2 = rates[i + 1]
      return r1 + (r2 - r1) * (weight - w1) / (w2 - w1)
    }
  }
  return rates[0]
}

export function fitBoxes(totalWeight, totalVolume) {
  if (totalWeight === 0 || totalVolume === 0) return { totalBoxes: 0, breakdown: [], weightPerBox: 0 }

  for (let bi = 0; bi < BOXES.length; bi++) {
    const box = BOXES[bi]
    const boxesByVolume = Math.ceil(totalVolume / box.volume)
    const boxesByWeight = Math.ceil(totalWeight / box.maxWeight)
    const needed = Math.max(boxesByVolume, boxesByWeight)

    if (needed === 1) {
      return { totalBoxes: 1, breakdown: [{ count: 1, label: box.label, name: box.name, maxWeight: box.maxWeight }], weightPerBox: totalWeight }
    }
    if (needed <= 4) {
      return { totalBoxes: needed, breakdown: [{ count: needed, label: box.label, name: box.name, maxWeight: box.maxWeight }], weightPerBox: totalWeight / needed }
    }
  }

  const xl = BOXES[BOXES.length - 1]
  const needed = Math.max(Math.ceil(totalVolume / xl.volume), Math.ceil(totalWeight / xl.maxWeight))
  return { totalBoxes: needed, breakdown: [{ count: needed, label: xl.label, name: xl.name, maxWeight: xl.maxWeight }], weightPerBox: totalWeight / needed }
}

export function distributeWeight(totalWeight, boxResult) {
  if (boxResult.totalBoxes === 0) return []
  const perBox = totalWeight / boxResult.totalBoxes
  const rounded = Math.ceil(perBox * 2) / 2 // round up to nearest 0.5kg (carriers round up)
  return Array(boxResult.totalBoxes).fill(rounded)
}

// ── Main entry point ─────────────────────────────────────────────────────────
// items: [{ weightKg, volumeL, quantity }]  ·  country: canonical name
// Returns totals, box breakdown, and an `options` array (one per carrier/service)
// with .total (excl VAT, incl margin) and .totalInclVat.
export function calcShipment({ items = [], country }) {
  let totalItems = 0, totalWeight = 0, totalVolume = 0
  for (const it of items) {
    const q = it.quantity || 0
    totalItems += q
    totalWeight += q * (it.weightKg || 0)
    totalVolume += q * (it.volumeL || 0)
  }
  const packedVolume = totalVolume * 1.2
  const boxResult = fitBoxes(totalWeight, packedVolume)
  const perBoxWeights = distributeWeight(totalWeight, boxResult)

  const options = []

  if (country && totalItems > 0 && totalWeight > 0) {
    // DHL Economy (not available for Netherlands domestic)
    if (country !== 'Netherlands' && ecoCountryZone[country] !== undefined) {
      const zone = ecoCountryZone[country]
      let totalPrice = 0, valid = true
      perBoxWeights.forEach(w => {
        const base = interpolateRate(ecoWeights, ecoZones[zone], w)
        if (base === null) { valid = false; return }
        const subtotal = base + base * FUEL_ECO + w * GOGREEN_ECO
        totalPrice += subtotal * (1 + MARGIN)
      })
      if (valid) options.push(makeOption('economy', 'DHL Economy Select', 'DDI — Day Definite International', '3–8 days', totalPrice, perBoxWeights.length))
    }

    // DHL Express
    if (expCountryZone[country] !== undefined) {
      const zone = expCountryZone[country]
      const isNL = country === 'Netherlands'
      const label = isNL ? 'DOM — Domestic NL' : 'TDI — Time Definite International'
      const speed = isNL ? '1 day' : '1–3 days'
      let totalPrice = 0, valid = true
      perBoxWeights.forEach(w => {
        const base = interpolateRate(expWeights, expZones[zone], w)
        if (base === null) { valid = false; return }
        const subtotal = base + base * FUEL_EXP + w * GOGREEN_EXP
        totalPrice += subtotal * (1 + MARGIN)
      })
      if (valid) options.push(makeOption('express', 'DHL Express', label, speed, totalPrice, perBoxWeights.length))
    }

    // Hive cheapest carrier
    if (hiveData[country]) {
      const hive = hiveData[country]
      let totalPrice = 0, valid = true
      perBoxWeights.forEach(w => {
        if (hive.maxWeight && w > hive.maxWeight) { valid = false; return }
        const base = interpolateRate(hiveWeights, hive.rates, w)
        if (base === null) { valid = false; return }
        totalPrice += base * (1 + MARGIN)
      })
      if (valid) options.push(makeOption('hive', `Hive — ${hive.carrier}`, 'Cheapest Hive option (< 2,500/mo)', hive.speed, totalPrice, perBoxWeights.length))
    }

    // Tag cheapest / fastest
    if (options.length > 0) {
      const cheapest = [...options].sort((a, b) => a.total - b.total)[0]
      cheapest.tag = 'cheapest'
      const parseDays = s => { const m = s.match(/(\d+)\s*day/); return m ? parseInt(m[1]) : 99 }
      const fastest = [...options].sort((a, b) => parseDays(a.speed) - parseDays(b.speed))[0]
      if (fastest.tag !== 'cheapest') fastest.tag = 'fastest'
    }
  }

  return {
    totalItems,
    totalWeightKg: totalWeight,
    totalVolumeL: totalVolume,
    packedVolumeL: packedVolume,
    boxResult,
    perBoxWeights,
    boxes: perBoxWeights.length,
    options,
  }
}

function makeOption(id, carrier, sub, speed, total, boxes) {
  return {
    id,
    carrier,
    sub,
    speed,
    boxes,
    perBox: boxes > 0 ? total / boxes : 0,
    total,
    totalInclVat: total * (1 + VAT_RATE),
    tag: null,
  }
}
