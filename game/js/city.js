// SOLMAR — Streets of the Sun. Procedural seeded city: roads, blocks, buildings,
// named landmarks, beach and sea, zones. Everything derives from the seed, so a
// saved seed rebuilds the exact same city on CONTINUE.
import { makeRng, pick, range, intRange, pointInRect, pushCircleOutOfRect, clamp } from './util.js';

export const WORLD = 3600;          // world is WORLD x WORLD pixels
export const BLOCK = 300;           // block pitch
export const ROAD_W = 96;           // road width
export const SEA_Y = 3480;          // sea starts here (south edge)
export const SAND_Y = 3315;         // sand starts here
export const PROM_Y = 3270;         // beachfront promenade road centre

// Landmarks: fixed block positions (col, row) -> world centre is 300 + i*300.
export const LANDMARKS = [
  { id: 'hideout',  name: "Dice's Hideout",        col: 1,  row: 1, color: '#e8b04b', roof: '#c98f2e', w: 150, h: 120 },
  { id: 'diner',    name: "Vera's Diner",          col: 5,  row: 1, color: '#ff8f7a', roof: '#e56a52', w: 160, h: 110 },
  { id: 'sbpd',     name: 'SBPD Headquarters',     col: 8,  row: 2, color: '#7fb2e5', roof: '#4f86c2', w: 170, h: 130 },
  { id: 'bank',     name: 'Solmar National Bank',  col: 6,  row: 3, color: '#d8d3c3', roof: '#a8a184', w: 170, h: 130 },
  { id: 'hospital', name: 'Solmar General',        col: 2,  row: 4, color: '#f2f2ee', roof: '#d43a3a', w: 170, h: 130 },
  { id: 'garage',   name: "Vera's Garage",         col: 9,  row: 5, color: '#9db8a4', roof: '#6f8f78', w: 170, h: 120 },
  { id: 'spa',      name: 'Sunset Auto Spa',       col: 3,  row: 6, color: '#f7c948', roof: '#d9a51f', w: 160, h: 110 },
  { id: 'docks',    name: 'East Harbour Docks',    col: 10, row: 7, color: '#b08968', roof: '#8a6a4d', w: 170, h: 140 },
];

const ROOF_COLORS = ['#d98e73', '#e5c07b', '#a8c686', '#8fb8c9', '#c9a2c8', '#e8b4b8', '#b5c99a', '#d9c9a3'];
const WALL_COLORS = ['#f4e8d8', '#f7dcc0', '#e8dcc8', '#f0e6d2', '#e5d5c0', '#f5e6cc'];

export function blockCentre(col, row) { return { x: 300 + col * BLOCK, y: 300 + row * BLOCK }; }

export function zoneAt(x, y) {
  if (y >= SAND_Y) return 'PALMA BEACH';
  if (x >= 2400 && y >= 1500) return 'EAST HARBOUR';
  if (x < 1200 && y < 1500) return 'OLD TOWN';
  if (x >= 1200 && y < 1500) return 'DOWNTOWN';
  if (x < 1200) return 'WESTSIDE';
  if (y < 2400) return 'MIDTOWN';
  return 'SOUTH SOLMAR';
}

export function buildCity(seed) {
  const rng = makeRng(seed);
  const vRoads = []; // vertical road centre x values
  const hRoads = []; // horizontal road centre y values
  for (let i = 0; i < 12; i++) vRoads.push(150 + i * BLOCK);
  for (let i = 0; i < 11; i++) hRoads.push(150 + i * BLOCK);
  hRoads.push(PROM_Y);

  const buildings = [];
  const landmarkById = {};
  const landmarkBlock = new Map(LANDMARKS.map((l) => [l.col + ',' + l.row, l]));
  for (let col = 0; col < 11; col++) {
    for (let row = 0; row < 11; row++) {
      const bx0 = 150 + col * BLOCK + ROAD_W / 2;
      const by0 = 150 + row * BLOCK + ROAD_W / 2;
      const bw = BLOCK - ROAD_W, bh = BLOCK - ROAD_W;
      const lm = landmarkBlock.get(col + ',' + row);
      if (lm) {
        const cx = bx0 + bw / 2, cy = by0 + bh / 2;
        const b = {
          x: cx - lm.w / 2, y: cy - lm.h / 2, w: lm.w, h: lm.h,
          color: lm.color, roof: lm.roof, landmark: lm.id, label: lm.name,
          floors: 2,
        };
        buildings.push(b);
        landmarkById[lm.id] = { ...b, cx, cy, name: lm.name };
        continue;
      }
      // Ordinary block: one big building, sometimes two side by side.
      const split = rng() < 0.35;
      if (split) {
        const cut = bw * range(rng, 0.42, 0.58);
        buildings.push(makeBuilding(rng, bx0 + 8, by0 + 8, cut - 16, bh - 16));
        buildings.push(makeBuilding(rng, bx0 + cut + 8, by0 + 8, bw - cut - 16, bh - 16));
      } else {
        const inset = range(rng, 14, 34);
        buildings.push(makeBuilding(rng, bx0 + inset, by0 + inset, bw - inset * 2, bh - inset * 2));
      }
    }
  }

  // Palms along the promenade and scattered trees on blocks.
  const palms = [];
  for (let x = 60; x < WORLD; x += 95) {
    if (rng() < 0.85) palms.push({ x: x + range(rng, -12, 12), y: PROM_Y - 66 + range(rng, -6, 6), s: range(rng, 0.9, 1.25) });
    if (rng() < 0.6) palms.push({ x: x + 45 + range(rng, -12, 12), y: SAND_Y + 40 + range(rng, 0, 60), s: range(rng, 0.9, 1.3) });
  }
  const trees = [];
  for (let i = 0; i < 130; i++) {
    const x = range(rng, 40, WORLD - 40), y = range(rng, 40, SAND_Y - 40);
    if (isOnRoad(x, y, vRoads, hRoads)) continue;
    if (buildings.some((b) => pointInRect(x, y, { x: b.x - 8, y: b.y - 8, w: b.w + 16, h: b.h + 16 }))) continue;
    trees.push({ x, y, s: range(rng, 0.8, 1.3) });
  }

  // Pier deck: walkable planks out into the sea from the promenade.
  const pier = { x: 1760, y: SAND_Y, w: 80, h: SEA_Y + 90 - SAND_Y, cx: 1800, cy: SEA_Y + 40 };
  const city = { seed, vRoads, hRoads, buildings, palms, trees, pier, landmarkById };
  return city;
}

function makeBuilding(rng, x, y, w, h) {
  return {
    x, y, w, h,
    color: pick(rng, WALL_COLORS),
    roof: pick(rng, ROOF_COLORS),
    floors: intRange(rng, 1, 4),
    landmark: null, label: null,
  };
}

export function isOnRoad(x, y, vRoads, hRoads) {
  for (const rx of vRoads) if (Math.abs(x - rx) < ROAD_W / 2 && y < PROM_Y + ROAD_W / 2) return true;
  for (const ry of hRoads) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

export function isWater(city, x, y) {
  if (y <= SEA_Y) return false;
  return !pointInRect(x, y, city.pier); // the pier deck is dry
}

// Resolve a circle against every building and the world edges; returns corrected pos.
export function collideCircle(city, x, y, r) {
  for (const b of city.buildings) {
    if (x < b.x - r || x > b.x + b.w + r || y < b.y - r || y > b.y + b.h + r) continue;
    const hit = pushCircleOutOfRect(x, y, r, b);
    if (hit) { x = hit.x; y = hit.y; }
  }
  if (isWater(city, x, y)) y = SEA_Y - r;
  x = clamp(x, r, WORLD - r);
  y = clamp(y, r, WORLD - r);
  return { x, y };
}

// Nearest point on any road to (x, y) — used by cruiser pursuit routing.
export function nearestRoadPoint(city, x, y) {
  let best = null, bestD = Infinity;
  for (const rx of city.vRoads) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 0, PROM_Y) }; }
  }
  for (const ry of city.hRoads) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, WORLD), y: ry }; }
  }
  return best;
}

export function nearestRoadCentre(city, x, y) {
  let bx = city.vRoads[0], bd = Infinity;
  for (const rx of city.vRoads) { const d = Math.abs(x - rx); if (d < bd) { bd = d; bx = rx; } }
  let by = city.hRoads[0]; bd = Infinity;
  for (const ry of city.hRoads) { const d = Math.abs(y - ry); if (d < bd) { bd = d; by = ry; } }
  return { x: bx, y: by };
}
