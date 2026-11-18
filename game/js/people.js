// SOLMAR — Streets of the Sun. Pedestrians: sidewalk walkers who turn at
// intersections, flee gunfire and speeding cars, and get knocked down by them.
import { clamp, dist, angleTo, angleDiff } from './util.js';
import { WORLD, ROAD_W, collideCircle } from './city.js';
import { blood } from './effects.js';

const SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#fd79a8', '#00cec9'];
const SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];

export function createPed(game, x, y) {
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const roads = axis === 'x' ? game.city.hRoads : game.city.vRoads;
  const road = roads[Math.floor(Math.random() * roads.length)];
  const side = Math.random() < 0.5 ? -1 : 1;
  const dir = Math.random() < 0.5 ? 1 : -1;
  const off = side * (ROAD_W / 2 + 10);
  return {
    x: axis === 'x' ? (x ?? 150 + Math.random() * (WORLD - 300)) : road + off,
    y: axis === 'x' ? road + off : (y ?? 150 + Math.random() * (WORLD - 300)),
    angle: axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    axis, road, side, dir,
    speed: 42 + Math.random() * 30,
    state: 'walk', timer: 0, fleeX: 0, fleeY: 0,
    shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
    skin: SKINS[Math.floor(Math.random() * SKINS.length)],
    walkPhase: Math.random() * 10,
    hp: 100,
  };
}

export function scarePeds(game, x, y, radius) {
  for (const ped of game.peds) {
    if (ped.state === 'down') continue;
    if (dist(ped.x, ped.y, x, y) < radius) {
      ped.state = 'flee';
      ped.timer = 2.5 + Math.random() * 1.5;
      ped.fleeX = x; ped.fleeY = y;
    }
  }
}

export function knockDownPed(game, ped, byPlayer) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.timer = 4;
  blood(game.fx, ped.x, ped.y);
  game.stats.pedsDown = (game.stats.pedsDown || 0) + 1;
  scarePeds(game, ped.x, ped.y, 260);
  // Only the PLAYER's actions draw heat — traffic accidents are not his crime.
  if (!byPlayer) return;
  // Running someone over is a crime — worse when a cop saw it.
  const copNear = game.enemies.some((e) => e.type === 'cop' && dist(e.x, e.y, ped.x, ped.y) < 700) ||
    game.cars.some((c) => c.role === 'cruiser' && dist(c.x, c.y, ped.x, ped.y) < 700);
  game.police.addWanted(copNear ? 2 : 1, 'ped down');
}

export function updatePeds(game, dt) {
  const p = game.player;
  for (const ped of game.peds) {
    ped.walkPhase += dt * (ped.state === 'flee' ? 14 : 7);
    if (ped.state === 'down') {
      ped.timer -= dt;
      if (ped.timer <= 0) { ped.state = 'flee'; ped.timer = 3; ped.fleeX = p.x; ped.fleeY = p.y; }
      continue;
    }
    if (ped.state === 'flee') {
      ped.timer -= dt;
      const a = angleTo(ped.fleeX, ped.fleeY, ped.x, ped.y);
      ped.angle += angleDiff(ped.angle, a) * Math.min(1, dt * 8);
      ped.x += Math.cos(ped.angle) * 190 * dt;
      ped.y += Math.sin(ped.angle) * 190 * dt;
      if (ped.timer <= 0) ped.state = 'walk';
    } else {
      // Walk the sidewalk; turn at intersections sometimes.
      const crossings = ped.axis === 'x' ? game.city.vRoads : game.city.hRoads;
      const along = ped.axis === 'x' ? ped.x : ped.y;
      for (const c of crossings) {
        const rel = (c - along) * ped.dir;
        if (rel > 0 && rel < ped.speed * dt + 4 && Math.random() < 0.25) {
          const newAxis = ped.axis === 'x' ? 'y' : 'x';
          ped.axis = newAxis;
          ped.road = c;
          ped.dir = Math.random() < 0.5 ? 1 : -1;
          ped.side = Math.random() < 0.5 ? -1 : 1;
          break;
        }
      }
      const off = ped.side * (ROAD_W / 2 + 10);
      if (ped.axis === 'x') {
        ped.x += ped.dir * ped.speed * dt;
        ped.y = ped.road + off;
        if (ped.x < 60) ped.dir = 1;
        if (ped.x > WORLD - 60) ped.dir = -1;
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
      } else {
        ped.y += ped.dir * ped.speed * dt;
        ped.x = ped.road + off;
        if (ped.y < 60) ped.dir = 1;
        if (ped.y > WORLD - 60) ped.dir = -1;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
      // A fast car bearing down scares them off the road.
      for (const car of game.cars) {
        if (car.speed < 120) continue;
        const d = dist(ped.x, ped.y, car.x, car.y);
        if (d < 110) {
          const ahead = (ped.x - car.x) * Math.cos(car.angle) + (ped.y - car.y) * Math.sin(car.angle);
          if (ahead > 0) { ped.state = 'flee'; ped.timer = 2; ped.fleeX = car.x; ped.fleeY = car.y; }
        }
      }
    }
    const fixed = collideCircle(game.city, ped.x, ped.y, 10);
    ped.x = fixed.x; ped.y = fixed.y;
    ped.x = clamp(ped.x, 10, WORLD - 10);
    ped.y = clamp(ped.y, 10, WORLD - 10);
    // Hit by a moving car? Only the player's car draws heat for it.
    for (const car of game.cars) {
      if (car.speed < 60) continue;
      if (dist(ped.x, ped.y, car.x, car.y) < car.spec.radius + 8) {
        knockDownPed(game, ped, car.role === 'player');
        break;
      }
    }
  }
  // Keep the streets populated near the player.
  if (game.peds.length < 26) {
    const ped = createPed(game);
    if (dist(ped.x, ped.y, p.x, p.y) > 500) game.peds.push(ped);
  }
  // Recycle peds that drifted far away.
  for (let i = game.peds.length - 1; i >= 0; i--) {
    if (dist(game.peds[i].x, game.peds[i].y, p.x, p.y) > 1600) game.peds.splice(i, 1);
  }
}

export function drawPed(ctx, ped) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.state === 'down') {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath(); ctx.ellipse(0, 0, 12, 6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath(); ctx.arc(11, 0, 5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }
  ctx.rotate(ped.angle);
  const bob = Math.sin(ped.walkPhase) * 1.5;
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 2, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.shirt;
  ctx.beginPath(); ctx.ellipse(0, bob * 0.4, 8, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = ped.skin;
  ctx.beginPath(); ctx.arc(7, 0, 5, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
