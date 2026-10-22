import {
  ACHIEVEMENT_DEFINITIONS,
  ACTIVE_POWER_IDS,
  AchievementState,
  CorePowerId,
  GameplayEventType,
  normalizePowerId,
  POWER_ABILITIES,
  POWER_ABILITY_LIST,
  PowerAbilityId,
  PowerAbilitySpec,
} from './achievementDefinitions';
import { LocalProgressStore, PersistedProgressState } from './localProgressStore';

export interface GameplayMilestoneEvent {
  eventId?: string;
  type: GameplayEventType;
  amount?: number;
  timestampIso?: string;
}

export interface AchievementUnlockNotice {
  achievement: AchievementState;
  reward: PowerAbilitySpec;
}

export class AchievementService {
  private store: LocalProgressStore;
  private state: PersistedProgressState;

  constructor(store = new LocalProgressStore()) {
    this.store = store;
    this.state = this.store.load();
  }

  public reload(): void {
    this.state = this.store.load();
  }

  public getAchievements(): AchievementState[] {
    return ACHIEVEMENT_DEFINITIONS.map((def) => {
      const entry = this.state.achievements[def.achievement_id] ?? {
        progress: 0,
        unlocked: false,
        unlocked_at: null,
      };
      return {
        ...def,
        progress: entry.progress,
        unlocked: entry.unlocked,
        unlocked_at: entry.unlocked_at,
      };
    });
  }

  /**
   * Unlocks the First Play achievement (and Dash active power) when the player starts their first run.
   * Idempotent: never unlocks or notifies more than once.
   */
  public recordFirstPlay(timestampIso?: string): AchievementUnlockNotice[] {
    return this.recordEvent({
      type: 'first_play',
      amount: 1,
      timestampIso,
    });
  }

  /**
   * Evaluates current run score against the 100/200/300/400/500 score milestones.
   * Updates achievement progress to at least `Math.floor(runScore)` and unlocks any newly reached tiers.
   */
  public evaluateRunScore(runScore: number, timestampIso?: string): AchievementUnlockNotice[] {
    if (typeof runScore !== 'number' || !Number.isFinite(runScore) || runScore < 0) {
      return [];
    }
    const cleanScore = Math.floor(runScore);
    if (cleanScore <= 0) return [];

    const nowIso = timestampIso ?? new Date().toISOString();
    const newlyUnlocked: AchievementUnlockNotice[] = [];
    let stateMutated = false;

    if (cleanScore > this.state.lifetimeStats.highestRunScore) {
      this.state.lifetimeStats.highestRunScore = cleanScore;
      stateMutated = true;
    }

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (def.event_type !== 'score_earned') continue;

      const currentEntry = this.state.achievements[def.achievement_id] ?? {
        progress: 0,
        unlocked: false,
        unlocked_at: null,
      };

      const wasUnlocked = currentEntry.unlocked;
      const nextProgress = Math.max(
        currentEntry.progress,
        Math.min(def.target_value, cleanScore)
      );

      if (nextProgress !== currentEntry.progress) {
        currentEntry.progress = nextProgress;
        stateMutated = true;
      }

      if (!wasUnlocked && currentEntry.progress >= def.target_value) {
        currentEntry.unlocked = true;
        currentEntry.unlocked_at = nowIso;
        stateMutated = true;

        if (!this.state.unlockedAchievementIds.includes(def.achievement_id)) {
          this.state.unlockedAchievementIds.push(def.achievement_id);
        }
        if (!this.state.unlockedRewardIds.includes(def.reward_id)) {
          this.state.unlockedRewardIds.push(def.reward_id);
        }

        // Unlocking a power must not silently replace the player's current
        // selection. The selector is the only place that changes the run loadout.
        if (
          POWER_ABILITIES[def.reward_id]?.category === 'active' &&
          this.state.equippedRewardId === 'none'
        ) {
          this.state.equippedRewardId = def.reward_id;
        }

        const reward = POWER_ABILITIES[def.reward_id];
        newlyUnlocked.push({
          achievement: {
            ...def,
            progress: currentEntry.progress,
            unlocked: true,
            unlocked_at: nowIso,
          },
          reward,
        });
      }

      this.state.achievements[def.achievement_id] = currentEntry;
    }

    if (stateMutated) {
      this.store.save(this.state);
    }

    return newlyUnlocked;
  }

  public recordEvent(event: GameplayMilestoneEvent): AchievementUnlockNotice[] {
    const amount = event.amount === undefined ? 1 : event.amount;
    if (
      typeof amount !== 'number' ||
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !Number.isInteger(amount)
    ) {
      return [];
    }

    if (event.eventId) {
      if (this.state.processedEventIds.includes(event.eventId)) {
        return [];
      }
      this.state.processedEventIds.push(event.eventId);
      if (this.state.processedEventIds.length > 250) {
        this.state.processedEventIds.shift();
      }
    }

    if (event.type === 'run_score_reached') {
      return this.evaluateRunScore(amount, event.timestampIso);
    }

    const nowIso = event.timestampIso ?? new Date().toISOString();
    const newlyUnlocked: AchievementUnlockNotice[] = [];
    let stateMutated = false;

    if (event.type === 'first_play') {
      this.state.lifetimeStats.firstPlayCompleted += amount;
      stateMutated = true;
    } else if (event.type === 'fish_collected') {
      this.state.lifetimeStats.fishCollected += amount;
      stateMutated = true;
    } else if (event.type === 'pipe_cleared') {
      this.state.lifetimeStats.pipesCleared += amount;
      stateMutated = true;
    } else if (event.type === 'score_earned') {
      this.state.lifetimeStats.scoreEarned += amount;
      stateMutated = true;
    }

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (def.event_type !== event.type) continue;

      const currentEntry = this.state.achievements[def.achievement_id] ?? {
        progress: 0,
        unlocked: false,
        unlocked_at: null,
      };

      const wasUnlocked = currentEntry.unlocked;
      const nextProgress = Math.max(
        currentEntry.progress,
        Math.min(def.target_value, currentEntry.progress + amount)
      );

      if (nextProgress !== currentEntry.progress) {
        currentEntry.progress = nextProgress;
        stateMutated = true;
      }

      if (!wasUnlocked && currentEntry.progress >= def.target_value) {
        currentEntry.unlocked = true;
        currentEntry.unlocked_at = nowIso;
        stateMutated = true;

        if (!this.state.unlockedAchievementIds.includes(def.achievement_id)) {
          this.state.unlockedAchievementIds.push(def.achievement_id);
        }
        if (!this.state.unlockedRewardIds.includes(def.reward_id)) {
          this.state.unlockedRewardIds.push(def.reward_id);
        }

        // Unlocking a power must not silently replace the player's current
        // selection. Keep the current loadout until the selector changes it.
        if (
          POWER_ABILITIES[def.reward_id]?.category === 'active' &&
          this.state.equippedRewardId === 'none'
        ) {
          this.state.equippedRewardId = def.reward_id;
        }

        const reward = POWER_ABILITIES[def.reward_id];
        newlyUnlocked.push({
          achievement: {
            ...def,
            progress: currentEntry.progress,
            unlocked: true,
            unlocked_at: nowIso,
          },
          reward,
        });
      }

      this.state.achievements[def.achievement_id] = currentEntry;
    }

    if (stateMutated) {
      this.store.save(this.state);
    }

    return newlyUnlocked;
  }

  public getUnlockedRewardIds(): PowerAbilityId[] {
    return [...this.state.unlockedRewardIds];
  }

  public isRewardUnlocked(rewardId: PowerAbilityId): boolean {
    if (rewardId === 'none') return true;
    const norm = normalizePowerId(rewardId);
    return this.state.unlockedRewardIds.includes(norm);
  }

  public getEquippedRewardId(): PowerAbilityId {
    const eq = normalizePowerId(this.state.equippedRewardId);
    if (eq !== 'none' && this.isRewardUnlocked(eq)) {
      return eq;
    }
    if (this.state.unlockedRewardIds.length > 0) {
      const unlockedActive = this.state.unlockedRewardIds.filter((id) =>
        ACTIVE_POWER_IDS.includes(id as CorePowerId)
      );
      return unlockedActive.length > 0
        ? unlockedActive[unlockedActive.length - 1]
        : this.state.unlockedRewardIds[this.state.unlockedRewardIds.length - 1];
    }
    return 'none';
  }

  public getEquippedReward(): PowerAbilitySpec {
    return POWER_ABILITIES[this.getEquippedRewardId()] ?? POWER_ABILITIES.none;
  }

  /**
   * Equips an unlocked Power Ability. Rejects locked or invalid abilities.
   */
  public equipReward(rewardId: PowerAbilityId): {
    success: boolean;
    equippedRewardId: PowerAbilityId;
    reason?: string;
  } {
    const norm = normalizePowerId(rewardId);
    if (
      norm === 'none' ||
      !Object.prototype.hasOwnProperty.call(POWER_ABILITIES, norm)
    ) {
      return {
        success: false,
        equippedRewardId: this.getEquippedRewardId(),
        reason: 'Kemampuan Power tidak ditemukan.',
      };
    }

    if (!this.isRewardUnlocked(norm)) {
      return {
        success: false,
        equippedRewardId: this.getEquippedRewardId(),
        reason: 'Power ini masih terkunci. Selesaikan pencapaian terkait terlebih dahulu!',
      };
    }

    this.state.equippedRewardId = norm;
    this.store.save(this.state);

    return {
      success: true,
      equippedRewardId: norm,
    };
  }

  /**
   * Cycles to the next unlocked power. The selected power is the only power
   * that can run during the next game.
   */
  public cycleUnlockedPower(): PowerAbilityId {
    const unlocked = this.state.unlockedRewardIds;
    if (unlocked.length === 0) return 'none';
    const pool = unlocked;
    const current = this.getEquippedRewardId();
    const idx = pool.indexOf(current);
    const next = pool[(idx + 1) % pool.length];
    this.equipReward(next);
    return next;
  }

  public getAllRewardsWithStatus(): Array<
    PowerAbilitySpec & {
      unlocked: boolean;
      equipped: boolean;
      requiredAchievementName?: string;
      requiredAchievementDesc?: string;
    }
  > {
    const equippedId = this.getEquippedRewardId();
    return POWER_ABILITY_LIST.map((reward) => {
      const linkedAch = ACHIEVEMENT_DEFINITIONS.find((a) => a.reward_id === reward.reward_id);
      return {
        ...reward,
        unlocked: this.isRewardUnlocked(reward.reward_id),
        equipped: reward.reward_id === equippedId,
        requiredAchievementName: linkedAch?.name,
        requiredAchievementDesc: linkedAch?.description,
      };
    });
  }

  public getLifetimeStats(): {
    firstPlayCompleted: number;
    fishCollected: number;
    pipesCleared: number;
    scoreEarned: number;
    highestRunScore: number;
  } {
    return { ...this.state.lifetimeStats };
  }
}
