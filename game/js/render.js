// SOLMAR — Streets of the Sun. Canvas renderer: ground, roads, buildings,
// beach, pier, zone labels, then cars, peds, enemies, player and effects.
import { WORLD, ROAD_W, SEA_Y, SAND_Y, PROM_Y } from './city.js';
import { drawCar } from './vehicles.js';
import { drawPed } from './people.js';
import { drawEnemy } from './combat.js';
import { drawEffects } from './effects.js';

const ZONE_LABELS = [
  { text: 'OLD TOWN', x: 600, y: 750 },
  { text: 'DOWNTOWN', x: 1950, y: 750 },
  { text: 'EAST HARBOUR', x: 3000, y: 2250 },
  { text: 'WESTSIDE', x: 600, y: 2100 },
  { text: 'MIDTOWN', x: 1950, y: 2100 },
  { text: 'PALMA BEACH', x: 1800, y: 3400 },
];

export function drawWorld(game, ctx, cam, vw, vh) {
  const city = game.city;
  const shakeX = game.fx.shake ? (Math.random() - 0.5) * game.fx.shake : 0;
  const shakeY = game.fx.shake ? (Math.random() - 0.5) * game.fx.shake : 0;
  ctx.save();
  ctx.translate(vw / 2 - cam.x + shakeX, vh / 2 - cam.y + shakeY);
  const left = cam.x - vw / 2 - 60, right = cam.x + vw / 2 + 60;
  const top = cam.y - vh / 2 - 60, bottom = cam.y + vh / 2 + 60;

  // Ground
  ctx.fillStyle = '#8fbf6a';
  ctx.fillRect(left, top, right - left, Math.min(bottom, SAND_Y) - top);
  // Sand + sea
  if (bottom > SAND_Y) {
    ctx.fillStyle = '#ecd9a0';
    ctx.fillRect(left, SAND_Y, right - left, Math.min(bottom, SEA_Y) - SAND_Y);
  }
  if (bottom > SEA_Y) {
    ctx.fillStyle = '#2a9bc2';
    ctx.fillRect(left, SEA_Y, right - left, bottom - SEA_Y);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = Math.floor(left / 140) * 140; x < right; x += 140) {
      const wob = Math.sin(game.time * 1.2 + x * 0.01) * 4;
      ctx.fillRect(x, SEA_Y + 30 + wob, 70, 3);
      ctx.fillRect(x + 60, SEA_Y + 70 - wob, 50, 3);
    }
  }
  // Roads: sidewalk edge, then asphalt, then centre dashes.
  for (const rx of city.vRoads) {
    if (rx < left - 80 || rx > right + 80) continue;
    const yEnd = Math.min(bottom, PROM_Y + ROAD_W / 2);
    ctx.fillStyle = '#c9c2b2';
    ctx.fillRect(rx - ROAD_W / 2 - 10, top, ROAD_W + 20, yEnd - top);
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(rx - ROAD_W / 2, top, ROAD_W, yEnd - top);
  }
  for (const ry of city.hRoads) {
    if (ry < top - 80 || ry > bottom + 80) continue;
    ctx.fillStyle = '#c9c2b2';
    ctx.fillRect(left, ry - ROAD_W / 2 - 10, right - left, ROAD_W + 20);
    ctx.fillStyle = '#4a4a52';
    ctx.fillRect(left, ry - ROAD_W / 2, right - left, ROAD_W);
  }
  // Centre dashes
  ctx.fillStyle = '#e8d44d';
  for (const rx of city.vRoads) {
    if (rx < left - 80 || rx > right + 80) continue;
    for (let y = Math.floor(top / 46) * 46; y < Math.min(bottom, PROM_Y); y += 46) {
      ctx.fillRect(rx - 2, y, 4, 22);
    }
  }
  for (const ry of city.hRoads) {
    if (ry < top - 80 || ry > bottom + 80) continue;
    for (let x = Math.floor(left / 46) * 46; x < right; x += 46) {
      ctx.fillRect(x, ry - 2, 22, 4);
    }
  }
  // Crosswalks at intersections
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  for (const rx of city.vRoads) {
    for (const ry of city.hRoads) {
      if (rx < left - 80 || rx > right + 80 || ry < top - 80 || ry > bottom + 80) continue;
      for (let i = -3; i <= 3; i++) {
        ctx.fillRect(rx + i * 12 - 4, ry - ROAD_W / 2 + 4, 8, 14);
        ctx.fillRect(rx + i * 12 - 4, ry + ROAD_W / 2 - 18, 8, 14);
      }
    }
  }
  // Zone labels painted on the ground
  ctx.save();
  ctx.textAlign = 'center';
  ctx.font = '900 62px "Arial Narrow", Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (const z of ZONE_LABELS) {
    if (z.x < left - 200 || z.x > right + 200 || z.y < top - 100 || z.y > bottom + 100) continue;
    ctx.fillText(z.text, z.x, z.y);
  }
  ctx.restore();
  // Buildings
  for (const b of city.buildings) {
    if (b.x > right || b.x + b.w < left || b.y > bottom || b.y + b.h < top) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(b.x + 7, b.y + 9, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 7, b.y + 7, b.w - 14, b.h - 14);
    // Rooftop detail: AC units / skylights
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    const n = Math.max(1, Math.floor(b.w / 60));
    for (let i = 0; i < n; i++) {
      ctx.fillRect(b.x + 14 + i * ((b.w - 28) / n), b.y + 14, 14, 10);
    }
    if (b.landmark) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 15px "Arial Narrow", Arial, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(b.label, b.x + b.w / 2, b.y - 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(b.label, b.x + b.w / 2, b.y - 10);
      ctx.restore();
    }
  }
  // Pier
  const pier = city.pier;
  if (pier.x < right && pier.x + pier.w > left && pier.y < bottom) {
    ctx.fillStyle = '#8a6a4d';
    ctx.fillRect(pier.x, pier.y, pier.w, Math.min(bottom, pier.y + pier.h) - pier.y);
    ctx.fillStyle = '#6f543a';
    for (let y = pier.y + 8; y < Math.min(bottom, pier.y + pier.h); y += 22) {
      ctx.fillRect(pier.x, y, pier.w, 3);
    }
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 15px "Arial Narrow", Arial, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    ctx.strokeText('Solmar Pier', pier.cx, pier.y + pier.h - 12);
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Solmar Pier', pier.cx, pier.y + pier.h - 12);
    ctx.restore();
  }
  // Trees + palms
  for (const t of city.trees) {
    if (t.x < left || t.x > right || t.y < top || t.y > bottom) continue;
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(t.x + 3, t.y + 4, 12 * t.s, 9 * t.s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3f8f4f';
    ctx.beginPath(); ctx.arc(t.x, t.y, 11 * t.s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57a866';
    ctx.beginPath(); ctx.arc(t.x - 3, t.y - 3, 6 * t.s, 0, Math.PI * 2); ctx.fill();
  }
  for (const pl of city.palms) {
    if (pl.x < left || pl.x > right || pl.y < top || pl.y > bottom) continue;
    ctx.save();
    ctx.translate(pl.x, pl.y);
    ctx.scale(pl.s, pl.s);
    ctx.strokeStyle = '#7a5a35';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 6); ctx.lineTo(0, -4); ctx.stroke();
    ctx.strokeStyle = '#2e8b57';
    ctx.lineWidth = 2.5;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, -4);
      ctx.quadraticCurveTo(Math.cos(a) * 8, -4 + Math.sin(a) * 8 - 4, Math.cos(a) * 13, -4 + Math.sin(a) * 13 + 3);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Mission marker beacon
  const marker = game.missions && game.missions.objective.marker;
  if (marker) {
    const pulse = 1 + Math.sin(game.time * 5) * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#ffe600';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(marker.x, marker.y, 26 * pulse, 16 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffe600';
    ctx.beginPath();
    ctx.moveTo(marker.x, marker.y - 34);
    ctx.lineTo(marker.x + 10, marker.y - 16);
    ctx.lineTo(marker.x - 10, marker.y - 16);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  // Hidden cash stashes: a faint green glint for the sharp-eyed.
  if (game.missions && game.missions.stashes) {
    for (const s of game.missions.stashes) {
      if (s.taken) continue;
      const glint = 0.55 + Math.sin(game.time * 3 + s.x) * 0.25;
      ctx.save();
      ctx.globalAlpha = glint;
      ctx.fillStyle = '#7dd87d';
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 10);
      ctx.lineTo(s.x + 7, s.y);
      ctx.lineTo(s.x, s.y + 10);
      ctx.lineTo(s.x - 7, s.y);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  // Entities
  drawEffects(game.fx, ctx);
  for (const car of game.cars) drawCar(ctx, car, game.time);
  for (const ped of game.peds) drawPed(ctx, ped);
  for (const e of game.enemies) drawEnemy(ctx, e);
  if (game.state !== 'title') drawPlayer(game, ctx);
  ctx.restore();
  // Warm sun-soaked grade over everything
  ctx.save();
  ctx.fillStyle = 'rgba(255, 190, 90, 0.05)';
  ctx.fillRect(0, 0, vw, vh);
  ctx.restore();
}

function drawPlayer(game, ctx) {
  const p = game.player;
  if (p.inCar) return; // the car is the visible body
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.ellipse(1, 2, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  // Danny: teal jacket, dark jeans
  ctx.fillStyle = '#0f8a8a';
  ctx.beginPath(); ctx.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(8, 0, 5.5, 0, Math.PI * 2); ctx.fill();
  // Pistol
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(8, -2, 13, 4);
  ctx.restore();
  // Player ring so he reads at a glance
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(p.x, p.y, 15, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();
}
