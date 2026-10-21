export type WeatherType = 'cherry_blossoms' | 'twinkling_stars' | 'firefly_breeze';

export const WEATHER_TYPES: WeatherType[] = [
  'cherry_blossoms',
  'twinkling_stars',
  'firefly_breeze',
];

export interface BlossomPetal {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  angle: number;
  spinSpeed: number;
  swayPhase: number;
  swayAmp: number;
  tint: string;
}

export interface TwinkleStar {
  x: number;
  y: number;
  baseRadius: number;
  phase: number;
  twinkleSpeed: number;
  isCrossStar: boolean;
  tint: string;
}

export interface ShootingStar {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  length: number;
  life: number;
  maxLife: number;
}

export interface FireflyMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulsePhase: number;
  pulseSpeed: number;
}

const PETAL_COUNT = 38;
const STAR_COUNT = 56;
const FIREFLY_COUNT = 30;
const WEATHER_CYCLE_DURATION = 16; // seconds before smoothly transitioning to a new random weather

export function pickNextWeather(
  current: WeatherType | null,
  randomFn: () => number = Math.random
): WeatherType {
  const candidates = current
    ? WEATHER_TYPES.filter((w) => w !== current)
    : WEATHER_TYPES;
  const idx = Math.floor(randomFn() * candidates.length) % candidates.length;
  return candidates[Math.max(0, idx)];
}

export class DynamicWeatherSystem {
  public currentWeather: WeatherType;
  public previousWeather: WeatherType | null = null;
  public transitionAlpha = 1; // 0 -> 1 crossfade for currentWeather
  public cycleTimer = WEATHER_CYCLE_DURATION;
  public elapsedTime = 0;

  public petals: BlossomPetal[] = [];
  public stars: TwinkleStar[] = [];
  public shootingStar: ShootingStar = {
    active: false,
    x: 0,
    y: 0,
    vx: -480,
    vy: 190,
    length: 68,
    life: 0,
    maxLife: 0.65,
  };
  public fireflies: FireflyMote[] = [];

  private randomFn: () => number;
  private shootingStarCooldown = 3.5;

  constructor(initialWeather?: WeatherType, randomFn: () => number = Math.random) {
    this.randomFn = randomFn;
    this.currentWeather = initialWeather ?? pickNextWeather(null, this.randomFn);
    this.initPools(1280, 720);
  }

  private initPools(width: number, height: number): void {
    const petalTints = ['#FBCFE8', '#F9A8D4', '#FDA4AF', '#FFE4E6'];
    this.petals = [];
    for (let i = 0; i < PETAL_COUNT; i++) {
      this.petals.push({
        x: ((i * 97) % Math.max(1, width)),
        y: ((i * 61) % Math.max(1, height)),
        vx: -28 - (i % 5) * 9,
        vy: 34 + (i % 4) * 11,
        size: 4.5 + (i % 3) * 1.8,
        angle: (i * 0.8) % (Math.PI * 2),
        spinSpeed: 1.4 + (i % 3) * 0.65,
        swayPhase: i * 1.1,
        swayAmp: 18 + (i % 4) * 6,
        tint: petalTints[i % petalTints.length],
      });
    }

    const starTints = ['#FEF3C7', '#E0F2FE', '#FDE68A', '#FCE7F3'];
    this.stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
      this.stars.push({
        x: (i * 113) % 1000,
        y: (i * 59) % 420,
        baseRadius: 1.2 + (i % 3) * 0.9,
        phase: i * 0.85,
        twinkleSpeed: 2.2 + (i % 4) * 0.9,
        isCrossStar: i % 4 === 0,
        tint: starTints[i % starTints.length],
      });
    }

    this.fireflies = [];
    for (let i = 0; i < FIREFLY_COUNT; i++) {
      this.fireflies.push({
        x: (i * 89) % Math.max(1, width),
        y: (i * 71) % Math.max(1, height),
        vx: -18 - (i % 4) * 7,
        vy: (i % 2 === 0 ? 1 : -1) * (10 + (i % 3) * 5),
        radius: 2.4 + (i % 3) * 0.9,
        pulsePhase: i * 0.9,
        pulseSpeed: 3.0 + (i % 3) * 0.8,
      });
    }
  }

  public randomizeWeather(forcedWeather?: WeatherType): WeatherType {
    const next = forcedWeather ?? pickNextWeather(this.currentWeather, this.randomFn);
    if (next !== this.currentWeather) {
      this.previousWeather = this.currentWeather;
      this.currentWeather = next;
      this.transitionAlpha = 0;
    }
    this.cycleTimer = WEATHER_CYCLE_DURATION;
    return this.currentWeather;
  }

  public update(dt: number, worldWidth: number, groundY: number, scrollSpeed: number): void {
    const safeW = Math.max(320, worldWidth);
    const safeGround = Math.max(240, groundY);
    this.elapsedTime += dt;

    // Crossfade transition
    if (this.transitionAlpha < 1) {
      this.transitionAlpha = Math.min(1, this.transitionAlpha + dt * 0.65);
      if (this.transitionAlpha >= 1) {
        this.previousWeather = null;
      }
    }

    // Cycle weather periodically during active play
    this.cycleTimer -= dt;
    if (this.cycleTimer <= 0) {
      this.randomizeWeather();
    }

    // 1. Update Cherry Blossom Petals
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      p.swayPhase += dt * 2.2;
      p.angle += p.spinSpeed * dt;
      const swayVx = Math.sin(p.swayPhase) * p.swayAmp;
      p.x += (p.vx + swayVx - scrollSpeed * 0.16) * dt;
      p.y += p.vy * dt;

      if (p.y > safeGround + 12) {
        p.y = -12;
        p.x = (p.x + safeW * 0.37) % safeW;
      }
      if (p.x < -16) {
        p.x += safeW + 24;
      } else if (p.x > safeW + 16) {
        p.x -= safeW + 24;
      }
    }

    // 2. Update Twinkling Stars & Shooting Star
    for (let i = 0; i < this.stars.length; i++) {
      const s = this.stars[i];
      s.phase += s.twinkleSpeed * dt;
    }

    if (this.shootingStar.active) {
      this.shootingStar.life -= dt;
      this.shootingStar.x += this.shootingStar.vx * dt;
      this.shootingStar.y += this.shootingStar.vy * dt;
      if (this.shootingStar.life <= 0) {
        this.shootingStar.active = false;
      }
    } else {
      this.shootingStarCooldown -= dt;
      if (this.shootingStarCooldown <= 0) {
        this.shootingStarCooldown = 3.2 + this.randomFn() * 3.5;
        this.shootingStar.active = true;
        this.shootingStar.maxLife = 0.6;
        this.shootingStar.life = 0.6;
        this.shootingStar.x = safeW * (0.45 + this.randomFn() * 0.45);
        this.shootingStar.y = safeGround * (0.08 + this.randomFn() * 0.22);
      }
    }

    // 3. Update Firefly Breeze Motes
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];
      f.pulsePhase += f.pulseSpeed * dt;
      f.x += (f.vx - scrollSpeed * 0.12) * dt;
      f.y += (f.vy + Math.cos(f.pulsePhase) * 14) * dt;

      if (f.x < -12) f.x += safeW + 20;
      if (f.y < 24) f.y = safeGround - 28;
      if (f.y > safeGround - 16) f.y = 32;
    }
  }

  public draw(
    ctx: CanvasRenderingContext2D,
    worldWidth: number,
    groundY: number,
    distancePx: number
  ): void {
    // Always keep a subtle baseline of distant stars in the night sky, and amplify based on active weather
    const isTwinklePrimary = this.currentWeather === 'twinkling_stars';
    const wasTwinklePrev = this.previousWeather === 'twinkling_stars';
    const twinkleWeight = isTwinklePrimary
      ? 0.35 + 0.65 * this.transitionAlpha
      : wasTwinklePrev
      ? 0.35 + 0.65 * (1 - this.transitionAlpha)
      : 0.35;

    this.drawTwinklingStars(ctx, worldWidth, groundY, distancePx, twinkleWeight);

    if (this.previousWeather && this.transitionAlpha < 1) {
      this.drawWeatherLayer(
        ctx,
        this.previousWeather,
        worldWidth,
        groundY,
        1 - this.transitionAlpha
      );
    }

    this.drawWeatherLayer(
      ctx,
      this.currentWeather,
      worldWidth,
      groundY,
      this.transitionAlpha
    );
  }

  private drawWeatherLayer(
    ctx: CanvasRenderingContext2D,
    weather: WeatherType,
    worldWidth: number,
    groundY: number,
    alpha: number
  ): void {
    if (alpha <= 0.01) return;
    if (weather === 'cherry_blossoms') {
      this.drawCherryBlossoms(ctx, alpha);
    } else if (weather === 'twinkling_stars') {
      this.drawShootingStar(ctx, alpha);
    } else if (weather === 'firefly_breeze') {
      this.drawFireflies(ctx, alpha);
    }
  }

  private drawTwinklingStars(
    ctx: CanvasRenderingContext2D,
    w: number,
    groundY: number,
    distancePx: number,
    intensity: number
  ): void {
    ctx.save();
    for (let i = 0; i < this.stars.length; i++) {
      const st = this.stars[i];
      const sx = (((st.x - distancePx * 0.035) % w) + w) % w;
      const sy = (st.y / 420) * (groundY * 0.68);
      const wave = 0.5 + 0.5 * Math.sin(st.phase);
      const alpha = (0.18 + 0.72 * wave) * intensity;
      if (alpha <= 0.04) continue;

      ctx.fillStyle = st.tint;
      ctx.globalAlpha = Math.min(1, alpha);

      const r = st.baseRadius * (0.85 + 0.4 * wave * intensity);
      ctx.beginPath();
      ctx.arc(sx, sy, r, 0, Math.PI * 2);
      ctx.fill();

      // Draw 4-point sparkle flare on bright cross stars when 'twinkling_stars' is active
      if (st.isCrossStar && intensity > 0.55 && wave > 0.6) {
        const flareLen = r * 2.9;
        ctx.strokeStyle = st.tint;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(sx - flareLen, sy);
        ctx.lineTo(sx + flareLen, sy);
        ctx.moveTo(sx, sy - flareLen);
        ctx.lineTo(sx, sy + flareLen);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawShootingStar(ctx: CanvasRenderingContext2D, alpha: number): void {
    if (!this.shootingStar.active) return;
    const s = this.shootingStar;
    const lifeRatio = Math.max(0, s.life / s.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha * Math.sin(lifeRatio * Math.PI) * 0.85;
    const mag = Math.hypot(s.vx, s.vy) || 1;
    const tailX = s.x - (s.vx / mag) * s.length;
    const tailY = s.y - (s.vy / mag) * s.length;

    const grad = ctx.createLinearGradient(s.x, s.y, tailX, tailY);
    grad.addColorStop(0, '#FEF9C3');
    grad.addColorStop(1, 'rgba(254, 249, 195, 0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(tailX, tailY);
    ctx.stroke();
    ctx.restore();
  }

  private drawCherryBlossoms(ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.save();
    for (let i = 0; i < this.petals.length; i++) {
      const p = this.petals[i];
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      const flutterScaleY = 0.45 + 0.55 * Math.abs(Math.cos(p.swayPhase));
      ctx.scale(1, flutterScaleY);
      ctx.globalAlpha = alpha * 0.78;
      ctx.fillStyle = p.tint;

      // Draw notched sakura petal silhouette
      ctx.beginPath();
      ctx.moveTo(-p.size, 0);
      ctx.quadraticCurveTo(0, -p.size * 0.95, p.size, -p.size * 0.28);
      ctx.lineTo(p.size * 0.62, 0);
      ctx.lineTo(p.size, p.size * 0.28);
      ctx.quadraticCurveTo(0, p.size * 0.95, -p.size, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  private drawFireflies(ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.save();
    for (let i = 0; i < this.fireflies.length; i++) {
      const f = this.fireflies[i];
      const pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(f.pulsePhase));
      ctx.globalAlpha = alpha * pulse * 0.8;

      // Soft warm glow halo
      ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius * 2.8, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
