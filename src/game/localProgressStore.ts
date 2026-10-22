import {
  ACHIEVEMENT_DEFINITIONS,
  ACTIVE_POWER_IDS,
  CorePowerId,
  normalizePowerId,
  POWER_ABILITIES,
  PowerAbilityId,
} from './achievementDefinitions';

export const ACHIEVEMENTS_STORAGE_KEY = 'game.achievements.v2';
export const CURRENT_SCHEMA_VERSION = 2;

export interface StoredAchievementEntry {
  progress: number;
  unlocked: boolean;
  unlocked_at: string | null;
}

export interface PersistedProgressState {
  schemaVersion: number;
  achievements: Record<string, StoredAchievementEntry>;
  unlockedAchievementIds: string[];
  unlockedRewardIds: PowerAbilityId[];
  equippedRewardId: PowerAbilityId;
  processedEventIds: string[];
  lifetimeStats: {
    firstPlayCompleted: number;
    fishCollected: number;
    pipesCleared: number;
    scoreEarned: number;
    highestRunScore: number;
  };
  updatedAt: string;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // localStorage may be disabled in privacy mode
  }
  return null;
}

function isValidPowerId(val: unknown): val is PowerAbilityId {
  const norm = normalizePowerId(val);
  return norm !== 'none' || val === 'none';
}

export class LocalProgressStore {
  private storage: StorageLike | null;
  private storageKey: string;
  private memoryFallback: PersistedProgressState | null = null;

  constructor(storage?: StorageLike | null, storageKey = ACHIEVEMENTS_STORAGE_KEY) {
    this.storage = storage !== undefined ? storage : getDefaultStorage();
    this.storageKey = storageKey;
  }

  public createDefaultState(): PersistedProgressState {
    const achievements: Record<string, StoredAchievementEntry> = {};
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      achievements[def.achievement_id] = {
        progress: 0,
        unlocked: false,
        unlocked_at: null,
      };
    }

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      achievements,
      unlockedAchievementIds: [],
      unlockedRewardIds: [],
      equippedRewardId: 'none',
      processedEventIds: [],
      lifetimeStats: {
        firstPlayCompleted: 0,
        fishCollected: 0,
        pipesCleared: 0,
        scoreEarned: 0,
        highestRunScore: 0,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  public load(): PersistedProgressState {
    let raw: string | null = null;
    try {
      raw = this.storage ? this.storage.getItem(this.storageKey) : null;
    } catch {
      raw = null;
    }

    if (!raw) {
      if (this.memoryFallback) {
        return this.sanitizeState(this.memoryFallback);
      }
      return this.createDefaultState();
    }

    try {
      const parsed = JSON.parse(raw);
      const migrated = this.migrateIfNeeded(parsed);
      const sanitized = this.sanitizeState(migrated);
      this.memoryFallback = sanitized;
      return sanitized;
    } catch {
      const fallback = this.memoryFallback
        ? this.sanitizeState(this.memoryFallback)
        : this.createDefaultState();
      this.save(fallback);
      return fallback;
    }
  }

  public save(state: PersistedProgressState): void {
    const sanitized = this.sanitizeState({
      ...state,
      updatedAt: new Date().toISOString(),
    });
    this.memoryFallback = sanitized;

    if (!this.storage) return;
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(sanitized));
    } catch {
      // Ignore quota exceeded or storage errors while retaining memoryFallback
    }
  }

  private migrateIfNeeded(rawObj: unknown): unknown {
    if (!rawObj || typeof rawObj !== 'object') {
      return this.createDefaultState();
    }

    const obj = rawObj as Record<string, unknown>;
    const version = typeof obj.schemaVersion === 'number' ? obj.schemaVersion : 0;

    if (version < CURRENT_SCHEMA_VERSION) {
      return {
        ...this.createDefaultState(),
        ...obj,
        schemaVersion: CURRENT_SCHEMA_VERSION,
      };
    }

    return obj;
  }

  public sanitizeState(input: unknown): PersistedProgressState {
    const defaults = this.createDefaultState();
    if (!input || typeof input !== 'object') {
      return defaults;
    }

    const src = input as Record<string, unknown>;
    const srcAchievements =
      src.achievements && typeof src.achievements === 'object'
        ? (src.achievements as Record<string, unknown>)
        : {};

    const achievements: Record<string, StoredAchievementEntry> = {};
    const unlockedAchievementIds: string[] = [];
    const unlockedRewardSet = new Set<PowerAbilityId>();

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const rawEntry = srcAchievements[def.achievement_id];
      let progress = 0;
      let unlocked = false;
      let unlockedAt: string | null = null;

      if (rawEntry && typeof rawEntry === 'object') {
        const entry = rawEntry as Record<string, unknown>;
        if (typeof entry.progress === 'number' && Number.isFinite(entry.progress)) {
          progress = Math.max(0, Math.min(def.target_value, Math.floor(entry.progress)));
        }
        if (typeof entry.unlocked === 'boolean') {
          unlocked = entry.unlocked;
        }
        if (typeof entry.unlocked_at === 'string' && entry.unlocked_at.trim()) {
          unlockedAt = entry.unlocked_at;
        }
      }

      if (progress >= def.target_value) {
        progress = def.target_value;
        unlocked = true;
        if (!unlockedAt) {
          unlockedAt = new Date().toISOString();
        }
      } else {
        unlocked = false;
        unlockedAt = null;
      }

      achievements[def.achievement_id] = {
        progress,
        unlocked,
        unlocked_at: unlockedAt,
      };

      if (unlocked) {
        unlockedAchievementIds.push(def.achievement_id);
        unlockedRewardSet.add(def.reward_id);
      }
    }

    const unlockedRewardIds = Array.from(unlockedRewardSet);

    let equippedRewardId: PowerAbilityId = 'none';
    const candidateEq = isValidPowerId(src.equippedRewardId)
      ? normalizePowerId(src.equippedRewardId)
      : 'none';

    if (
      candidateEq !== 'none' &&
      unlockedRewardSet.has(candidateEq) &&
      Object.prototype.hasOwnProperty.call(POWER_ABILITIES, candidateEq)
    ) {
      equippedRewardId = candidateEq;
    } else if (unlockedRewardIds.length > 0) {
      // Prefer the highest unlocked active skill for the primary trigger button, or fallback to latest unlocked
      const unlockedActive = unlockedRewardIds.filter((id) =>
        ACTIVE_POWER_IDS.includes(id as CorePowerId)
      );
      equippedRewardId =
        unlockedActive.length > 0
          ? unlockedActive[unlockedActive.length - 1]
          : unlockedRewardIds[unlockedRewardIds.length - 1];
    }

    const processedEventIds = Array.isArray(src.processedEventIds)
      ? src.processedEventIds
          .filter((id): id is string => typeof id === 'string' && id.length > 0)
          .slice(-250)
      : [];

    const rawStats =
      src.lifetimeStats && typeof src.lifetimeStats === 'object'
        ? (src.lifetimeStats as Record<string, unknown>)
        : {};

    const sanitizeNonNegativeInt = (v: unknown): number =>
      typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;

    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      achievements,
      unlockedAchievementIds,
      unlockedRewardIds,
      equippedRewardId,
      processedEventIds,
      lifetimeStats: {
        firstPlayCompleted: sanitizeNonNegativeInt(rawStats.firstPlayCompleted),
        fishCollected: sanitizeNonNegativeInt(rawStats.fishCollected),
        pipesCleared: sanitizeNonNegativeInt(rawStats.pipesCleared),
        scoreEarned: sanitizeNonNegativeInt(rawStats.scoreEarned),
        highestRunScore: sanitizeNonNegativeInt(rawStats.highestRunScore),
      },
      updatedAt:
        typeof src.updatedAt === 'string' && src.updatedAt ? src.updatedAt : defaults.updatedAt,
    };
  }
}
