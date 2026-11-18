// SOLMAR — Streets of the Sun. Game orchestration: states (title / playing /
// paused / wasted / busted), player control on foot and by car, stealing,
// respray + hospital interactions, camera, save wiring, debug hooks.
//
// Controls: WASD move/drive, Shift sprint, Space handbrake, E interact
// (steal/exit/respray/heal), mouse aim, click/hold to shoot, Esc pause.
import { clamp, lerp, dist, angleTo } from './util.js';
import { buildCity, collideCircle, WORLD, zoneAt } from './city.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { createEffects, updateEffects, floater } from './effects.js';
import { createCar, driveCar, updateTraffic, spawnTrafficCar, spawnParkedCar, damageCar } from './vehicles.js';
import { createPed, updatePeds } from './people.js';
import { createPolice } from './police.js';
import { shoot, updateEnemies } from './combat.js';
import { createMissions } from './missions.js';
import { hasSave, saveGame, loadSave } from './save.js';
import { ensureAudio, sfx, updateEngine, updateSiren, stopAllLoops } from './audio.js';
import { drawWorld } from './render.js';

const START_CASH = 200;
const RESPRAY_COST = 150;
const HEAL_COST = 100;

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
let vw = 0, vh = 0, dpr = 1;

function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  vw = window.innerWidth; vh = window.innerHeight;
  canvas.width = Math.floor(vw * dpr);
  canvas.height = Math.floor(vh * dpr);
  canvas.style.width = vw + 'px';
  canvas.style.height = vh + 'px';
}
window.addEventListener('resize', resize);
resize();

const input = createInput(canvas);
input.attach();
const hud = createHud();

// The single game object. reset() rebuilds the world in place, so the debug
// hook window.__solmar.game never goes stale across NEW GAME / CONTINUE.
const game = {
  state: 'title',
  time: 0,
  playSeconds: 0,
  city: null,
  player: null,
  cars: [],
  peds: [],
  enemies: [],
  fx: createEffects(),
  wanted: 0,
  police: null,
  missions: null,
  stats: {},
  hud,
  cam: { x: 1800, y: 1500 },
  fireTimer: 0,
  interactTarget: null,
  save() { return saveGame(this); },
  damagePlayer(amount, _source) {
    const p = this.player;
    if (!p || this.state !== 'playing' || amount <= 0) return;
    p.hp -= amount;
    p.lastDamageAt = this.time;
    if (p.hp <= 0) { p.hp = 0; this.wasted(); }
  },
  wasted() {
    if (this.state !== 'playing') return;
    this.state = 'wasted';
    sfx.wasted();
    stopAllLoops();
    hud.showHud(false);
    showOverlay('wasted-screen');
  },
  busted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    sfx.wasted();
    stopAllLoops();
    hud.showHud(false);
    showOverlay('busted-screen');
  },
};
game.police = createPolice(game);

function showOverlay(id) {
  for (const el of document.querySelectorAll('.overlay')) el.classList.remove('show');
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}
function hideOverlays() {
  for (const el of document.querySelectorAll('.overlay')) el.classList.remove('show');
}

function freshPlayer(city) {
  const hideout = city.landmarkById.hideout;
  return {
    x: hideout.cx, y: hideout.cy + 110, angle: -Math.PI / 2,
    hp: 100, cash: START_CASH, speed: 0,
    inCar: false, car: null, lastDamageAt: -99,
  };
}

function populateWorld() {
  for (let i = 0; i < 14; i++) spawnTrafficCar(game);
  for (let i = 0; i < 12; i++) spawnParkedCar(game);
  for (let i = 0; i < 26; i++) {
    const ped = createPed(game);
    if (dist(ped.x, ped.y, game.player.x, game.player.y) > 300) game.peds.push(ped);
  }
  // A sports car waits in front of the hideout, in the eastbound lane —
  // the first steal is free.
  const h = game.city.landmarkById.hideout;
  const starter = createCar(h.cx + 46, h.cy + 176, 0, 'sports', 'parked');
  starter.color = '#d94f3d';
  game.cars.push(starter);
}

function resetWorld(seed) {
  game.city = buildCity(seed);
  game.cars = [];
  game.peds = [];
  game.enemies = [];
  game.fx = createEffects();
  game.wanted = 0;
  game.stats = { shotsFired: 0, kills: 0, carsStolen: 0, pedsDown: 0 };
  game.playSeconds = 0;
  game.player = freshPlayer(game.city);
  game.cam.x = game.player.x;
  game.cam.y = game.player.y;
  game.missions = createMissions(game);
  populateWorld();
}

function startTitle() {
  game.state = 'title';
  resetWorld(7);
  game.missions = createMissions(game); // no objective on the title screen
  hud.showHud(false);
  stopAllLoops();
  const cont = document.getElementById('btn-continue');
  if (cont) cont.disabled = !hasSave();
  showOverlay('title-screen');
}

function startNewGame() {
  ensureAudio();
  const params = new URLSearchParams(location.search);
  const seedParam = parseInt(params.get('seed') || '', 10);
  const seed = Number.isFinite(seedParam) ? seedParam : Math.floor(Math.random() * 100000) + 1;
  resetWorld(seed);
  game.missions.start('first-wheels');
  game.state = 'playing';
  hideOverlays();
  hud.showHud(true);
  hud.banner('SOLMAR BAY', 'Danny "Dice" Marlow is back in town', '#ffd23f');
  sfx.blip();
}

function startContinue() {
  ensureAudio();
  const data = loadSave();
  if (!data) return;
  resetWorld(data.seed);
  const p = game.player;
  p.cash = data.cash; p.hp = data.health;
  p.x = data.x; p.y = data.y; p.angle = data.angle;
  game.playSeconds = data.playSeconds || 0;
  game.stats = data.stats || game.stats;
  if (data.car) {
    const car = createCar(data.car.x, data.car.y, data.car.angle, data.car.model, 'parked');
    car.color = data.car.color; car.health = data.car.health;
    game.cars.push(car);
  }
  game.missions.restore(data.missions);
  game.state = 'playing';
  hideOverlays();
  hud.showHud(true);
  hud.banner('WELCOME BACK', 'Same city, same streets', '#7dd87d');
  sfx.blip();
}

function respawnAt(landmarkId, fine) {
  const lm = game.city.landmarkById[landmarkId];
  const p = game.player;
  p.hp = 100;
  p.cash = Math.max(0, p.cash - fine);
  p.x = lm.cx; p.y = lm.cy + 110;
  p.angle = -Math.PI / 2;
  p.inCar = false; p.car = null;
  game.wanted = 0;
  game.police.clearWanted();
  game.enemies = game.enemies.filter((e) => e.type !== 'cop');
  for (let i = game.cars.length - 1; i >= 0; i--) {
    if (game.cars[i].role === 'cruiser') game.cars.splice(i, 1);
  }
  game.save();
  game.state = 'playing';
  hideOverlays();
  hud.showHud(true);
}

function pauseGame() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  stopAllLoops();
  const stats = document.getElementById('pause-stats');
  if (stats) {
    const mins = Math.floor(game.playSeconds / 60);
    const secs = Math.floor(game.playSeconds % 60);
    stats.innerHTML =
      'Cash <b>$' + Math.floor(game.player.cash) + '</b> &nbsp;·&nbsp; ' +
      'Missions done <b>' + game.missions.completed.length + '</b> &nbsp;·&nbsp; ' +
      'Time <b>' + mins + ':' + String(secs).padStart(2, '0') + '</b><br>' +
      'Cars stolen <b>' + (game.stats.carsStolen || 0) + '</b> &nbsp;·&nbsp; ' +
      'Kills <b>' + (game.stats.kills || 0) + '</b> &nbsp;·&nbsp; ' +
      'Shots fired <b>' + (game.stats.shotsFired || 0) + '</b>';
  }
  showOverlay('pause-menu');
}

function resumeGame() {
  if (game.state !== 'paused') return;
  game.state = 'playing';
  hideOverlays();
}

function nearestCar(maxD) {
  const p = game.player;
  let best = null, bestD = maxD;
  for (const car of game.cars) {
    if (car.wrecked) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function stealCar(car) {
  const p = game.player;
  car.role = 'player';
  car.vx = 0; car.vy = 0; car.speed = 0;
  p.inCar = true;
  p.car = car;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  game.stats.carsStolen = (game.stats.carsStolen || 0) + 1;
  sfx.blip();
  // Seen theft draws heat.
  const seen = game.enemies.some((e) => e.type === 'cop' && dist(e.x, e.y, car.x, car.y) < 600) ||
    game.cars.some((c) => c.role === 'cruiser' && dist(c.x, c.y, car.x, car.y) < 700);
  if (seen) game.police.addWanted(1, 'car theft');
}

function exitCar() {
  const p = game.player;
  if (!p.car) return;
  const car = p.car;
  car.role = 'parked';
  car.vx = 0; car.vy = 0; car.speed = 0;
  p.inCar = false;
  p.car = null;
  p.x = car.x - Math.sin(car.angle) * 34;
  p.y = car.y + Math.cos(car.angle) * 34;
  const fixed = collideCircle(game.city, p.x, p.y, 12);
  p.x = fixed.x; p.y = fixed.y;
}

// ---- per-frame interaction + hints ---------------------------------------
function computeInteract() {
  const p = game.player;
  const spa = game.city.landmarkById.spa;
  const hospital = game.city.landmarkById.hospital;
  if (p.inCar && p.car) {
    if (dist(p.x, p.y, spa.cx, spa.cy) < 150 && (game.wanted > 0 || p.car.health < 100)) {
      return { kind: 'spa', label: 'E — Respray $' + RESPRAY_COST + ' (clears wanted + repairs)' };
    }
    return { kind: 'exit', label: 'E — Exit car' };
  }
  if (p.hp < 100 && p.cash >= HEAL_COST && dist(p.x, p.y, hospital.cx, hospital.cy) < 150) {
    return { kind: 'heal', label: 'E — Get treated $' + HEAL_COST };
  }
  const car = nearestCar(85);
  if (car) return { kind: 'steal', car, label: 'E — Steal ' + car.spec.name };
  return null;
}

function doInteract(target) {
  const p = game.player;
  if (!target) return;
  if (target.kind === 'steal') stealCar(target.car);
  else if (target.kind === 'exit') exitCar();
  else if (target.kind === 'spa') {
    if (p.cash < RESPRAY_COST) { hud.banner('NOT ENOUGH CASH', 'Respray costs $' + RESPRAY_COST, '#ff5b5b'); return; }
    p.cash -= RESPRAY_COST;
    p.car.health = 100;
    p.car.wrecked = false;
    game.police.clearWanted();
    floater(game.fx, p.x, p.y - 26, 'RESPRAYED — HEAT OFF', '#7dd87d');
    sfx.cash();
  } else if (target.kind === 'heal') {
    p.cash -= HEAL_COST;
    p.hp = 100;
    floater(game.fx, p.x, p.y - 26, 'PATCHED UP', '#7dd87d');
    sfx.heal();
  }
}

// ---- player update --------------------------------------------------------
function mouseWorld() {
  return {
    x: game.cam.x + (input.mouse.x - vw / 2),
    y: game.cam.y + (input.mouse.y - vh / 2),
  };
}

function updatePlayer(dt) {
  const p = game.player;
  if (p.inCar && p.car) {
    const throttle = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const steer = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    driveCar(game, p.car, { throttle, steer, handbrake: input.down('Space') }, dt);
    p.x = p.car.x; p.y = p.car.y; p.angle = p.car.angle;
    p.speed = p.car.speed;
    if (p.car.wrecked) { exitCar(); updateEngine(false, 0); }
    else updateEngine(true, clamp(p.car.speed / 660, 0, 1));
  } else {
    let mx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    let my = (input.down('KeyS') ? 1 : 0) - (input.down('KeyW') ? 1 : 0);
    const len = Math.hypot(mx, my);
    if (len > 0) { mx /= len; my /= len; }
    const sprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const speed = sprint ? 265 : 175;
    p.speed = len > 0 ? speed : 0;
    p.x += mx * speed * dt;
    p.y += my * speed * dt;
    const fixed = collideCircle(game.city, p.x, p.y, 12);
    p.x = fixed.x; p.y = fixed.y;
    const mw = mouseWorld();
    p.angle = angleTo(p.x, p.y, mw.x, mw.y);
    updateEngine(false, 0);
    // Shooting: hold to autofire.
    game.fireTimer -= dt;
    if (input.mouse.down && game.fireTimer <= 0) {
      game.fireTimer = 0.22;
      shoot(game, p.x, p.y, p.angle, { fromPlayer: true });
    }
  }
  // Slow regen after 8s without damage.
  if (p.hp > 0 && p.hp < 100 && game.time - p.lastDamageAt > 8) {
    p.hp = Math.min(100, p.hp + 3 * dt);
  }
  // Interaction
  const target = computeInteract();
  game.interactTarget = target;
  hud.setHint(target ? target.label : '');
  if (input.wasPressed('KeyE')) doInteract(target);
}

// ---- camera ---------------------------------------------------------------
function updateCamera(dt) {
  const p = game.player;
  let tx = p.x, ty = p.y;
  if (p.inCar && p.car) {
    tx += p.car.vx * 0.22;
    ty += p.car.vy * 0.22;
  } else {
    const mw = mouseWorld();
    tx += clamp((mw.x - p.x) * 0.12, -60, 60);
    ty += clamp((mw.y - p.y) * 0.12, -60, 60);
  }
  const k = Math.min(1, dt * 5.5);
  game.cam.x = lerp(game.cam.x, tx, k);
  game.cam.y = lerp(game.cam.y, ty, k);
  game.cam.x = clamp(game.cam.x, vw / 2 - 200, WORLD - vw / 2 + 200);
  game.cam.y = clamp(game.cam.y, vh / 2 - 200, WORLD - vh / 2 + 200);
}

// ---- main loop ------------------------------------------------------------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  game.time += dt;

  if (game.state === 'title') {
    // Attract mode: slow pan over a living city.
    game.cam.x = 1800 + Math.sin(game.time * 0.045) * 700;
    game.cam.y = 1500 + Math.cos(game.time * 0.033) * 500;
    updateTraffic(game, dt);
    updatePeds(game, dt);
    updateEffects(game.fx, dt);
  } else if (game.state === 'playing') {
    game.playSeconds += dt;
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) { pauseGame(); }
    else {
      updatePlayer(dt);
      updateTraffic(game, dt);
      updatePeds(game, dt);
      game.police.update(dt);
      updateEnemies(game, dt);
      game.missions.update(dt);
      updateEffects(game.fx, dt);
      updateCamera(dt);
      hud.update(game, dt);
    }
  } else if (game.state === 'paused') {
    if (input.wasPressed('Escape') || input.wasPressed('KeyP')) resumeGame();
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, vw, vh);
  if (game.city) drawWorld(game, ctx, game.cam, vw, vh);
  input.postUpdate();
}

// ---- menu wiring ----------------------------------------------------------
document.getElementById('btn-new').addEventListener('click', startNewGame);
document.getElementById('btn-continue').addEventListener('click', startContinue);
document.getElementById('btn-resume').addEventListener('click', () => { sfx.click(); resumeGame(); });
document.getElementById('btn-save').addEventListener('click', () => {
  if (game.save()) hud.banner('GAME SAVED', 'Progress stored in this browser', '#7dd87d');
  sfx.click();
});
document.getElementById('btn-restart-mission').addEventListener('click', () => {
  game.missions.restartCurrent();
  sfx.click();
  resumeGame();
});
document.getElementById('btn-quit').addEventListener('click', () => { sfx.click(); startTitle(); });
document.getElementById('btn-respawn').addEventListener('click', () => respawnAt('hospital', 100));
document.getElementById('btn-respawn-busted').addEventListener('click', () => respawnAt('sbpd', 150));
document.getElementById('btn-howto').addEventListener('click', () => {
  document.getElementById('howto').classList.toggle('open');
  sfx.click();
});

// Debug + test hooks. window.__solmar.game follows the one game object across
// NEW GAME / CONTINUE, so play-tests never read a stale snapshot.
window.__solmar = {
  get game() { return game; },
  version: 'retry5-b2',
  teleport(x, y) {
    game.player.x = x; game.player.y = y;
    game.cam.x = x; game.cam.y = y;
    if (game.player.inCar && game.player.car) {
      game.player.car.x = x; game.player.car.y = y;
      game.player.car.vx = 0; game.player.car.vy = 0;
    }
  },
  setWanted(n) {
    game.wanted = clamp(n, 0, 5);
    // Simulate fresh heat so the police response spawns like a real crime.
    game.police.lastHeatAt = game.time;
    game.police.unseenTimer = 0;
  },
  giveCash(n) { game.player.cash += n; },
  zone() { return zoneAt(game.player.x, game.player.y); },
};

// Boot: title screen over a living city. ?autostart=1 skips the title (tests).
startTitle();
if (new URLSearchParams(location.search).has('autostart')) startNewGame();
window.__solmarReady = true;
requestAnimationFrame(frame);
