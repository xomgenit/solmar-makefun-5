// SOLMAR — Streets of the Sun. HUD: DOM panels (health, cash, wanted stars,
// objective, speedometer, zone) + a round minimap canvas + banners and hints.
import { formatCash, clamp } from './util.js';
import { WORLD, SEA_Y, SAND_Y, zoneAt } from './city.js';

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    hud: $('hud'),
    healthFill: $('health-fill'), healthText: $('health-text'),
    cash: $('cash'), stars: $('stars'), zone: $('zone'),
    speed: $('speed'), speedWrap: $('speedometer'), carHealth: $('car-health'),
    objTitle: $('objective-title'), objText: $('objective-text'),
    hint: $('hint'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
    minimap: $('minimap'),
  };
  const mm = els.minimap ? els.minimap.getContext('2d') : null;
  let bannerTimer = null;
  let lastZone = '';
  let zoneTimer = 0;

  function starText(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    return s;
  }

  return {
    showHud(on) { if (els.hud) els.hud.style.display = on ? 'block' : 'none'; },
    banner(title, sub, color) {
      if (!els.banner) return;
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub || '';
      els.bannerTitle.style.color = color || '#ffd23f';
      els.banner.classList.add('show');
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => els.banner.classList.remove('show'), 2600);
    },
    setHint(text) {
      if (!els.hint) return;
      if (els.hint.textContent !== text) els.hint.textContent = text || '';
    },
    update(game, dt) {
      const p = game.player;
      if (els.healthFill) els.healthFill.style.width = clamp(p.hp, 0, 100) + '%';
      if (els.healthText) els.healthText.textContent = Math.ceil(p.hp);
      if (els.cash) els.cash.textContent = formatCash(p.cash);
      if (els.stars) {
        els.stars.textContent = starText(game.wanted);
        els.stars.classList.toggle('hot', game.wanted > 0);
      }
      const z = zoneAt(p.x, p.y);
      if (z !== lastZone) {
        lastZone = z;
        zoneTimer = 3;
        if (els.zone) { els.zone.textContent = z; els.zone.classList.add('show'); }
      }
      if (zoneTimer > 0) {
        zoneTimer -= dt;
        if (zoneTimer <= 0 && els.zone) els.zone.classList.remove('show');
      }
      if (els.speedWrap) els.speedWrap.style.display = p.inCar ? 'block' : 'none';
      if (p.inCar && p.car) {
        if (els.speed) els.speed.textContent = Math.round(p.car.speed * 0.45);
        if (els.carHealth) els.carHealth.textContent = 'CAR ' + Math.ceil(p.car.health) + '%';
      }
      if (game.missions) {
        const obj = game.missions.objective;
        if (els.objTitle) els.objTitle.textContent = game.missions.current ? game.missions.current.def.title : 'FREE ROAM';
        if (els.objText) els.objText.textContent = obj.text || '';
      }
      this.drawMinimap(game);
    },
    drawMinimap(game) {
      if (!mm) return;
      const S = els.minimap.width;
      const scale = S / WORLD;
      const px = (v) => v * scale;
      mm.clearRect(0, 0, S, S);
      // Sea + sand + ground
      mm.fillStyle = '#1f7fa8';
      mm.fillRect(0, 0, S, S);
      mm.fillStyle = '#e8d49a';
      mm.fillRect(0, px(SAND_Y), S, px(SEA_Y - SAND_Y));
      mm.fillStyle = '#7fae62';
      mm.fillRect(0, 0, S, px(SAND_Y));
      // Roads
      mm.strokeStyle = '#3f3f46';
      mm.lineWidth = Math.max(1, 96 * scale);
      for (const rx of game.city.vRoads) {
        mm.beginPath(); mm.moveTo(px(rx), 0); mm.lineTo(px(rx), px(3270)); mm.stroke();
      }
      for (const ry of game.city.hRoads) {
        mm.beginPath(); mm.moveTo(0, px(ry)); mm.lineTo(S, px(ry)); mm.stroke();
      }
      // Landmarks
      for (const id of Object.keys(game.city.landmarkById)) {
        const lm = game.city.landmarkById[id];
        mm.fillStyle = '#ffd23f';
        mm.fillRect(px(lm.cx) - 2, px(lm.cy) - 2, 4, 4);
      }
      // Mission marker
      const marker = game.missions && game.missions.objective.marker;
      if (marker) {
        const pulse = 3 + Math.sin(game.time * 4) * 1.5;
        mm.fillStyle = '#ffe600';
        mm.beginPath();
        mm.moveTo(px(marker.x), px(marker.y) - pulse - 3);
        mm.lineTo(px(marker.x) + pulse, px(marker.y));
        mm.lineTo(px(marker.x), px(marker.y) + pulse + 3);
        mm.lineTo(px(marker.x) - pulse, px(marker.y));
        mm.closePath(); mm.fill();
      }
      // Cops + cruisers + enemies
      mm.fillStyle = '#4d8dff';
      for (const e of game.enemies) {
        if (e.type !== 'cop') continue;
        mm.beginPath(); mm.arc(px(e.x), px(e.y), 2.5, 0, Math.PI * 2); mm.fill();
      }
      for (const c of game.cars) {
        if (c.role !== 'cruiser') continue;
        mm.fillStyle = '#ff5b5b';
        mm.beginPath(); mm.arc(px(c.x), px(c.y), 3, 0, Math.PI * 2); mm.fill();
      }
      mm.fillStyle = '#ff2d2d';
      for (const e of game.enemies) {
        if (e.type !== 'king') continue;
        mm.beginPath(); mm.arc(px(e.x), px(e.y), 2.5, 0, Math.PI * 2); mm.fill();
      }
      // Player arrow
      const p = game.player;
      mm.save();
      mm.translate(px(p.x), px(p.y));
      mm.rotate(p.angle);
      mm.fillStyle = '#ffffff';
      mm.strokeStyle = '#111';
      mm.lineWidth = 1;
      mm.beginPath();
      mm.moveTo(7, 0); mm.lineTo(-5, -5); mm.lineTo(-5, 5);
      mm.closePath(); mm.fill(); mm.stroke();
      mm.restore();
    },
  };
}
