// SOLMAR — Streets of the Sun. Mission system + story hook.
//
// BUILDER 2: add real missions by registering defs in MISSION_DEFS. A def is:
//   { id, title, brief, reward, next, start(game, ms), update(game, ms, dt),
//     onEnemyDown(game, ms, enemy) }
// - start() runs once when the mission begins; call ms.setObjective(text, {x,y})
//   to show the objective panel + map marker.
// - update() runs every frame; return 'done' to complete or 'failed' to fail.
// - onEnemyDown() fires when a Harbor King (type 'king') dies.
// - next names the mission that starts after this one; null means free roam.
// - completeCurrent() pays the reward, banners, autosaves, then chains to next.
// Free-roam is itself a mission ('free-roam') so the game is playable end to
// end with no story missions registered yet.
import { dist } from './util.js';
import { floater } from './effects.js';
import { sfx } from './audio.js';
import { spawnEnemy } from './combat.js';
import { createCar } from './vehicles.js';

function lm(game, id) { return game.city.landmarkById[id]; }

// Hidden cash stashes: 3 × $300, tucked on open road ground near landmarks
// (road centres are x/y ≡ 150 mod 300, so these are always reachable).
function stashSpots() {
  return [
    { x: 750, y: 1650, taken: false },   // west of Solmar General
    { x: 1350, y: 1950, taken: false },  // north of Sunset Auto Spa
    { x: 3150, y: 2550, taken: false },  // west of East Harbour Docks
  ];
}

export const STASH_REWARD = 300;
export const SCORE_CHANNEL_SECONDS = 5;
export const HOT_DELIVERY_SECONDS = 90;

export const MISSION_DEFS = {
  'first-wheels': {
    id: 'first-wheels',
    title: 'FIRST WHEELS',
    brief: 'Vera needs a runner with wheels. Steal a car and bring it to her garage.',
    reward: 250,
    next: 'the-pickup',
    start(game, ms) {
      const h = lm(game, 'hideout');
      ms.setObjective('Steal a car — press E near one', { x: h.cx + 46, y: h.cy + 176 });
      ms.state.stage = 0;
    },
    update(game, ms) {
      if (ms.state.stage === 0 && game.player.inCar) {
        ms.state.stage = 1;
        const g = lm(game, 'garage');
        ms.setObjective("Drive it to Vera's Garage", { x: g.cx, y: g.cy });
        if (game.hud) game.hud.banner('NICE WHEELS', "Now bring it to Vera's Garage", '#ffd23f');
      }
      if (ms.state.stage === 1) {
        const g = lm(game, 'garage');
        if (dist(game.player.x, game.player.y, g.cx, g.cy) < 170) return 'done';
      }
      return undefined;
    },
  },
  'the-pickup': {
    id: 'the-pickup',
    title: 'THE PICKUP',
    brief: "A package is waiting at the East Harbour Docks. Grab it, bring it to Vera.",
    reward: 400,
    next: 'hot-delivery',
    start(game, ms) {
      const d = lm(game, 'docks');
      ms.setObjective("Pick up Vera's package at the Docks", { x: d.cx, y: d.cy });
      ms.state.stage = 0;
    },
    update(game, ms) {
      const p = game.player;
      if (ms.state.stage === 0) {
        const d = lm(game, 'docks');
        if (dist(p.x, p.y, d.cx, d.cy) < 150) {
          ms.state.stage = 1;
          const diner = lm(game, 'diner');
          ms.setObjective("Deliver the package to Vera's Diner", { x: diner.cx, y: diner.cy });
          floater(game.fx, p.x, p.y - 26, 'PACKAGE SECURED', '#ffd23f');
          sfx.blip();
        }
      } else {
        const diner = lm(game, 'diner');
        if (dist(p.x, p.y, diner.cx, diner.cy) < 160) return 'done';
      }
      return undefined;
    },
  },
  'hot-delivery': {
    id: 'hot-delivery',
    title: 'HOT DELIVERY',
    brief: 'Hot cargo, cold clock. Get it to the Docks before the buyer walks.',
    reward: 600,
    next: 'payback-pier',
    start(game, ms) {
      const d = lm(game, 'docks');
      ms.state.timeLeft = HOT_DELIVERY_SECONDS;
      ms.setObjective('Deliver to the Docks — 1:30 left', { x: d.cx, y: d.cy });
    },
    update(game, ms, dt) {
      ms.state.timeLeft -= dt;
      const t = Math.max(0, ms.state.timeLeft);
      const d = lm(game, 'docks');
      const mm = Math.floor(t / 60), ss = Math.floor(t % 60);
      ms.setObjective('Deliver to the Docks — ' + mm + ':' + String(ss).padStart(2, '0') + ' left', { x: d.cx, y: d.cy });
      if (dist(game.player.x, game.player.y, d.cx, d.cy) < 160) {
        // Sports-car unlock: Vera leaves a ride at the garage.
        const g = lm(game, 'garage');
        const car = createCar(g.cx + 60, g.cy + 150, 0, 'sports', 'parked');
        car.color = '#e8b04b';
        game.cars.push(car);
        ms.sportsUnlocked = true;
        if (game.hud) game.hud.banner('SPORTS CAR UNLOCKED', 'Vera left you a ride at the garage', '#7dd87d');
        return 'done';
      }
      if (ms.state.timeLeft <= 0) {
        // Retry the mission in place — the story chain stays intact.
        ms.start('hot-delivery');
        if (game.hud) game.hud.banner('TOO SLOW', 'The buyer walked — Vera gives you another shot', '#ff5b5b');
      }
      return undefined;
    },
  },
  'payback-pier': {
    id: 'payback-pier',
    title: 'PAYBACK AT THE PIER',
    brief: "The Harbor Kings jumped Vera's crew. Settle it on the pier.",
    reward: 800,
    next: 'solmar-score',
    start(game, ms) {
      // Clear any leftover Kings (e.g. after a mission restart).
      game.enemies = game.enemies.filter((e) => e.type !== 'king');
      const pier = game.city.pier;
      // Wave 1: two Kings on the near half of the deck. Wave 2 arrives
      // when both fall — four guns at once would shred the player.
      spawnEnemy(game, pier.cx - 24, pier.cy - 120, 'king');
      spawnEnemy(game, pier.cx + 24, pier.cy - 60, 'king');
      ms.state.down = 0;
      ms.state.wave = 1;
      ms.setObjective('Eliminate the Harbor Kings (4 left)', { x: pier.cx, y: pier.cy });
    },
    update(game, ms) {
      if (ms.state.down >= 4) return 'done';
      return undefined;
    },
    onEnemyDown(game, ms) {
      ms.state.down = (ms.state.down || 0) + 1;
      const left = Math.max(0, 4 - ms.state.down);
      const pier = game.city.pier;
      if (ms.state.down === 2 && ms.state.wave === 1) {
        // Wave 2: reinforcements on the far end of the deck.
        ms.state.wave = 2;
        spawnEnemy(game, pier.cx - 24, pier.cy, 'king');
        spawnEnemy(game, pier.cx + 24, pier.cy + 40, 'king');
        if (game.hud) game.hud.banner('REINFORCEMENTS', 'More Kings on the pier!', '#ff5b5b');
      }
      ms.setObjective('Eliminate the Harbor Kings (' + left + ' left)', { x: pier.cx, y: pier.cy });
    },
  },
  'solmar-score': {
    id: 'solmar-score',
    title: 'THE SOLMAR SCORE',
    brief: 'One last job: crack the Solmar National Bank vault, then vanish.',
    reward: 1500,
    next: null,
    start(game, ms) {
      const b = lm(game, 'bank');
      ms.setObjective('Get to Solmar National Bank', { x: b.cx, y: b.cy });
      ms.state.stage = 0;
      ms.state.progress = 0;
    },
    update(game, ms, dt) {
      const p = game.player;
      const b = lm(game, 'bank');
      const near = dist(p.x, p.y, b.cx, b.cy) < 170;
      if (ms.state.stage === 0) {
        if (near) {
          ms.state.stage = 1;
          ms.setObjective('Cracking the vault — 0% (stay close)', { x: b.cx, y: b.cy });
          if (game.hud) game.hud.banner('THE VAULT', 'Stay by the bank while the drill works', '#ffd23f');
        }
        return undefined;
      }
      if (ms.state.stage === 1) {
        if (near) ms.state.progress += dt;
        const pct = Math.min(100, Math.floor((ms.state.progress / SCORE_CHANNEL_SECONDS) * 100));
        ms.setObjective('Cracking the vault — ' + pct + '% (stay close)', { x: b.cx, y: b.cy });
        if (ms.state.progress >= SCORE_CHANNEL_SECONDS) {
          ms.state.stage = 2;
          game.police.addWanted(2, 'bank alarm');
          ms.setObjective('Lose the heat — stay unseen until it dies', null);
          if (game.hud) game.hud.banner('THE ALARM IS UP', 'Lose the cops!', '#ff5b5b');
        }
        return undefined;
      }
      // Stage 2: escape — the score pays only once the heat is gone.
      if (game.wanted <= 0) return 'done';
      ms.setObjective('Lose the heat — ' + game.wanted + ' star' + (game.wanted === 1 ? '' : 's') + ' (stay unseen)', null);
      return undefined;
    },
  },
  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Explore, earn, stay out of trouble — or don\'t.',
    reward: 0,
    next: null,
    start(game, ms) {
      if (ms.pierPaid) ms.setObjective('Free Roam — the city is yours', null);
      else ms.setObjective('Visit Solmar Pier', { x: game.city.pier.cx, y: game.city.pier.cy });
    },
    update(game, ms) {
      if (!ms.pierPaid && dist(game.player.x, game.player.y, game.city.pier.cx, game.city.pier.cy) < 150) {
        ms.pierPaid = true;
        game.player.cash += 50;
        floater(game.fx, game.player.x, game.player.y - 26, '+$50  PIER VISIT', '#7dd87d');
        sfx.cash();
        ms.setObjective('Free Roam — the city is yours', null);
      }
      return undefined; // free roam never completes
    },
  },
};

export function registerMission(def) {
  MISSION_DEFS[def.id] = def;
}

export function createMissions(game) {
  const ms = {
    game,
    current: null,       // { def, state }
    state: {},           // the current mission's own state (def.start/update use ms.state)
    completed: [],
    stashes: stashSpots(),
    sportsUnlocked: false,
    pierPaid: false, // free-roam pier bonus: pay-once, persisted in the save
    objective: { text: '', marker: null },
    setObjective(text, marker) {
      this.objective.text = text || '';
      this.objective.marker = marker || null;
    },
    list() { return Object.keys(MISSION_DEFS); },
    isComplete(id) { return this.completed.includes(id); },
    start(id) {
      const def = MISSION_DEFS[id];
      if (!def) return false;
      this.current = { def, state: {} };
      this.state = this.current.state;
      if (game.hud) game.hud.banner(def.title, def.brief, '#ffd23f');
      if (def.start) def.start(game, this);
      return true;
    },
    completeCurrent() {
      const cur = this.current;
      if (!cur) return;
      // Clear state FIRST so no effect or chained start can re-trigger this.
      this.current = null;
      this.state = {};
      this.completed.push(cur.def.id);
      if (cur.def.reward > 0) {
        game.player.cash += cur.def.reward;
        floater(game.fx, game.player.x, game.player.y - 26, '+$' + cur.def.reward, '#7dd87d');
        sfx.cash();
      }
      if (game.hud) game.hud.banner('MISSION COMPLETE', cur.def.title, '#7dd87d');
      if (game.save) game.save();
      if (cur.def.next) this.start(cur.def.next);
      else if (cur.def.id !== 'free-roam') this.start('free-roam');
    },
    failCurrent(reason) {
      const cur = this.current;
      if (!cur) return;
      this.current = null;
      this.state = {};
      if (game.hud) game.hud.banner('MISSION FAILED', reason || cur.def.title, '#ff5b5b');
      this.start('free-roam');
    },
    restartCurrent() {
      const id = this.current ? this.current.def.id : 'free-roam';
      this.current = null;
      this.start(id);
    },
    onEnemyDown(enemy) {
      if (this.current && this.current.def.onEnemyDown) {
        this.current.def.onEnemyDown(game, this, enemy);
      }
    },
    update(dt) {
      if (!this.current) { this.start('free-roam'); return; }
      this.checkStashes();
      const def = this.current.def;
      if (!def.update) return;
      let result;
      try { result = def.update(game, this, dt); } catch (e) { console.error('mission update failed', e); return; }
      if (result === 'done') this.completeCurrent();
      else if (result === 'failed') this.failCurrent();
    },
    // Hidden cash stashes: live in every mission and in free roam, each
    // payable exactly once (taken flag flips before the cash is added).
    checkStashes() {
      const p = game.player;
      if (!p) return;
      for (const s of this.stashes) {
        if (s.taken) continue;
        if (dist(p.x, p.y, s.x, s.y) < 70) {
          s.taken = true;
          p.cash += STASH_REWARD;
          floater(game.fx, p.x, p.y - 26, '+$' + STASH_REWARD + '  HIDDEN STASH', '#7dd87d');
          sfx.cash();
          if (game.hud) game.hud.banner('HIDDEN STASH', '+$' + STASH_REWARD + ' found', '#7dd87d');
          if (game.save) game.save();
        }
      }
    },
    serialize() {
      return {
        current: this.current ? this.current.def.id : null,
        completed: [...this.completed],
        stashes: this.stashes.map((s) => s.taken),
        sportsUnlocked: !!this.sportsUnlocked,
        pierPaid: !!this.pierPaid,
      };
    },
    restore(data) {
      if (!data) return;
      this.completed = Array.isArray(data.completed) ? [...data.completed] : [];
      if (Array.isArray(data.stashes)) {
        data.stashes.forEach((t, i) => { if (this.stashes[i]) this.stashes[i].taken = !!t; });
      }
      this.sportsUnlocked = !!data.sportsUnlocked;
      this.pierPaid = !!data.pierPaid;
      if (this.sportsUnlocked) {
        // The unlock car is parked world state; respawn it on CONTINUE.
        const g = lm(game, 'garage');
        const has = game.cars.some((c) => c.model === 'sports' && c.role === 'parked' && dist(c.x, c.y, g.cx, g.cy) < 300);
        if (!has) {
          const car = createCar(g.cx + 60, g.cy + 150, 0, 'sports', 'parked');
          car.color = '#e8b04b';
          game.cars.push(car);
        }
      }
      const id = data.current && MISSION_DEFS[data.current] ? data.current : 'free-roam';
      this.start(id);
    },
  };
  return ms;
}
