export class ArinarSpaceEnvironment {
  constructor(worldSize = 1200) {
    this.worldSize = worldSize;
    this.stars = [];
    this.particles = [];
    this.initCosmos();
  }

  initCosmos() {
    // 180 процедурных звёзд разной яркости
    for (let i = 0; i < 180; i++) {
      this.stars.push({
        x: Math.random() * this.worldSize,
        y: Math.random() * this.worldSize,
        size: Math.random() * 1.8 + 0.6,
        baseAlpha: Math.random() * 0.6 + 0.3,
        pulseSpeed: Math.random() * 2 + 1,
        color: ['#ffffff', '#a5f3fc', '#e0e7ff', '#fbcfe8'][Math.floor(Math.random() * 4)]
      });
    }

    // 40 медленно парящих космических частиц
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        x: Math.random() * this.worldSize,
        y: Math.random() * this.worldSize,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 2.5 + 1.2,
        color: ['#818cf8', '#38bdf8', '#c084fc', '#f472b6'][Math.floor(Math.random() * 4)],
        pulse: Math.random() * Math.PI
      });
    }
  }

  update(dt) {
    this.particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.pulse += dt * 1.5;

      if (p.x < 0) p.x = this.worldSize;
      if (p.x > this.worldSize) p.x = 0;
      if (p.y < 0) p.y = this.worldSize;
      if (p.y > this.worldSize) p.y = 0;
    });
  }

  renderBackground(ctx, now) {
    // Глубокий космический градиент
    const grad = ctx.createRadialGradient(
      this.worldSize / 2, this.worldSize / 2, 80,
      this.worldSize / 2, this.worldSize / 2, this.worldSize * 0.75
    );
    grad.addColorStop(0, '#090518');
    grad.addColorStop(0.5, '#04020a');
    grad.addColorStop(1, '#020105');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.worldSize, this.worldSize);

    // Отрисовка звёзд
    this.stars.forEach((s) => {
      const alpha = s.baseAlpha + Math.sin(now / 1000 * s.pulseSpeed) * 0.25;
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = Math.max(0.1, Math.min(1, alpha));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Отрисовка парящих частиц
    this.particles.forEach((p) => {
      ctx.save();
      const alpha = 0.4 + Math.sin(p.pulse) * 0.3;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0.1, Math.min(0.85, alpha));
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // Космическая рамка мира
    ctx.strokeStyle = 'rgba(129, 140, 248, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, this.worldSize - 8, this.worldSize - 8);
  }

  // Отрисовка персонажа в виде светящегося круга
  drawCircleAvatar(ctx, x, y, color = '#818cf8', dirX = 0, dirY = 1, isSelf = false, now) {
    ctx.save();
    const radius = 15;
    const pulse = Math.sin(now / 200) * 2;

    // Внешнее свечение
    ctx.shadowColor = color;
    ctx.shadowBlur = isSelf ? 16 + pulse : 10;

    // Фоновое тело шара
    ctx.fillStyle = '#0a0815';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // Энергетический обод
    ctx.lineWidth = isSelf ? 3 : 2;
    ctx.strokeStyle = color;
    ctx.stroke();

    // Внутреннее светящееся ядро
    const coreGrad = ctx.createRadialGradient(x, y, 1, x, y, radius);
    coreGrad.addColorStop(0, color);
    coreGrad.addColorStop(0.7, `${color}44`);
    coreGrad.addColorStop(1, 'transparent');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius - 2, 0, Math.PI * 2);
    ctx.fill();

    // Указатель направления взгляда
    const len = Math.hypot(dirX, dirY) || 1;
    const nx = dirX / len;
    const ny = dirY / len;
    const ptX = x + nx * (radius + 4);
    const ptY = y + ny * (radius + 4);

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ptX, ptY, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  // Отрисовка портала Бабочки
  drawButterflyPortal(ctx, portal, now) {
    const { x, y } = portal;
    const pulse = Math.sin(now / 250) * 6;

    ctx.save();
    ctx.translate(x, y);

    // Свечение крыльев
    ctx.shadowColor = portal.color || '#818cf8';
    ctx.shadowBlur = 18 + Math.abs(pulse);

    // Левое крыло
    ctx.strokeStyle = portal.color || '#818cf8';
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(129, 140, 248, 0.2)';

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(-26 - pulse, -30, -32 - pulse, 15, 0, 18);
    ctx.stroke();
    ctx.fill();

    // Правое крыло
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(26 + pulse, -30, 32 + pulse, 15, 0, 18);
    ctx.stroke();
    ctx.fill();

    // Ядро
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}