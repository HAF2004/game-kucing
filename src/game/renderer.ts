import {
  CAT_SKINS,
  CatSkinInfo,
  EnemyHazard,
  FishPickup,
  getCharacterSkin,
  PipeColumn,
  SimulationEvents,
  WorldSimulation,
} from './types';
import { DynamicWeatherSystem, WeatherType } from './weather';
import {
  MAGNET_ATTRACTION_RADIUS_SQ,
  WAPRES_DURATION_SEC,
} from './rules';
import {
  normalizePowerId,
  POWER_ABILITIES,
  PowerAbilityId,
  WAPRES_ASSET_PATH,
} from './achievementDefinitions';

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
  private equippedRewardId: PowerAbilityId = 'none';

  constructor(initialWeather?: WeatherType, initialRewardId: PowerAbilityId = 'none') {
    this.weather = new DynamicWeatherSystem(initialWeather);
    this.equippedRewardId = normalizePowerId(initialRewardId);

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

  private preloadSingleSprite(url: string): void {
    if (this.spriteCache.has(url)) return;
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      this.spriteCache.set(url, img);
      if (typeof createImageBitmap === 'function') {
        createImageBitmap(img)
          .then((bitmap) => {
            this.spriteCache.set(url, bitmap);
          })
          .catch(() => {
            // Keep HTMLImageElement fallback
          });
      }
    };
    img.src = url;
  }

  private preloadSkinSprites(): void {
    if (typeof window === 'undefined' || typeof Image === 'undefined') return;
    for (const skin of CAT_SKINS) {
      if (!skin.sprites) continue;
      const urls = [skin.sprites.idle, skin.sprites.jump, skin.sprites.gethit];
      for (const url of urls) {
        this.preloadSingleSprite(url);
      }
    }
    // Preload the Wapres Ultimate Head Sprite
    this.preloadSingleSprite(WAPRES_ASSET_PATH);
  }

  public randomizeWeather(forcedWeather?: WeatherType): WeatherType {
    return this.weather.randomizeWeather(forcedWeather);
  }

  public getCurrentWeather(): WeatherType {
    return this.weather.currentWeather;
  }

  public setEquippedRewardId(rewardId: PowerAbilityId): void {
    this.equippedRewardId = normalizePowerId(rewardId);
  }

  public getEquippedRewardId(): PowerAbilityId {
    return this.equippedRewardId;
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
    if (events.timeFreezeActivated) {
      this.spawnBurst(cat.x, cat.y, 24, '#818CF8', 260, 'star');
    }
    if (events.wapresActivated) {
      this.spawnBurst(cat.x, cat.y, 32, '#FACC15', 320, 'star');
    }
    if (events.shieldBlocked) {
      this.spawnBurst(cat.x + 12, cat.y, 22, '#10B981', 260, 'star');
    }
    if (events.secondChanceRevived) {
      this.spawnBurst(cat.x, cat.y, 28, '#F59E0B', 300, 'star');
    }
    if (events.obstacleDestroyed) {
      this.spawnBurst(cat.x + 140, cat.y, 20, '#FACC15', 290, 'star');
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

    // 2b. Dynamic Background Weather
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
      if (!sim.pipes[i].destroyed) {
        this.drawPipe(ctx, sim.pipes[i], groundY, sim.powers.time_freeze.isActive);
      }
    }

    // 6. Draw Collectible Fish Pickups + Magnet Tether
    for (let i = 0; i < sim.fishes.length; i++) {
      this.drawFish(ctx, sim.fishes[i], sim);
    }

    // 7. Draw Enemy Hazards & Windup Telegraphs
    for (let i = 0; i < sim.enemies.length; i++) {
      this.drawEnemy(ctx, sim.enemies[i], sim.cat.x);
    }

    // 7b. Draw Active & Passive Power Visual Effects
    this.drawPowerEffects(ctx, sim);

    // 8. Update & Draw Pooled Particles
    if (sim.powers.dash.isActive) {
      this.spawnBurst(sim.cat.x - 18, sim.cat.y, 1, '#38BDF8', 70, 'star');
    } else if (sim.powers.wapres.isActive) {
      this.spawnBurst(sim.cat.x - 18, sim.cat.y, 1, '#FACC15', 85, 'star');
    }
    this.updateAndDrawParticles(ctx, dt, sim.scrollSpeed);

    // 9. Draw Active Protagonist (Barudak Pirang, Barudak Ninja, or Wapres Ultimate Mode)
    this.drawBarudak(ctx, sim, getCharacterSkin(sim.skin));

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

  private drawPowerEffects(ctx: CanvasRenderingContext2D, sim: WorldSimulation): void {
    const cat = sim.cat;

    // Time Freeze (45% World Speed) Frost Overlay & Clockwork Ring
    if (sim.powers.time_freeze.isActive && sim.powers.time_freeze.remainingDuration > 0) {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
      ctx.fillRect(0, 0, sim.worldWidth, sim.groundY);

      ctx.strokeStyle = 'rgba(129, 140, 248, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.arc(cat.x, cat.y, 42, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Magnet Passive Attraction Radius Indicator when unlocked
    if (sim.powers.magnet.unlocked && sim.powers.magnet.isActive && sim.state === 'playing') {
      ctx.save();
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.22)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 8]);
      ctx.beginPath();
      ctx.arc(cat.x, cat.y, 125, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
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

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(bx - 6, by + 18);
      ctx.lineTo(bx + stepWidth * 0.5, by);
      ctx.lineTo(bx + stepWidth + 6, by + 18);
      ctx.lineTo(bx + stepWidth, groundY);
      ctx.lineTo(bx, groundY);
      ctx.closePath();
      ctx.fill();

      if (idx % 2 === 0) {
        ctx.fillStyle = '#FBBF24';
        ctx.fillRect(bx + stepWidth * 0.42, by + 26, 16, 18);
      }
    }
  }

  private drawPipe(
    ctx: CanvasRenderingContext2D,
    pipe: PipeColumn,
    groundY: number,
    isFrozen = false
  ): void {
    const topHeight = Math.max(0, pipe.gapY - pipe.gapHeight * 0.5);
    const bottomY = pipe.gapY + pipe.gapHeight * 0.5;
    const bottomHeight = Math.max(0, groundY - bottomY);

    const isBamboo = pipe.style === 'bamboo';
    const bodyColor = isFrozen ? '#1E3A8A' : isBamboo ? '#15803D' : '#9A3412';
    const highlightColor = isFrozen ? '#60A5FA' : isBamboo ? '#4ADE80' : '#EA580C';
    const shadowColor = isFrozen ? '#172554' : isBamboo ? '#14532D' : '#431407';
    const borderColor = '#181425';

    const drawSegment = (x: number, y: number, width: number, height: number, isTop: boolean) => {
      if (height <= 0) return;
      ctx.fillStyle = bodyColor;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 3.5;
      ctx.fillRect(x, y, width, height);
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = highlightColor;
      ctx.fillRect(x + 6, y + 2, 10, Math.max(0, height - 4));
      ctx.fillStyle = shadowColor;
      ctx.fillRect(x + width - 14, y + 2, 10, Math.max(0, height - 4));

      const capHeight = 24;
      const capY = isTop ? y + height - capHeight : y;
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x - 5, capY, width + 10, capHeight);
      ctx.strokeRect(x - 5, capY, width + 10, capHeight);

      ctx.fillStyle = highlightColor;
      ctx.fillRect(x + 2, capY + 4, width - 4, 5);
    };

    drawSegment(pipe.x, 0, pipe.width, topHeight, true);
    drawSegment(pipe.x, bottomY, pipe.width, bottomHeight, false);
  }

  private drawFish(ctx: CanvasRenderingContext2D, fish: FishPickup, sim: WorldSimulation): void {
    if (fish.collected) return;

    // Draw magnetic attraction tether if within 125-unit Magnet radius
    if (sim.powers.magnet.unlocked && sim.powers.magnet.isActive) {
      const dx = sim.cat.x - fish.x;
      const dy = sim.cat.y - fish.y;
      if (dx * dx + dy * dy <= MAGNET_ATTRACTION_RADIUS_SQ) {
        ctx.save();
        ctx.strokeStyle = 'rgba(168, 85, 247, 0.55)';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(fish.x, fish.y);
        ctx.lineTo(sim.cat.x, sim.cat.y);
        ctx.stroke();
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(fish.x, fish.y);

    ctx.fillStyle = fish.isGolden ? 'rgba(250, 204, 21, 0.25)' : 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.arc(0, 0, fish.radius + 7, 0, Math.PI * 2);
    ctx.fill();

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

    ctx.fillStyle = fish.isGolden ? '#FDE047' : '#38BDF8';
    ctx.beginPath();
    ctx.ellipse(-2, 0, 12, 7.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#181425';
    ctx.beginPath();
    ctx.arc(-7, -2, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, enemy: EnemyHazard, catX: number): void {
    ctx.save();
    ctx.translate(enemy.x, enemy.y);

    if (enemy.active && enemy.telegraphTimer > 0) {
      const progress = 1 - enemy.telegraphTimer / enemy.telegraphMax;
      ctx.save();
      ctx.strokeStyle = `rgba(244, 63, 94, ${(0.35 + progress * 0.55).toFixed(2)})`;
      ctx.lineWidth = 2 + progress * 2.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(-enemy.radius, 0);
      ctx.lineTo(-(enemy.x - catX + 120), 0);
      ctx.stroke();

      const ringRadius = enemy.radius + 6 + (1 - progress) * 24;
      ctx.setLineDash([]);
      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
      ctx.stroke();

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
      const wingY = Math.sin(enemy.phase * 3.2) * 9;
      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FB7185' : '#312E81';
      ctx.beginPath();
      ctx.ellipse(0, 0, 18, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.moveTo(-15, -4);
      ctx.lineTo(-29, 1);
      ctx.lineTo(-15, 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#4338CA';
      ctx.beginPath();
      ctx.moveTo(-4, -2);
      ctx.lineTo(6, -15 + wingY);
      ctx.lineTo(12, -2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#F43F5E';
      ctx.beginPath();
      ctx.arc(-9, -3, 2.8, 0, Math.PI * 2);
      ctx.fill();
    } else if (enemy.archetype === 'balloon_weaver') {
      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FDE047' : '#EC4899';
      ctx.beginPath();
      ctx.arc(0, 0, enemy.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

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

      ctx.fillStyle = '#181425';
      ctx.beginPath();
      ctx.arc(-7, -3, 3, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = '#475569';
      ctx.beginPath();
      ctx.roundRect(-17, -12, 34, 24, 8);
      ctx.fill();
      ctx.stroke();

      const rotorW = 14 * Math.cos(enemy.phase * 5);
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-rotorW, -16);
      ctx.lineTo(rotorW, -16);
      ctx.stroke();

      ctx.fillStyle = enemy.telegraphTimer > 0 ? '#FEF08A' : '#EF4444';
      ctx.beginPath();
      ctx.arc(-10, 0, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  private drawBarudak(
    ctx: CanvasRenderingContext2D,
    sim: WorldSimulation,
    skin: CatSkinInfo
  ): void {
    const cat = sim.cat;
    const isTitle = sim.state === 'title';
    const isMobile = sim.worldWidth < 768;
    const isWapresActive =
      sim.powers.wapres.isActive && sim.powers.wapres.remainingDuration > 0;

    const drawX = isTitle
      ? isMobile
        ? sim.worldWidth * 0.5
        : sim.worldWidth * 0.27
      : cat.x;
    const drawY = isTitle
      ? isMobile
        ? sim.worldHeight * 0.21 + Math.sin(sim.distancePx * 0.02) * 10
        : sim.groundY * 0.46 + Math.sin(sim.distancePx * 0.02) * 16
      : cat.y;
    const baseScale = isTitle ? (isMobile ? 1.45 : 1.95) : 1.22;

    ctx.save();
    ctx.translate(drawX, drawY);
    ctx.rotate(cat.rotation);
    ctx.scale(cat.scaleX * baseScale, cat.scaleY * baseScale);

    const powerSpec = POWER_ABILITIES[this.equippedRewardId] ?? POWER_ABILITIES.none;

    // Spotlight halo on Title Screen or Active Power Aura
    if (isTitle || isWapresActive || cat.powerTimer > 0 || this.equippedRewardId !== 'none') {
      const radius = isTitle ? 46 : isWapresActive ? 46 : cat.powerTimer > 0 ? 40 : 30;
      const halo = ctx.createRadialGradient(0, 0, 8, 0, 0, radius);
      const defaultAura =
        skin.id === 'ninja' ? 'rgba(56, 189, 248, 0.32)' : 'rgba(253, 224, 71, 0.28)';
      halo.addColorStop(
        0,
        isWapresActive
          ? 'rgba(250, 204, 21, 0.72)'
          : this.equippedRewardId !== 'none'
          ? powerSpec.auraColor
          : defaultAura
      );
      halo.addColorStop(1, 'rgba(253, 224, 71, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Passive Shield Protective Barrier Ring (when 1 charge is available)
    if (
      !isTitle &&
      sim.powers.shield.unlocked &&
      sim.powers.shield.chargesRemaining > 0
    ) {
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.85)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Active Wapres Golden Immunity Ring & Countdown Arc
    if (isWapresActive) {
      const ratio = Math.max(
        0,
        Math.min(1, sim.powers.wapres.remainingDuration / WAPRES_DURATION_SEC)
      );
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(0, 0, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    // Invulnerability blink (only when not in Wapres mode)
    if (
      cat.invulnTimer > 0 &&
      !isWapresActive &&
      Math.floor(cat.invulnTimer * 16) % 2 === 0 &&
      !sim.powers.dash.isActive
    ) {
      ctx.globalAlpha = 0.65;
    }

    // Render Wapres Head Asset during Wapres Ultimate Mode, otherwise character skin sprite
    if (isWapresActive) {
      const wapresSource = this.spriteCache.get(WAPRES_ASSET_PATH);
      if (wapresSource) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, Math.PI * 2);
        ctx.clip();
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(wapresSource, -28, -28, 56, 56);
        ctx.restore();

        // Golden Medallion Rim
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 27, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#FACC15';
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fill();
      }

      // Golden Crown / Songkok Crest above Wapres Head
      ctx.fillStyle = '#FACC15';
      ctx.strokeStyle = '#181425';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-14, -24);
      ctx.lineTo(-10, -35);
      ctx.lineTo(-3, -28);
      ctx.lineTo(0, -37);
      ctx.lineTo(3, -28);
      ctx.lineTo(10, -35);
      ctx.lineTo(14, -24);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (skin.sprites) {
      const isHurtExpr =
        cat.hitFlashTimer > 0 ||
        (cat.invulnTimer > 0.35 && !sim.powers.second_chance.isActive) ||
        sim.koSequenceTimer > 0 ||
        sim.state === 'gameover';
      const isJumpExpr =
        !isHurtExpr &&
        (cat.earFlapTimer > 0 ||
          sim.powers.dash.isActive ||
          sim.powers.time_freeze.isActive ||
          cat.vy < -85);

      const targetUrl = isHurtExpr
        ? skin.sprites.gethit
        : isJumpExpr
        ? skin.sprites.jump
        : skin.sprites.idle;

      const spriteSource = this.spriteCache.get(targetUrl);

      if (spriteSource) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(spriteSource, -28, -28, 56, 56);
      } else {
        ctx.fillStyle = skin.primaryColor;
        ctx.beginPath();
        ctx.arc(0, 0, 22, 0, Math.PI * 2);
        ctx.fill();
      }
    }

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

    ctx.fillStyle = '#EA580C';
    ctx.fillRect(0, groundY, w, 12);

    ctx.strokeStyle = '#181425';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(w, groundY);
    ctx.stroke();

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
