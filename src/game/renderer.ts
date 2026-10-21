import {
  CAT_SKINS,
  CatSkinInfo,
  EnemyHazard,
  FishPickup,
  PipeColumn,
  SimulationEvents,
  WorldSimulation,
} from './types';
import { DynamicWeatherSystem, WeatherType } from './weather';

interface PooledParticle {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'circle' | 'star' | 'paw';
}

const MAX_PARTICLES = 128;

export class WorldCanvasRenderer {
  private particles: PooledParticle[] = [];
  private ringCursor = 0;
  public weather: DynamicWeatherSystem;
  private spriteCache: Map<string, CanvasImageSource> = new Map();

  constructor(initialWeather?: WeatherType) {
    this.weather = new DynamicWeatherSystem(initialWeather);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 4,
        life: 0,
        maxLife: 0.5,
        color: '#FFF8E7',
        shape: 'circle',
      });
    }

    this.preloadSkinSprites();
  }

  private preloadSkinSprites(): void {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;
    for (const skin of CAT_SKINS) {
      if (!skin.sprites) continue;
      const urls = [skin.sprites.idle, skin.sprites.jump, skin.sprites.gethit];
      for (const url of urls) {
        if (this.spriteCache.has(url)) continue;
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => {
          this.spriteCache.set(url, this.cleanCheckerboardBackground(img));
        };
        img.src = url;
      }
    }
  }

  /**
   * If an uploaded sprite has a baked-in gray/white checkerboard background,
   * flood-fill from the outer border to make the exterior background 100% transparent.
   */
  private cleanCheckerboardBackground(img: HTMLImageElement): CanvasImageSource {
    try {
      const size = 256;
      const offscreen = document.createElement('canvas');
      offscreen.width = size;
      offscreen.height = size;
      const octx = offscreen.getContext('2d');
      if (!octx) return img;

      octx.drawImage(img, 0, 0, size, size);
      const imageData = octx.getImageData(0, 0, size, size);
      const data = imageData.data;

      // If top-left pixel is already transparent, keep native alpha
      if (data[3] < 32) {
        return offscreen;
      }

      const visited = new Uint8Array(size * size);
      const queue = new Int32Array(size * size);
      let head = 0;
      let tail = 0;

      const isNeutralCheckerPixel = (idx: number): boolean => {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const maxC = Math.max(r, g, b);
        const minC = Math.min(r, g, b);
        // Checkerboard squares are neutral light gray/white (low saturation, high brightness)
        return maxC - minC <= 18 && minC >= 180;
      };

      const enqueue = (x: number, y: number) => {
        if (x < 0 || x >= size || y < 0 || y >= size) return;
        const pos = y * size + x;
        if (visited[pos]) return;
        visited[pos] = 1;
        if (isNeutralCheckerPixel(pos * 4)) {
          queue[tail++] = pos;
        }
      };

      for (let i = 0; i < size; i++) {
        enqueue(i, 0);
        enqueue(i, size - 1);
        enqueue(0, i);
        enqueue(size - 1, i);
      }

      while (head < tail) {
        const pos = queue[head++];
        const pIdx = pos * 4;
        data[pIdx + 3] = 0; // make transparent
        const x = pos % size;
        const y = (pos / size) | 0;
        enqueue(x + 1, y);
        enqueue(x - 1, y);
        enqueue(x, y + 1);
        enqueue(x, y - 1);
      }

      octx.putImageData(imageData, 0, 0);
      return offscreen;
    } catch {
      return img;
    }
  }

  public randomizeWeather(forcedWeather?: WeatherType): WeatherType {
    return this.weather.randomizeWeather(forcedWeather);
  }

  public getCurrentWeather(): WeatherType {
    return this.weather.currentWeather;
  }

  public spawnBurst(
    x: number,
    y: number,
    count: number,
    color: string,
    speed = 160,
    shape: 'circle' | 'star' | 'paw' = 'circle'
  ): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles[this.ringCursor];
      this.ringCursor = (this.ringCursor + 1) % MAX_PARTICLES;
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const spd = speed * (0.45 + Math.random() * 0.75);
      p.active = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * spd;
      p.vy = Math.sin(angle) * spd;
      p.size = 3.5 + Math.random() * 4.5;
      p.maxLife = 0.28 + Math.random() * 0.28;
      p.life = p.maxLife;
      p.color = color;
      p.shape = shape;
    }
  }

  public emitFromEvents(sim: WorldSimulation, events: SimulationEvents): void {
    const cat = sim.cat;
    if (events.flapped) {
      this.spawnBurst(cat.x - 14, cat.y + 10, 5, '#FDE68A', 120, 'paw');
    }
    if (events.dashed) {
      this.spawnBurst(cat.x - 10, cat.y, 16, '#38BDF8', 240, 'star');
    }
    if (events.collectedGoldenFish) {
      this.spawnBurst(cat.x + 12, cat.y, 18, '#FACC15', 210, 'star');
    } else if (events.collectedFish) {
      this.spawnBurst(cat.x + 12, cat.y, 9, '#67E8F9', 150, 'circle');
    }
    if (events.enemyDefeated) {
      this.spawnBurst(cat.x + 28, cat.y, 20, '#FB923C', 260, 'star');
    }
    if (events.playerHurt) {
      this.spawnBurst(cat.x, cat.y, 22, '#F43F5E', 280, 'circle');
    }
  }

  public updateAndDraw(
    ctx: CanvasRenderingContext2D,
    sim: WorldSimulation,
    dt: number,
    pointerOffset: { x: number; y: number }
  ): void {
    const { worldWidth: w, worldHeight: h, groundY } = sim;
    ctx.save();

    // Decaying trauma * trauma camera shake
    const shakeMag = sim.cameraTrauma * sim.cameraTrauma * 14;
    if (shakeMag > 0.2) {
      const sx = (Math.random() * 2 - 1) * shakeMag;
      const sy = (Math.random() * 2 - 1) * shakeMag;
      ctx.translate(sx, sy);
    }

    // 1. Sky gradient (Warm Twilight Rooftop Palette)
    const skyGrad = ctx.createLinearGradient(0, 0, 0, groundY);
    skyGrad.addColorStop(0, '#161128');
    skyGrad.addColorStop(0.46, '#2E1F47');
    skyGrad.addColorStop(0.78, '#6B2D5C');
    skyGrad.addColorStop(1, '#D96B43');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, w, h);

    // 2. Crescent Moon in top negative space
    const moonX = w * 0.78 + pointerOffset.x * -12;
    const moonY = Math.min(130, h * 0.18) + pointerOffset.y * -8;
    ctx.save();
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.arc(moonX, moonY, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#211738';
    ctx.beginPath();
    ctx.arc(moonX - 11, moonY - 6, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2b. Dynamic Background Weather (Falling Cherry Blossoms, Twinkling Stars, or Firefly Breeze)
    const weatherDt = sim.state === 'paused' ? 0 : dt;
    const weatherScroll = sim.state === 'playing' ? sim.scrollSpeed : sim.scrollSpeed * 0.45;
    this.weather.update(weatherDt, w, groundY, weatherScroll);
    this.weather.draw(ctx, w, groundY, sim.distancePx);

    // 3. Far Parallax City Silhouette
    this.drawCityLayer(ctx, w, groundY, sim.distancePx * 0.14, '#241838', 135, 95);
    // 4. Mid Parallax Indonesian Rooftops & Warm Windows
    this.drawRooftopLayer(ctx, w, groundY, sim.distancePx * 0.32, '#382246', 85);

    // 5. Draw Chimneys / Bamboo Pipes
    for (let i = 0; i < sim.pipes.length; i++) {
      this.drawPipe(ctx, sim.pipes[i], groundY);
    }

    // 6. Draw Collectible Fish Pickups
    for (let i = 0; i < sim.fishes.length; i++) {
      this.drawFish(ctx, sim.fishes[i]);
    }

    // 7. Draw Enemy Hazards & Windup Telegraphs
    for (let i = 0; i < sim.enemies.length; i++) {
      this.drawEnemy(ctx, sim.enemies[i], sim.cat.x);
    }

    // 8. Update & Draw Pooled Particles
    if (sim.cat.dashTimer > 0) {
      this.spawnBurst(sim.cat.x - 18, sim.cat.y, 1, '#38BDF8', 70, 'star');
    }
    this.updateAndDrawParticles(ctx, dt, sim.scrollSpeed);

    // 9. Draw Protagonist Cat / 4th Special Model
    const skinInfo = CAT_SKINS.find((s) => s.id === sim.skin) || CAT_SKINS[0];
    this.drawCat(ctx, sim, skinInfo, pointerOffset);

    // 10. Foreground Terracotta Roof Tiles (Ground Strip)
    this.drawForegroundGround(ctx, w, h, groundY, sim.distancePx);

    // 11. Low-HP Peripheral Vignette (Gaze routing when HP == 1)
    if (sim.state === 'playing' && sim.cat.hp === 1) {
      const pulse = 0.22 + 0.12 * Math.sin(sim.distancePx * 0.04);
      const vig = ctx.createRadialGradient(w * 0.5, h * 0.5, w * 0.3, w * 0.5, h * 0.5, w * 0.75);
      vig.addColorStop(0, 'rgba(244, 63, 94, 0)');
      vig.addColorStop(1, `rgba(225, 29, 72, ${pulse.toFixed(2)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    ctx.restore();
  }

  private drawCityLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    groundY: number,
    scrollX: number,
    color: string,
    maxHeight: number,
    stepWidth: number
  ): void {
    ctx.fillStyle = color;
    const count = Math.ceil(w / stepWidth) + 2;
    const offset = scrollX % stepWidth;
    const startIdx = Math.floor(scrollX / stepWidth);

    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const bh = 45 + ((idx * 67) % maxHeight);
      const bx = i * stepWidth - offset;
      const by = groundY - bh;
      ctx.fillRect(bx, by, stepWidth + 1, bh);
    }
  }

  private drawRooftopLayer(
    ctx: CanvasRenderingContext2D,
    w: number,
    groundY: number,
    scrollX: number,
    color: string,
    maxHeight: number
  ): void {
    const stepWidth = 128;
    const count = Math.ceil(w / stepWidth) + 2;
    const offset = scrollX % stepWidth;
    const startIdx = Math.floor(scrollX / stepWidth);

    for (let i = 0; i < count; i++) {
      const idx = startIdx + i;
      const bh = 38 + ((idx * 43) % maxHeight);
      const bx = i * stepWidth - offset;
      const by = groundY - bh;

      // Pitched house silhouette
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + 18);
      ctx.lineTo(bx + stepWidth * 0.5, by);
      ctx.lineTo(bx + stepWidth + 6, by + 18);
      ctx.lineTo(bx + stepWidth, groundY);
      ctx.lineTo(bx, groundY);
      ctx.closePath();
      ctx.fill();

      // Lit cozy window
      if (idx % 2 === 0) {
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(bx + stepWidth * 0.42, by + 26, 16, 18);
      }
    }
  }

  private drawPipe(ctx: CanvasRenderingContext2D, pipe: PipeColumn, groundY: number): void {
    const topHeight = Math.max(0, pipe.gapY - pipe.gapHeight * 0.5);
    const bottomY = pipe.gapY + pipe.gapHeight * 0.5;
    const bottomHeight = Math.max(0, groundY - bottomY);

    const isBamboo = pipe.style === 'bamboo';
    const bodyColor = isBamboo ? '#15803D' : '#9A3412';
    const highlightColor = isBamboo ? '#4ADE80' : '#EA580C';
    const shadowColor = isBamboo ? '#14532D' : '#431407';
    const borderColor = '#181425';

    const drawSegment = (x: number, y: number, width: number, height: number, isTop: boolean) => {
      if (height <= 0) return;
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3.5;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);

      // Left highlight & right shadow
      ctx.fillStyle = highlightColor;
      ctx.fillRect(x + 6, y + 2, 10, Math.max(0, height - 4));
      ctx.fillStyle = shadowColor;
      ctx.fillRect(x + width - 14, y + 2, 10, Math.max(0, height - 4));

      // Cap lip
      const capHeight = 24;
      const capY = isTop ? y + height - capHeight : y;
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - 5, capY, width + 10, capHeight);
      ctx.strokeRect(x - 5, capY, width + 10, capHeight);

      // Decorative cat-ear stone silhouette on chimney cap
      ctx.fillStyle = highlightColor;
      ctx.fillRect(x + 2, capY + 4, width - 4, 5);
    };

    drawSegment(pipe.x, 0, pipe.width, topHeight, true);
    drawSegment(pipe.x, bottomY, pipe.width, bottomHeight, false);
  }

  private drawFish(ctx: CanvasRenderingContext2D, fish: FishPickup): void {
    if (fish.collected) return;
    ctx.save();
    ctx.translate(fish.x, fish.y);

    // Glow halo
    ctx.fillStyle = fish.isGolden ? 'rgba(250, 204, 21, 0.25)' : 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, fish.radius + 7, 0, Math.PI * 2);
    ctx.fill();

    // Tail fin
    ctx.fillStyle = fish.isGolden ? '#F59E0B' : '#0284C7';
    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(18, -9);
    ctx.lineTo(16, 0);
    ctx.lineTo(18, 9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Fish body
    ctx.fillStyle = fish.isGolden ? '#FDE047' : '#38BDF8';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 12, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#181425';
    ctx.beginPath();
    ctx.arc(-7, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyHazard, catX: number): void {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    // Draw visible Windup Telegraph (0.48s - 0.65s warning before attack)
    if (enemy.active && enemy.telegraphTimer > 0) {
      const progress = 1 - enemy.telegraphTimer / enemy.telegraphMax;
      ctx.save();
      // Aim sight line toward left playfield
      ctx.strokeStyle = `rgba(244, 63, 94, ${(0.35 + progress * 0.55).toFixed(2)})`;
      ctx.lineWidth = 2 + progress * 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(-enemy.radius, 0);
      ctx.lineTo(-(enemy.x - catX + 120), 0);
      ctx.stroke();

      // Contracting warning ring around hazard
      const ringRadius = enemy.radius + 6 + (1 - progress) * 24;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Exclamation mark badge above enemy
      ctx.fillStyle = '#F43F5E';
      ctx.font = '800 16px "Fredoka", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('!', 0, -enemy.radius - 10);
      ctx.restore();
    }

    if (!enemy.active) {
      ctx.rotate(enemy.phase);
    }

    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 3;

    if (enemy.archetype === 'crow_charger') {
      // Silhouette 1: Sharp Purple-Black Crow Bandit
      const wingY = Math.sin(enemy.phase * 3.2) * 9;
      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FB7185' : '#312E81';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Sharp yellow beak pointing left
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.moveTo(-15, -4);
      ctx.lineTo(-29, 1);
      ctx.lineTo(-15, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Flapping wing
      ctx.fillStyle = '#4338CA';
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(6, -15 + wingY);
      ctx.lineTo(12, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Angry red eye
      ctx.fillStyle = '#F43F5E';
      ctx.beginPath();
      ctx.arc(-9, -3, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.archetype === 'balloon_weaver') {
      // Silhouette 2: Spiky Pufferfish Lantern Balloon
      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FDE047' : '#EC4899';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Spikes around perimeter
      for (let a = 0; a < 8; a++) {
        const ang = (a * Math.PI) / 4 + enemy.phase * 0.3;
        const sx = Math.cos(ang) * (enemy.radius + 6);
        const sy = Math.sin(ang) * (enemy.radius + 6);
        ctx.beginPath();
        ctx.arc(sx, sy, 3.2, 0, Math.PI * 2);
        ctx.fillStyle = '#FEF08A';
        ctx.fill();
        ctx.stroke();
      }

      // Eyes
      ctx.fillStyle = '#181425';
      ctx.beginPath();
      ctx.arc(-7, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Silhouette 3: Mechanical Red-Dot Laser Drone
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(-17, -12, 34, 24, 8);
      ctx.fill();
      ctx.stroke();

      // Rotor blades on top
      const rotorW = 14 * Math.cos(enemy.phase * 5);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-rotorW, -16);
      ctx.lineTo(rotorW, -16);
      ctx.stroke();

      // Glowing red laser eye
      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FEF08A' : '#EF4444';
      ctx.beginPath();
      ctx.arc(-10, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawCat(
    ctx: CanvasRenderingContext2D,
    sim: WorldSimulation,
    skin: CatSkinInfo,
    pointerOffset: { x: number; y: number }
  ): void {
    const cat = sim.cat;
    const isTitle = sim.state === 'title';
    const isMobile = sim.worldWidth < 768;

    // On Title Screen, position the cat in unobstructed negative space so mobile/desktop cards never overlap it
    const drawX = isTitle
      ? isMobile
        ? sim.worldWidth * 0.28
        : sim.worldWidth * 0.27
      : cat.x;
    const drawY = isTitle
      ? isMobile
        ? sim.worldHeight * 0.14 + Math.sin(sim.distancePx * 0.02) * 10
        : sim.groundY * 0.46 + Math.sin(sim.distancePx * 0.02) * 16
      : cat.y;
    const baseScale = isTitle ? (isMobile ? 1.38 : 1.85) : 1.16;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(cat.rotation);
    ctx.scale(cat.scaleX * baseScale, cat.scaleY * baseScale);

    // Warm spotlight halo on Title Screen
    if (isTitle) {
      const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, 46);
      halo.addColorStop(0, 'rgba(253, 224, 71, 0.28)');
      halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, 46, 0, Math.PI * 2);
      ctx.fill();
    }

    // Invulnerability blink
    if (cat.invulnTimer > 0 && Math.floor(cat.invulnTimer * 16) % 2 === 0 && cat.dashTimer <= 0) {
      ctx.globalAlpha = 0.65;
    }

    const isFlashed = cat.hitFlashTimer > 0;
    const bodyFill = isFlashed ? '#FFFFFF' : skin.primaryColor;
    const bellyFill = isFlashed ? '#FFFFFF' : skin.secondaryColor;

    // Purr Dash aura
    if (cat.dashTimer > 0) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.beginPath();
      ctx.ellipse(-4, 0, 34, 24, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Check if this model uses custom face sprites (4th model: Bang Pirang — render ONLY the face without tail/feet/cat accessories)
    if (skin.sprites) {
      const isHurtExpr =
        cat.hitFlashTimer > 0 ||
        cat.invulnTimer > 0.35 ||
        sim.koSequenceTimer > 0 ||
        sim.state === 'gameover';
      const isJumpExpr =
        !isHurtExpr &&
        (cat.earFlapTimer > 0 || cat.dashTimer > 0 || cat.vy < -85);

      const targetUrl = isHurtExpr
        ? skin.sprites.gethit
        : isJumpExpr
        ? skin.sprites.jump
        : skin.sprites.idle;

      const spriteSource = this.spriteCache.get(targetUrl);

      if (spriteSource) {
        ctx.drawImage(spriteSource, -28, -28, 56, 56);
      } else {
        ctx.fillStyle = bodyFill;
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      return;
    }

    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 3.2;
    ctx.lineJoin = 'round';

    // 1. Animated wagging cat tail (for procedural cat models 1-3)
    const tailWag = Math.sin(cat.tailPhase) * 9;
    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-16, 4);
    ctx.quadraticCurveTo(-30, -6 + tailWag, -34, -14 + tailWag);
    ctx.stroke();
    ctx.strokeStyle = bodyFill;
    ctx.lineWidth = 4.2;
    ctx.stroke();

    // 2. Fluttering Superhero Scarf / Cape (for procedural cat models 1-3)
    ctx.fillStyle = isFlashed ? '#FFFFFF' : skin.capeColor;
    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    ctx.lineTo(-28, -15 - tailWag * 0.4);
    ctx.lineTo(-24, -3 - tailWag * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // 3. Plump Rounded Cat Body (for procedural cat models 1-3)
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.ellipse(0, 2, 21, 17, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Belly patch
    ctx.fillStyle = bellyFill;
    ctx.beginPath();
    ctx.ellipse(4, 6, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Golden Bell Collar
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(13, 9, 4.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 3.2;

    // Tabby / Calico forehead & back stripes
    if (!isFlashed) {
      ctx.fillStyle = skin.stripeColor;
      ctx.beginPath();
      ctx.ellipse(-6, -11, 3, 5, -0.2, 0, Math.PI * 2);
      ctx.ellipse(-12, -9, 2.5, 4.5, -0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 4. Pointed Cat Ears (Left & Right)
    const earDrop = cat.earFlapTimer > 0 ? 3 : 0;
    // Back ear
    ctx.fillStyle = bodyFill;
    ctx.beginPath();
    ctx.moveTo(-6, -11);
    ctx.lineTo(-13, -27 + earDrop);
    ctx.lineTo(2, -14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Front ear
    ctx.beginPath();
    ctx.moveTo(4, -12);
    ctx.lineTo(12, -28 + earDrop);
    ctx.lineTo(16, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pink inner ear triangle
    ctx.fillStyle = isFlashed ? '#FFFFFF' : skin.earInnerColor;
    ctx.beginPath();
    ctx.moveTo(6, -12);
    ctx.lineTo(11, -22 + earDrop);
    ctx.lineTo(13.5, -11);
    ctx.closePath();
    ctx.fill();

    // 5. Expressive Cat Eyes (tracks cursor slightly on title screen)
    const gazeX = isTitle ? pointerOffset.x * 2.2 : 1.5;
    const gazeY = isTitle ? pointerOffset.y * 2.2 : 0;

    ctx.fillStyle = '#181425';
    ctx.beginPath();
    ctx.arc(10 + gazeX, -3 + gazeY, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Eye catchlight
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(11.2 + gazeX, -4.2 + gazeY, 1.3, 0, Math.PI * 2);
    ctx.fill();

    // Cute pink nose & whiskers
    ctx.fillStyle = '#FB7185';
    ctx.beginPath();
    ctx.arc(17, 1, 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(15, 3);
    ctx.lineTo(25, 1);
    ctx.moveTo(15, 5);
    ctx.lineTo(24, 6);
    ctx.stroke();

    // 6. Flapping Front Paws
    const pawY = cat.earFlapTimer > 0 ? -5 : 7;
    ctx.fillStyle = bellyFill;
    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.ellipse(11, pawY, 6, 4.2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  private drawForegroundGround(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    groundY: number,
    distancePx: number
  ): void {
    const roofHeight = h - groundY;
    ctx.fillStyle = '#7C2D12';
    ctx.fillRect(0, groundY, w, roofHeight);

    // Top trim border
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(0, groundY, w, 12);

    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

    // Scalloped terracotta roof tile pattern scrolling horizontally
    const tileW = 48;
    const offset = distancePx % tileW;
    ctx.strokeStyle = '#431407';
    ctx.lineWidth = 2.5;
    for (let x = -tileW; x < w + tileW; x += tileW) {
      const tx = x - offset;
      ctx.beginPath();
      ctx.arc(tx + tileW * 0.5, groundY + 14, tileW * 0.5, 0, Math.PI);
      ctx.stroke();
    }
  }

  private updateAndDrawParticles(
    ctx: CanvasRenderingContext2D,
    dt: number,
    scrollSpeed: number
  ): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += (p.vx - scrollSpeed * 0.35) * dt;
      p.y += p.vy * dt;
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
