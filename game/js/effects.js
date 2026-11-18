// SOLMAR — Streets of the Sun. Transient visual effects: particles, tracers,
// floating text, skid marks, muzzle flashes and screen shake.
export function createEffects() {
  return {
    particles: [],   // {x,y,vx,vy,life,maxLife,color,size}
    tracers: [],     // {x1,y1,x2,y2,life}
    floaters: [],    // {x,y,text,life,color}
    skids: [],       // {x,y,angle,life}
    flashes: [],     // {x,y,angle,life}
    shake: 0,
  };
}

export function burst(fx, x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = speed * (0.3 + Math.random() * 0.7);
    fx.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.4 + Math.random() * 0.5, maxLife: 0.9, color,
      size: 2 + Math.random() * 3,
    });
  }
  if (fx.particles.length > 400) fx.particles.splice(0, fx.particles.length - 400);
}

export function sparks(fx, x, y) { burst(fx, x, y, '#ffd23f', 10, 220); burst(fx, x, y, '#ff7a1a', 6, 160); }
export function smoke(fx, x, y) { burst(fx, x, y, '#5a5a5a', 4, 60); }
export function blood(fx, x, y) { burst(fx, x, y, '#c0392b', 8, 140); }

export function tracer(fx, x1, y1, x2, y2) {
  fx.tracers.push({ x1, y1, x2, y2, life: 0.09 });
}

export function floater(fx, x, y, text, color) {
  fx.floaters.push({ x, y, text, life: 1.4, color: color || '#ffffff' });
}

export function skid(fx, x, y, angle) {
  fx.skids.push({ x, y, angle, life: 5 });
  if (fx.skids.length > 300) fx.skids.splice(0, fx.skids.length - 300);
}

export function muzzle(fx, x, y, angle) {
  fx.flashes.push({ x, y, angle, life: 0.06 });
}

export function addShake(fx, amount) { fx.shake = Math.min(14, fx.shake + amount); }

export function updateEffects(fx, dt) {
  for (const p of fx.particles) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.92; p.vy *= 0.92;
  }
  fx.particles = fx.particles.filter((p) => p.life > 0);
  for (const t of fx.tracers) t.life -= dt;
  fx.tracers = fx.tracers.filter((t) => t.life > 0);
  for (const f of fx.floaters) { f.life -= dt; f.y -= 34 * dt; }
  fx.floaters = fx.floaters.filter((f) => f.life > 0);
  for (const s of fx.skids) s.life -= dt;
  fx.skids = fx.skids.filter((s) => s.life > 0);
  for (const m of fx.flashes) m.life -= dt;
  fx.flashes = fx.flashes.filter((m) => m.life > 0);
  fx.shake = Math.max(0, fx.shake - dt * 26);
}

export function drawEffects(fx, ctx) {
  ctx.save();
  for (const s of fx.skids) {
    ctx.save();
    ctx.translate(s.x, s.y); ctx.rotate(s.angle);
    ctx.globalAlpha = Math.min(0.5, s.life * 0.2);
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(-7, -2, 14, 4);
    ctx.restore();
  }
  ctx.restore();
  for (const t of fx.tracers) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, t.life / 0.09);
    ctx.strokeStyle = '#ffe66d'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(t.x1, t.y1); ctx.lineTo(t.x2, t.y2); ctx.stroke();
    ctx.restore();
  }
  for (const p of fx.particles) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  for (const m of fx.flashes) {
    ctx.save();
    ctx.translate(m.x, m.y); ctx.rotate(m.angle);
    ctx.fillStyle = '#fff3a0';
    ctx.beginPath();
    ctx.moveTo(0, -6); ctx.lineTo(16, 0); ctx.lineTo(0, 6); ctx.lineTo(5, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  ctx.save();
  ctx.font = 'bold 15px "Arial Narrow", Arial, sans-serif';
  ctx.textAlign = 'center';
  for (const f of fx.floaters) {
    ctx.globalAlpha = Math.min(1, f.life);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.restore();
}
