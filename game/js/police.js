// SOLMAR — Streets of the Sun. Wanted system: heat from crimes, cooling when
// unseen, foot cops on foot, cruiser pursuit with ramming when driving.
import { clamp, dist, angleTo, angleDiff } from './util.js';
import { nearestRoadPoint } from './city.js';
import { createCar, driveCar } from './vehicles.js';
import { spawnEnemy } from './combat.js';
import { updateSiren } from './audio.js';

export function createPolice(game) {
  return {
    game,
    unseenTimer: 0,
    spawnTimer: 0,
    lastHeatAt: -99,
    addWanted(n, _reason) {
      const g = this.game;
      if (n <= 0) return;
      const before = g.wanted;
      g.wanted = clamp(g.wanted + n, 0, 5);
      this.unseenTimer = 0;
      this.lastHeatAt = g.time;
      if (before === 0 && g.wanted > 0 && g.hud) g.hud.banner('WANTED', 'The SBPD is after you', '#ff5b5b');
    },
    clearWanted() {
      this.game.wanted = 0;
      this.unseenTimer = 0;
    },
    update(dt) {
      const g = this.game;
      const p = g.player;
      // Am I seen? Any cop or cruiser close enough counts.
      let seen = false;
      for (const e of g.enemies) if (e.type === 'cop' && dist(e.x, e.y, p.x, p.y) < 560) { seen = true; break; }
      if (!seen) for (const c of g.cars) if (c.role === 'cruiser' && dist(c.x, c.y, p.x, p.y) < 720) { seen = true; break; }
      if (g.wanted > 0) {
        if (seen) this.unseenTimer = 0;
        else {
          this.unseenTimer += dt;
          const need = this.unseenTimer > 7 ? 4 : 7;
          if (this.unseenTimer >= need) {
            g.wanted = Math.max(0, g.wanted - 1);
            this.unseenTimer = 3; // next star after 4 more unseen seconds
            if (g.wanted === 0 && g.hud) g.hud.banner('CLEAN', 'You lost the heat', '#7dd87d');
          }
        }
      }
      // Desired force depends on whether the player is driving.
      const wantCruisers = p.inCar ? Math.min(g.wanted, 3) : 0;
      const wantCops = !p.inCar ? Math.min(g.wanted, 5) : 0;
      this.spawnTimer -= dt;
      const cruisers = g.cars.filter((c) => c.role === 'cruiser');
      const cops = g.enemies.filter((e) => e.type === 'cop');
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 0.8;
        // Fresh heat always draws a first response; after that, new units
        // only spawn while the player is seen — otherwise heat could never cool.
        const canSpawn = seen || (g.time - this.lastHeatAt < 3);
        if (canSpawn && cruisers.length < wantCruisers) this.spawnCruiser();
        if (canSpawn && cops.length < wantCops) this.spawnCop();
      }
      // Stand down forces that no longer fit.
      if (wantCruisers === 0 && cruisers.length) {
        for (let i = g.cars.length - 1; i >= 0; i--) {
          if (g.cars[i].role === 'cruiser') g.cars.splice(i, 1);
        }
      }
      if (wantCops === 0 && cops.length) {
        for (let i = g.enemies.length - 1; i >= 0; i--) {
          if (g.enemies[i].type === 'cop') g.enemies.splice(i, 1);
        }
      }
      // Cruiser pursuit AI.
      for (const c of g.cars) {
        if (c.role !== 'cruiser') continue;
        this.driveCruiser(c, dt);
      }
      updateSiren(g.cars.some((c) => c.role === 'cruiser'));
    },
    spawnCruiser() {
      const g = this.game, p = g.player;
      // Arrive on the road network near the player, off-screen if possible.
      const a = Math.random() * Math.PI * 2;
      const rx = p.x + Math.cos(a) * 700, ry = p.y + Math.sin(a) * 700;
      const rp = nearestRoadPoint(g.city, rx, ry);
      const car = createCar(rp.x, rp.y, angleTo(rp.x, rp.y, p.x, p.y), 'cruiser', 'cruiser');
      g.cars.push(car);
    },
    spawnCop() {
      const g = this.game, p = g.player;
      const a = Math.random() * Math.PI * 2;
      const x = clamp(p.x + Math.cos(a) * (420 + Math.random() * 200), 30, 3570);
      const y = clamp(p.y + Math.sin(a) * (420 + Math.random() * 200), 30, 3570);
      spawnEnemy(g, x, y, 'cop');
    },
    driveCruiser(car, dt) {
      const g = this.game, p = g.player;
      const d = dist(car.x, car.y, p.x, p.y);
      // Far off: head for the road nearest the player; close in: ram the player.
      let target;
      if (d > 320) target = nearestRoadPoint(g.city, p.x, p.y);
      else target = { x: p.x + (p.car ? p.car.vx * 0.25 : 0), y: p.y + (p.car ? p.car.vy * 0.25 : 0) };
      const want = angleTo(car.x, car.y, target.x, target.y);
      const diff = angleDiff(car.angle, want);
      let throttle = 1, steer = clamp(diff / 0.45, -1, 1);
      if (Math.abs(diff) > 1.6) throttle = 0.35;
      // Stuck against a building? Reverse out, then try again.
      if (car.speed < 25 && throttle > 0) car.stuckTimer += dt; else car.stuckTimer = 0;
      if (car.stuckTimer > 1.1) { car.reverseTimer = 0.9; car.stuckTimer = 0; }
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        throttle = -1;
        steer = -steer;
      }
      driveCar(g, car, { throttle, steer, handbrake: false }, dt);
      car.sirenPhase += dt;
      // A wrecked or far-off cruiser drops out of the chase.
      if (car.wrecked || d > 1900) {
        const i = g.cars.indexOf(car);
        if (i >= 0) g.cars.splice(i, 1);
      }
    },
  };
}
