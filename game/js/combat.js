// SOLMAR — Streets of the Sun. Combat: mouse-aim hitscan shooting with tracers,
// generic enemies (foot cops + Harbor Kings), health bars, player damage.
import { clamp, dist, angleTo, angleDiff } from './util.js';
import { collideCircle } from './city.js';
import { tracer, muzzle, blood, sparks, floater } from './effects.js';
import { sfx } from './audio.js';
import { damageCar } from './vehicles.js';
import { knockDownPed, scarePeds } from './people.js';

export const SHOT_RANGE = 620;
export const SHOT_DAMAGE = 34;

export function spawnEnemy(game, x, y, type) {
  const e = {
    x, y, angle: 0, type, // 'cop' | 'king'
    hp: type === 'cop' ? 50 : 70, maxHp: type === 'cop' ? 50 : 70,
    speed: type === 'cop' ? 205 : 150,
    shootTimer: 0.5 + Math.random() * 0.8,
    arrestTimer: 0,
    dead: false,
  };
  game.enemies.push(e);
  return e;
}

// Hitscan shot from (x, y) along angle. Returns the thing hit, if any.
export function shoot(game, x, y, angle, opts) {
  const fromPlayer = !opts || opts.fromPlayer !== false;
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let bestT = SHOT_RANGE, best = null, bestKind = null;
  const consider = (tx, ty, radius, kind, ref) => {
    const rx = tx - x, ry = ty - y;
    const t = rx * dx + ry * dy;
    if (t < 0 || t > bestT) return;
    const px = x + dx * t, py = y + dy * t;
    if (dist(px, py, tx, ty) < radius + 6) { bestT = t; best = ref; bestKind = kind; }
  };
  for (const e of game.enemies) if (!e.dead) consider(e.x, e.y, 15, 'enemy', e);
  for (const ped of game.peds) if (ped.state !== 'down') consider(ped.x, ped.y, 12, 'ped', ped);
  for (const car of game.cars) {
    if (fromPlayer && game.player.inCar && car === game.player.car) continue;
    consider(car.x, car.y, car.spec.radius, 'car', car);
  }
  // Buildings stop bullets.
  for (const b of game.city.buildings) {
    const t = rayRect(x, y, dx, dy, b);
    if (t !== null && t < bestT) { bestT = t; best = null; bestKind = 'wall'; }
  }
  const endX = x + dx * bestT, endY = y + dy * bestT;
  tracer(game.fx, x + dx * 18, y + dy * 18, endX, endY);
  muzzle(game.fx, x + dx * 20, y + dy * 20, angle);
  if (fromPlayer) {
    sfx.shoot();
    game.stats.shotsFired = (game.stats.shotsFired || 0) + 1;
    scarePeds(game, x, y, 420);
    // Firing where the law can see it draws heat.
    const witness = game.enemies.some((e) => e.type === 'cop' && dist(e.x, e.y, x, y) < 600) ||
      game.cars.some((c) => c.role === 'cruiser' && dist(c.x, c.y, x, y) < 700);
    if (witness && game.wanted < 1) game.police.addWanted(1, 'shots fired');
  }
  if (bestKind === 'enemy') {
    best.hp -= SHOT_DAMAGE;
    blood(game.fx, best.x, best.y);
    if (best.hp <= 0) killEnemy(game, best);
  } else if (bestKind === 'ped') {
    knockDownPed(game, best, fromPlayer); // only the player's shots are his crime
  } else if (bestKind === 'car') {
    damageCar(game, best, 15, endX, endY);
  } else if (bestKind === 'wall') {
    sparks(game.fx, endX, endY);
  }
  return best;
}

function rayRect(x, y, dx, dy, r) {
  let tmin = 0, tmax = SHOT_RANGE;
  if (Math.abs(dx) < 1e-9) {
    if (x < r.x || x > r.x + r.w) return null;
  } else {
    let t1 = (r.x - x) / dx, t2 = (r.x + r.w - x) / dx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  if (Math.abs(dy) < 1e-9) {
    if (y < r.y || y > r.y + r.h) return null;
  } else {
    let t1 = (r.y - y) / dy, t2 = (r.y + r.h - y) / dy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

export function killEnemy(game, e) {
  if (e.dead) return;
  e.dead = true;
  blood(game.fx, e.x, e.y);
  game.stats.kills = (game.stats.kills || 0) + 1;
  if (e.type === 'cop') {
    game.police.addWanted(1, 'officer down');
    floater(game.fx, e.x, e.y - 20, 'OFFICER DOWN', '#ff6b6b');
  } else {
    floater(game.fx, e.x, e.y - 20, 'KING DOWN', '#ffd23f');
    if (game.missions) game.missions.onEnemyDown(e);
  }
}

export function updateEnemies(game, dt) {
  const p = game.player;
  for (const e of game.enemies) {
    if (e.dead) continue;
    const d = dist(e.x, e.y, p.x, p.y);
    const wantAngle = angleTo(e.x, e.y, p.x, p.y);
    e.angle += angleDiff(e.angle, wantAngle) * Math.min(1, dt * 8);
    if (e.type === 'cop') {
      // Far off the chase, the cop gives up and leaves the scene.
      if (d > 1300) { e.dead = true; continue; }
      // Cops track the player's last seen position; out of sight they search
      // there instead of homing in perfectly, so escape is possible.
      if (d < 560) {
        e.lastSeenX = p.x; e.lastSeenY = p.y; e.searching = false;
      } else if (!e.searching) {
        e.searching = true;
        e.wanderTimer = 0;
      }
      let tx = p.x, ty = p.y;
      if (e.searching) {
        tx = e.lastSeenX ?? p.x; ty = e.lastSeenY ?? p.y;
        if (dist(e.x, e.y, tx, ty) < 40) {
          e.wanderTimer -= dt;
          if (e.wanderTimer <= 0) {
            e.wanderTimer = 2.5;
            e.lastSeenX = clamp(tx + (Math.random() - 0.5) * 400, 30, 3570);
            e.lastSeenY = clamp(ty + (Math.random() - 0.5) * 400, 30, 3570);
          }
        }
      }
      const chaseAngle = angleTo(e.x, e.y, tx, ty);
      e.angle += angleDiff(e.angle, chaseAngle) * Math.min(1, dt * 8);
      const td = dist(e.x, e.y, tx, ty);
      if (td > 26) {
        const sp = e.speed * (game.wanted >= 3 ? 1.12 : 1);
        e.x += Math.cos(e.angle) * sp * dt;
        e.y += Math.sin(e.angle) * sp * dt;
      }
      if (d < 30 && !p.inCar && p.speed < 90) {
        e.arrestTimer += dt;
        if (e.arrestTimer > 1.2) { game.busted(); return; }
      } else {
        e.arrestTimer = 0;
      }
      e.shootTimer -= dt;
      if (d < 330 && d > 40 && e.shootTimer <= 0) {
        e.shootTimer = 0.9 + Math.random() * 0.5;
        const spread = (Math.random() - 0.5) * 0.35;
        shoot(game, e.x, e.y, e.angle + spread, { fromPlayer: false });
        // Enemy bullets: separate hit roll against the player.
        if (Math.random() < 0.34 + game.wanted * 0.02) game.damagePlayer(9, 'bullet');
      }
    } else {
      // Harbor King: holds ground, shoots when the player is near.
      e.shootTimer -= dt;
      if (d < 380 && e.shootTimer <= 0) {
        e.shootTimer = 1.0 + Math.random() * 0.6;
        const spread = (Math.random() - 0.5) * 0.3;
        shoot(game, e.x, e.y, e.angle + spread, { fromPlayer: false });
        if (Math.random() < 0.3) game.damagePlayer(10, 'bullet');
      } else if (d > 420) {
        e.x += Math.cos(e.angle) * e.speed * 0.5 * dt;
        e.y += Math.sin(e.angle) * e.speed * 0.5 * dt;
      }
    }
    const fixed = collideCircle(game.city, e.x, e.y, 12);
    e.x = fixed.x; e.y = fixed.y;
  }
  // Sweep the dead.
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    if (game.enemies[i].dead) game.enemies.splice(i, 1);
  }
}

export function drawEnemy(ctx, e) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath(); ctx.ellipse(1, 2, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = e.type === 'cop' ? '#2456c8' : '#c0392b';
  ctx.beginPath(); ctx.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f1c27d';
  ctx.beginPath(); ctx.arc(8, 0, 5, 0, Math.PI * 2); ctx.fill();
  // Gun
  ctx.fillStyle = '#222';
  ctx.fillRect(8, -1.5, 10, 3);
  ctx.restore();
  // Health bar when hurt.
  if (e.hp < e.maxHp) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(e.x - 14, e.y - 22, 28, 5);
    ctx.fillStyle = e.type === 'cop' ? '#4d8dff' : '#ff5b5b';
    ctx.fillRect(e.x - 13, e.y - 21, 26 * clamp(e.hp / e.maxHp, 0, 1), 3);
    ctx.restore();
  }
  if (e.arrestTimer > 0.15) {
    ctx.save();
    ctx.font = 'bold 13px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('BUSTING…', e.x, e.y - 30);
    ctx.restore();
  }
}
