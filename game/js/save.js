// SOLMAR — Streets of the Sun. localStorage save: stores the city seed so
// CONTINUE rebuilds the exact same city, plus player state and mission progress.
export const SAVE_KEY = 'solmar-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; }
}

export function saveGame(game) {
  try {
    const p = game.player;
    const data = {
      v: 1,
      seed: game.city.seed,
      cash: p.cash,
      health: p.hp,
      x: p.x, y: p.y, angle: p.angle,
      inCar: false, // always resume on foot beside the car for safety
      car: p.car ? { model: p.car.model, color: p.car.color, health: p.car.health, x: p.car.x, y: p.car.y, angle: p.car.angle } : null,
      wanted: 0,
      missions: game.missions ? game.missions.serialize() : null,
      stats: game.stats || {},
      playSeconds: game.playSeconds || 0,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('save failed', e);
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1 || typeof data.seed !== 'number') return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
