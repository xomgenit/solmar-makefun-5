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

export const MISSION_DEFS = {
  'free-roam': {
    id: 'free-roam',
    title: 'FREE ROAM',
    brief: 'Solmar Bay is yours. Explore, earn, stay out of trouble — or don\'t.',
    reward: 0,
    next: null,
    start(game, ms) {
      ms.setObjective('Visit Solmar Pier', { x: game.city.pier.cx, y: game.city.pier.cy });
      ms.state.pierPaid = false;
    },
    update(game, ms) {
      if (!ms.state.pierPaid && dist(game.player.x, game.player.y, game.city.pier.cx, game.city.pier.cy) < 150) {
        ms.state.pierPaid = true;
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
      const def = this.current.def;
      if (!def.update) return;
      let result;
      try { result = def.update(game, this, dt); } catch (e) { console.error('mission update failed', e); return; }
      if (result === 'done') this.completeCurrent();
      else if (result === 'failed') this.failCurrent();
    },
    serialize() {
      return { current: this.current ? this.current.def.id : null, completed: [...this.completed] };
    },
    restore(data) {
      if (!data) return;
      this.completed = Array.isArray(data.completed) ? [...data.completed] : [];
      const id = data.current && MISSION_DEFS[data.current] ? data.current : 'free-roam';
      this.start(id);
    },
  };
  return ms;
}
