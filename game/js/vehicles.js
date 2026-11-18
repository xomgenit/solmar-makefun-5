// SOLMAR — Streets of the Sun. Vehicles: arcade driving physics shared by the
// player and police cruisers, lane-following traffic, parked cars, collisions.
import { clamp, dist, angleDiff, pushCircleOutOfRect } from './util.js';
import { WORLD, ROAD_W, PROM_Y } from './city.js';
import { sparks, skid, addShake } from './effects.js';
import { sfx } from './audio.js';

export const MODELS = {
  sedan:   { name: 'Solmar Sedan',  accel: 400, max: 500, reverse: 140, turn: 2.35, len: 46, wid: 22, radius: 20 },
  sports:  { name: 'Veloce GT',     accel: 540, max: 660, reverse: 150, turn: 2.75, len: 46, wid: 22, radius: 20 },
  taxi:    { name: 'Sun Cab',       accel: 400, max: 500, reverse: 140, turn: 2.35, len: 46, wid: 22, radius: 20 },
  van:     { name: 'Harbour Van',   accel: 300, max: 410, reverse: 120, turn: 1.95, len: 54, wid: 24, radius: 22 },
  pickup:  { name: 'Dune Pickup',   accel: 370, max: 470, reverse: 130, turn: 2.15, len: 50, wid: 23, radius: 21 },
  cruiser: { name: 'SBPD Cruiser',  accel: 500, max: 620, reverse: 150, turn: 2.6,  len: 47, wid: 22, radius: 20 },
};
const PAINTS = ['#d94f3d', '#3d7bd9', '#e8e4da', '#3aa655', '#e8b13d', '#7a5fd0', '#e87ab0', '#2fb3b3', '#c8c8c8', '#3a3a3a'];

export function randomPaint() { return PAINTS[Math.floor(Math.random() * PAINTS.length)]; }

export function createCar(x, y, angle, model, role) {
  const spec = MODELS[model];
  return {
    x, y, angle, vx: 0, vy: 0, speed: 0,
    model, spec, role, color: model === 'taxi' ? '#f7c948' : model === 'cruiser' ? '#1f6fd6' : randomPaint(),
    health: 100, wrecked: false, smokeTimer: 0,
    // traffic fields
    axis: 'x', road: 0, along: 0, dir: 1, cruise: 130 + Math.random() * 50,
    stuckTimer: 0, reverseTimer: 0, sirenPhase: Math.random() * 10,
  };
}

// Arcade drive step: throttle -1..1, steer -1..1, handbrake bool. Velocity-vector
// model with lateral grip, so handbrake turns slide into drifts.
export function driveCar(game, car, input, dt) {
  if (car.wrecked) { input = { throttle: 0, steer: 0, handbrake: false }; }
  const spec = car.spec;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const rx = -fy, ry = fx;
  let fSpeed = car.vx * fx + car.vy * fy;
  let lSpeed = car.vx * rx + car.vy * ry;
  fSpeed += input.throttle * spec.accel * dt;
  if (input.throttle === 0) fSpeed -= fSpeed * 0.45 * dt;
  fSpeed -= fSpeed * 0.12 * dt; // drag
  fSpeed = clamp(fSpeed, -spec.reverse, spec.max);
  const grip = input.handbrake ? 0.965 : 0.82;
  lSpeed *= Math.pow(grip, dt * 60);
  const steerAuthority = clamp(Math.abs(fSpeed) / 130, 0, 1) * (fSpeed >= 0 ? 1 : -1);
  car.angle += input.steer * spec.turn * steerAuthority * dt * (input.handbrake ? 1.35 : 1);
  const nfx = Math.cos(car.angle), nfy = Math.sin(car.angle);
  const nrx = -nfy, nry = nfx;
  car.vx = nfx * fSpeed + nrx * lSpeed;
  car.vy = nfy * fSpeed + nry * lSpeed;
  car.speed = Math.abs(fSpeed);
  const prevX = car.x, prevY = car.y;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  // Building collision: slide along walls, damage on hard hits.
  let hitHard = false;
  for (const b of game.city.buildings) {
    if (car.x < b.x - car.spec.radius || car.x > b.x + b.w + car.spec.radius ||
        car.y < b.y - car.spec.radius || car.y > b.y + b.h + car.spec.radius) continue;
    const hit = pushCircleOutOfRect(car.x, car.y, car.spec.radius, b);
    if (!hit) continue;
    const impact = Math.abs(car.vx * hit.nx + car.vy * hit.ny);
    car.x = hit.x; car.y = hit.y;
    const vn = car.vx * hit.nx + car.vy * hit.ny;
    if (vn < 0) { car.vx -= 1.4 * vn * hit.nx; car.vy -= 1.4 * vn * hit.ny; }
    if (impact > 230) {
      hitHard = true;
      damageCar(game, car, (impact - 230) / 14, hit.x, hit.y);
      if (car.role === 'player') game.damagePlayer((impact - 230) / 45, 'crash');
    }
  }
  if (hitHard) addShake(game.fx, 5);
  // World edges + sea: cars cannot enter the water.
  if (car.y > 3470) { car.y = 3470; car.vy = Math.min(0, car.vy) * -0.3; }
  car.x = clamp(car.x, 12, WORLD - 12);
  car.y = clamp(car.y, 12, WORLD - 12);
  // Skid marks while sliding.
  if ((Math.abs(lSpeed) > 70 || (input.handbrake && Math.abs(fSpeed) > 120)) && Math.random() < 0.6) {
    skid(game.fx, prevX - nfx * 14, prevY - nfy * 14, car.angle);
  }
  if (car.health < 35 && !car.wrecked) {
    car.smokeTimer -= dt;
    if (car.smokeTimer <= 0) {
      car.smokeTimer = 0.25;
      game.fx.particles.push({
        x: car.x + nfx * 16, y: car.y + nfy * 16,
        vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 20,
        life: 0.8, maxLife: 0.8, color: '#555555', size: 4 + Math.random() * 3,
      });
    }
  }
  return { hitHard };
}

export function damageCar(game, car, amount, hx, hy) {
  if (car.wrecked || amount <= 0) return;
  car.health -= amount;
  if (hx !== undefined) sparks(game.fx, hx, hy);
  if (car.health <= 0) {
    car.health = 0;
    car.wrecked = true;
    sparks(game.fx, car.x, car.y);
    sfx.crash();
    if (car.role === 'player') addShake(game.fx, 8);
  }
}

// Circle-vs-circle resolution between two cars.
export function collideCars(game, a, b) {
  const rr = a.spec.radius + b.spec.radius - 4;
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr || d2 < 0.01) return;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const overlap = (rr - d) / 2;
  a.x -= nx * overlap; a.y -= ny * overlap;
  b.x += nx * overlap; b.y += ny * overlap;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const impact = -rel;
    const impulse = impact * 0.6;
    a.vx -= impulse * nx; a.vy -= impulse * ny;
    b.vx += impulse * nx; b.vy += impulse * ny;
    if (impact > 200) {
      const dmg = (impact - 200) / 16;
      damageCar(game, a, dmg, a.x + nx * 18, a.y + ny * 18);
      damageCar(game, b, dmg, b.x - nx * 18, b.y - ny * 18);
      if (a.role === 'player' || b.role === 'player') {
        addShake(game.fx, 4);
        game.damagePlayer((impact - 200) / 50, 'crash');
      }
    }
  }
}

export function laneOffset(axis, dir) {
  // Right-hand traffic: eastbound sits south of centre, southbound west.
  if (axis === 'x') return dir > 0 ? 26 : -26;
  return dir > 0 ? -26 : 26;
}

function randomRoadSpot(game) {
  const axis = Math.random() < 0.5 ? 'x' : 'y';
  const roads = axis === 'x' ? game.city.hRoads : game.city.vRoads;
  const road = roads[Math.floor(Math.random() * roads.length)];
  return { axis, road, along: 150 + Math.random() * (WORLD - 300), dir: Math.random() < 0.5 ? 1 : -1 };
}

export function spawnTrafficCar(game) {
  const spot = randomRoadSpot(game);
  const lane = laneOffset(spot.axis, spot.dir);
  const x = spot.axis === 'x' ? spot.along : spot.road + lane;
  const y = spot.axis === 'x' ? spot.road + lane : spot.along;
  if (dist(x, y, game.player.x, game.player.y) < 650) return null;
  const model = ['sedan', 'sedan', 'taxi', 'van', 'pickup', 'sports'][Math.floor(Math.random() * 6)];
  const car = createCar(x, y, spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2), model, 'traffic');
  Object.assign(car, spot);
  car.speed = car.cruise;
  game.cars.push(car);
  return car;
}

export function spawnParkedCar(game) {
  const spot = randomRoadSpot(game);
  const lane = laneOffset(spot.axis, spot.dir) + (spot.dir > 0 ? 14 : -14);
  const x = spot.axis === 'x' ? spot.along : spot.road + lane;
  const y = spot.axis === 'x' ? spot.road + lane : spot.along;
  if (dist(x, y, game.player.x, game.player.y) < 420) return null;
  const model = ['sedan', 'sedan', 'sports', 'van', 'pickup'][Math.floor(Math.random() * 5)];
  const car = createCar(x, y, spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2), model, 'parked');
  game.cars.push(car);
  return car;
}

function obstacleAhead(game, car) {
  const look = 95;
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  for (const other of game.cars) {
    if (other === car) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < look && side < 26) return true;
  }
  const p = game.player;
  if (!p.inCar) {
    const dx = p.x - car.x, dy = p.y - car.y;
    const ahead = dx * fx + dy * fy;
    const side = Math.abs(dx * -fy + dy * fx);
    if (ahead > 0 && ahead < look * 0.8 && side < 22) return true;
  }
  return false;
}

export function updateTraffic(game, dt) {
  const p = game.player;
  for (const car of game.cars) {
    if (car.role !== 'traffic') continue;
    // Keep traffic near the action; recycle far cars.
    if (dist(car.x, car.y, p.x, p.y) > 1500) {
      const spot = randomRoadSpot(game);
      const lane = laneOffset(spot.axis, spot.dir);
      Object.assign(car, spot);
      car.x = spot.axis === 'x' ? spot.along : spot.road + lane;
      car.y = spot.axis === 'x' ? spot.road + lane : spot.along;
      car.angle = spot.axis === 'x' ? (spot.dir > 0 ? 0 : Math.PI) : (spot.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      continue;
    }
    const blocked = obstacleAhead(game, car);
    const target = blocked ? 0 : car.cruise;
    car.speed += clamp(target - car.speed, -500 * dt, 260 * dt);
    const step = car.speed * dt;
    const crossings = car.axis === 'x' ? game.city.vRoads : game.city.hRoads;
    // Turn at an intersection we are about to cross.
    for (const c of crossings) {
      const rel = (c - car.along) * car.dir;
      if (rel > 0 && rel < step + 6 && Math.random() < 0.3) {
        const newAxis = car.axis === 'x' ? 'y' : 'x';
        const newDir = Math.random() < 0.5 ? 1 : -1;
        const newAlong = car.axis === 'x' ? car.y : car.x;
        car.axis = newAxis; car.road = c; car.dir = newDir; car.along = newAlong;
        break;
      }
    }
    car.along += car.dir * step;
    if (car.along < 120) { car.along = 120; car.dir = 1; }
    if (car.along > WORLD - 120) { car.along = WORLD - 120; car.dir = -1; }
    const lane = laneOffset(car.axis, car.dir);
    car.x = car.axis === 'x' ? car.along : car.road + lane;
    car.y = car.axis === 'x' ? car.road + lane : car.along;
    const wantAngle = car.axis === 'x' ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    car.angle += angleDiff(car.angle, wantAngle) * Math.min(1, dt * 6);
    car.vx = Math.cos(car.angle) * car.speed;
    car.vy = Math.sin(car.angle) * car.speed;
  }
  // Top up traffic + parked counts.
  const traffic = game.cars.filter((c) => c.role === 'traffic').length;
  const parked = game.cars.filter((c) => c.role === 'parked').length;
  if (traffic < 14) spawnTrafficCar(game);
  if (parked < 12) spawnParkedCar(game);
  // Car-car collisions (player + cruisers + traffic).
  for (let i = 0; i < game.cars.length; i++) {
    for (let j = i + 1; j < game.cars.length; j++) {
      collideCars(game, game.cars[i], game.cars[j]);
    }
  }
}

export function drawCar(ctx, car, time) {
  const s = car.spec;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.roundRect(-s.len / 2 + 2, -s.wid / 2 + 3, s.len, s.wid, 7);
  ctx.fill();
  // Body
  ctx.fillStyle = car.wrecked ? '#3d3d3d' : car.color;
  ctx.beginPath();
  ctx.roundRect(-s.len / 2, -s.wid / 2, s.len, s.wid, 7);
  ctx.fill();
  if (car.model === 'cruiser') {
    ctx.fillStyle = '#f2f2f2';
    ctx.beginPath();
    ctx.roundRect(-s.len / 2 + 4, -s.wid / 2 + 2, s.len - 8, s.wid - 4, 5);
    ctx.fill();
    ctx.fillStyle = '#1f6fd6';
    ctx.fillRect(-6, -s.wid / 2 + 2, 12, s.wid - 4);
    // Flashing light bar
    const on = Math.floor(time * 6 + car.sirenPhase) % 2 === 0;
    ctx.fillStyle = on ? '#ff2d2d' : '#2d7bff';
    ctx.fillRect(-4, -s.wid / 2 - 1, 8, 5);
    ctx.fillStyle = on ? '#2d7bff' : '#ff2d2d';
    ctx.fillRect(-4, s.wid / 2 - 4, 8, 5);
  } else if (car.model === 'taxi') {
    ctx.fillStyle = '#222222';
    ctx.fillRect(-6, -4, 12, 8);
  }
  // Windshield + rear window
  ctx.fillStyle = car.wrecked ? '#222' : '#9fc6dd';
  ctx.fillRect(4, -s.wid / 2 + 3, 8, s.wid - 6);
  ctx.fillRect(-14, -s.wid / 2 + 3, 6, s.wid - 6);
  // Roof
  ctx.fillStyle = car.wrecked ? '#2a2a2a' : shade(car.color, -18);
  ctx.beginPath();
  ctx.roundRect(-8, -s.wid / 2 + 4, 12, s.wid - 8, 3);
  ctx.fill();
  // Headlights
  ctx.fillStyle = '#fff6b0';
  ctx.fillRect(s.len / 2 - 3, -s.wid / 2 + 2, 3, 5);
  ctx.fillRect(s.len / 2 - 3, s.wid / 2 - 7, 3, 5);
  ctx.restore();
  // Wreck smoke
  if (car.wrecked) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(car.x, car.y - 6, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return `rgb(${r},${g},${b})`;
}
