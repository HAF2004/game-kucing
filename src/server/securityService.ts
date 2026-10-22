import crypto from 'node:crypto';

export interface RunSubmissionPayload {
  idempotencyKey: string;
  score: number;
  fishCollected: number;
  pipesCleared: number;
  durationMs: number;
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  code?: string;
}

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  baseBackoffMs: number;
}

const PROHIBITED_USERNAMES = new Set([
  'admin',
  'administrator',
  'system',
  'root',
  'moderator',
  'null',
  'undefined',
  'select',
  'insert',
  'update',
  'delete',
  'drop',
  'table',
]);

// Suspicious SQL/XSS patterns rejected at the input boundary in addition to parameterized queries
const SUSPICIOUS_INPUT_PATTERN = /(--|;|\/\*|\*\/|<script|union\s+select|drop\s+table|or\s+1\s*=\s*1|xp_)/i;

export class SecurityService {
  /**
   * Generates a cryptographically strong immutable player ID.
   */
  public generatePlayerId(): string {
    return `plr_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Generates a secret per-device authentication token returned once on registration.
   */
  public generateAuthToken(): string {
    return `tok_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Hashes an auth token or IP using SHA-256 so plaintext secrets are never stored in the database.
   */
  public hashSecret(secret: string): string {
    return crypto.createHash('sha256').update(secret).digest('hex');
  }

  /**
   * Constant-time verification of a client-provided token against the stored SHA-256 hash.
   */
  public verifyAuthToken(providedToken: unknown, expectedHash: string): boolean {
    if (typeof providedToken !== 'string' || providedToken.length < 16 || !expectedHash) {
      return false;
    }
    const actualHash = this.hashSecret(providedToken);
    const aBuf = Buffer.from(actualHash, 'utf8');
    const bBuf = Buffer.from(expectedHash, 'utf8');
    if (aBuf.length !== bBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(aBuf, bBuf);
  }

  /**
   * Validates and normalizes a device identifier.
   */
  public validateDeviceId(deviceId: unknown): ValidationResult {
    if (typeof deviceId !== 'string') {
      return { valid: false, reason: 'Device ID harus berupa teks.', code: 'INVALID_DEVICE_ID' };
    }
    const trimmed = deviceId.trim();
    if (trimmed.length < 8 || trimmed.length > 128) {
      return {
        valid: false,
        reason: 'Panjang Device ID harus antara 8 hingga 128 karakter.',
        code: 'INVALID_DEVICE_ID',
      };
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      return {
        valid: false,
        reason: 'Device ID mengandung karakter yang tidak diizinkan.',
        code: 'INVALID_DEVICE_ID',
      };
    }
    return { valid: true };
  }

  /**
   * Validates and normalizes a player display username.
   * Allowed: 3-20 characters, alphanumeric, underscores, hyphens, and single spaces.
   */
  public validateAndNormalizeUsername(rawUsername: unknown): {
    valid: boolean;
    username?: string;
    normalizedUsername?: string;
    reason?: string;
    code?: string;
  } {
    if (typeof rawUsername !== 'string') {
      return {
        valid: false,
        reason: 'Username harus berupa teks.',
        code: 'INVALID_USERNAME',
      };
    }

    const collapsed = rawUsername.trim().replace(/\s+/g, ' ');
    if (collapsed.length < 3 || collapsed.length > 20) {
      return {
        valid: false,
        reason: 'Username harus terdiri dari 3 hingga 20 karakter.',
        code: 'USERNAME_LENGTH',
      };
    }

    if (SUSPICIOUS_INPUT_PATTERN.test(collapsed)) {
      return {
        valid: false,
        reason: 'Username mengandung pola karakter yang dilarang.',
        code: 'USERNAME_PROHIBITED_CHARS',
      };
    }

    if (!/^[a-zA-Z0-9_ -]+$/.test(collapsed)) {
      return {
        valid: false,
        reason: 'Username hanya boleh menggunakan huruf, angka, spasi, garis bawah (_), atau strip (-).',
        code: 'USERNAME_INVALID_CHARS',
      };
    }

    const normalized = collapsed.toLowerCase();
    if (PROHIBITED_USERNAMES.has(normalized)) {
      return {
        valid: false,
        reason: 'Username tersebut dicadangkan oleh sistem.',
        code: 'USERNAME_RESERVED',
      };
    }

    return {
      valid: true,
      username: collapsed,
      normalizedUsername: normalized,
    };
  }

  /**
   * Server-authoritative plausibility validation for a completed or mid-run score submission.
   * Enforces the actual physics and scoring bounds from src/game/rules.ts.
   */
  public validateRunSubmission(payload: unknown): {
    valid: boolean;
    cleaned?: RunSubmissionPayload;
    reason?: string;
    code?: string;
  } {
    if (!payload || typeof payload !== 'object') {
      return {
        valid: false,
        reason: 'Payload skor tidak valid.',
        code: 'MALFORMED_PAYLOAD',
      };
    }

    const p = payload as Record<string, unknown>;
    const idempotencyKey = typeof p.idempotencyKey === 'string' ? p.idempotencyKey.trim() : '';

    if (
      idempotencyKey.length < 8 ||
      idempotencyKey.length > 128 ||
      !/^[a-zA-Z0-9_:-]+$/.test(idempotencyKey)
    ) {
      return {
        valid: false,
        reason: 'Idempotency key tidak valid atau hilang.',
        code: 'INVALID_IDEMPOTENCY_KEY',
      };
    }

    const score = p.score;
    const fishCollected = p.fishCollected;
    const pipesCleared = p.pipesCleared;
    const durationMs = p.durationMs;

    if (
      typeof score !== 'number' ||
      typeof fishCollected !== 'number' ||
      typeof pipesCleared !== 'number' ||
      typeof durationMs !== 'number' ||
      !Number.isFinite(score) ||
      !Number.isFinite(fishCollected) ||
      !Number.isFinite(pipesCleared) ||
      !Number.isFinite(durationMs) ||
      !Number.isInteger(score) ||
      !Number.isInteger(fishCollected) ||
      !Number.isInteger(pipesCleared) ||
      !Number.isInteger(durationMs)
    ) {
      return {
        valid: false,
        reason: 'Statistik permainan harus berupa bilangan bulat valid.',
        code: 'NON_INTEGER_STATS',
      };
    }

    if (score < 0 || fishCollected < 0 || pipesCleared < 0 || durationMs < 0) {
      return {
        valid: false,
        reason: 'Nilai skor atau statistik tidak boleh negatif.',
        code: 'NEGATIVE_STATS',
      };
    }

    // Minimum plausible run duration if any score/fish/pipes were earned
    if ((score > 0 || fishCollected > 0 || pipesCleared > 0) && durationMs < 400) {
      return {
        valid: false,
        reason: 'Durasi permainan terlalu singkat untuk menghasilkan skor.',
        code: 'IMPLAUSIBLE_DURATION',
      };
    }

    // Maximum plausible rate limits based on physics & Power Abilities in rules.ts:
    const durationSec = Math.max(1, durationMs / 1000);
    const maxPlausiblePipes = Math.ceil(durationSec * 3.0) + 6;
    if (pipesCleared > maxPlausiblePipes || pipesCleared > 5000) {
      return {
        valid: false,
        reason: 'Jumlah rintangan terlewati melebihi batas fisika permainan.',
        code: 'IMPLAUSIBLE_PIPES',
      };
    }

    // Overdrive / God Mode can spawn 2 extra golden fish per vaporized pipe
    const maxPlausibleFish = Math.max(pipesCleared * 3 + 6, Math.ceil(durationSec * 4.5) + 8);
    if (fishCollected > maxPlausibleFish || fishCollected > 5000) {
      return {
        valid: false,
        reason: 'Jumlah ikan terkumpul melebihi batas fisika permainan.',
        code: 'IMPLAUSIBLE_FISH',
      };
    }

    // In rules.ts:
    // - Each pipe cleared or vaporized by Power awards up to 8 points
    // - Each fish awards up to 5 points
    // - Enemy knockouts & EMP Shockwaves award bonus points proportional to duration
    const maxEnemyAndPowerPoints = (Math.ceil(durationSec / 1.2) + 4) * 10;
    const maxPipePoints = pipesCleared * 8;
    const maxFishPoints = fishCollected * 5;
    const maxTheoreticalScore = maxPipePoints + maxFishPoints + maxEnemyAndPowerPoints + 15;

    if (score > maxTheoreticalScore || score > 50000) {
      return {
        valid: false,
        reason: 'Skor tidak konsisten dengan jumlah ikan, rintangan, dan durasi permainan.',
        code: 'IMPLAUSIBLE_SCORE',
      };
    }

    // Also if score > 0, there must be at least 1 pipe, 1 fish, or enough duration for an enemy knockout
    if (score > 0 && pipesCleared === 0 && fishCollected === 0 && durationMs < 2000) {
      return {
        valid: false,
        reason: 'Skor positif tanpa aktivitas permainan yang sah.',
        code: 'UNEXPLAINED_SCORE',
      };
    }

    return {
      valid: true,
      cleaned: {
        idempotencyKey,
        score,
        fishCollected,
        pipesCleared,
        durationMs,
      },
    };
  }

}
