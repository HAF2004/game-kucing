import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ACHIEVEMENTS_STORAGE_KEY,
  LocalProgressStore,
  StorageLike,
} from './localProgressStore';
import { AchievementService } from './achievementService';

class MemoryStorage implements StorageLike {
  public map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

test('1. Power unlock milestones at First Play, 100, 200, 300, 400, and 500 score', () => {
  const storage = new MemoryStorage();
  const store = new LocalProgressStore(storage);
  const service = new AchievementService(store);

  // Initially before First Play, no powers are unlocked
  assert.equal(service.getEquippedRewardId(), 'none');
  assert.equal(service.getUnlockedRewardIds().length, 0);

  // Milestone 1: First Play achievement -> unlocks Dash (Active)
  const firstPlayNotices = service.recordFirstPlay();
  assert.equal(firstPlayNotices.length, 1);
  assert.equal(firstPlayNotices[0].achievement.achievement_id, 'first_play');
  assert.equal(firstPlayNotices[0].reward.reward_id, 'dash');
  assert.equal(firstPlayNotices[0].reward.category, 'active');
  assert.equal(service.isRewardUnlocked('dash'), true);
  assert.equal(service.getEquippedRewardId(), 'dash');

  // Calling recordFirstPlay again is idempotent (no duplicate unlock)
  assert.equal(service.recordFirstPlay().length, 0);

  // Milestone 2: 100 score -> unlocks Shield (Passive)
  const notices100 = service.evaluateRunScore(100);
  assert.equal(notices100.length, 1);
  assert.equal(notices100[0].achievement.achievement_id, 'score_100');
  assert.equal(notices100[0].reward.reward_id, 'shield');
  assert.equal(notices100[0].reward.category, 'passive');
  assert.equal(service.isRewardUnlocked('shield'), true);

  // Milestone 3: 200 score -> unlocks Time Freeze (Active)
  const notices200 = service.evaluateRunScore(200);
  assert.equal(notices200.length, 1);
  assert.equal(notices200[0].achievement.achievement_id, 'score_200');
  assert.equal(notices200[0].reward.reward_id, 'time_freeze');
  assert.equal(notices200[0].reward.category, 'active');
  assert.equal(service.isRewardUnlocked('time_freeze'), true);

  // Milestone 4: 300 score -> unlocks Magnet (Passive)
  const notices300 = service.evaluateRunScore(300);
  assert.equal(notices300.length, 1);
  assert.equal(notices300[0].achievement.achievement_id, 'score_300');
  assert.equal(notices300[0].reward.reward_id, 'magnet');
  assert.equal(notices300[0].reward.category, 'passive');
  assert.equal(service.isRewardUnlocked('magnet'), true);

  // Milestone 5: 400 score -> unlocks Second Chance (Passive)
  const notices400 = service.evaluateRunScore(400);
  assert.equal(notices400.length, 1);
  assert.equal(notices400[0].achievement.achievement_id, 'score_400');
  assert.equal(notices400[0].reward.reward_id, 'second_chance');
  assert.equal(notices400[0].reward.category, 'passive');
  assert.equal(service.isRewardUnlocked('second_chance'), true);

  // Milestone 6: 500 score -> unlocks Wapres (Active Ultimate)
  const notices500 = service.evaluateRunScore(500);
  assert.equal(notices500.length, 1);
  assert.equal(notices500[0].achievement.achievement_id, 'score_500');
  assert.equal(notices500[0].reward.reward_id, 'wapres');
  assert.equal(notices500[0].reward.category, 'active');
  assert.equal(notices500[0].reward.iconAsset, '/assets/aistudio/wapres_87f4190e.png');
  assert.equal(service.isRewardUnlocked('wapres'), true);
});

test('AchievementService grants each power only once and deduplicates replayed eventIds', () => {
  const storage = new MemoryStorage();
  const store = new LocalProgressStore(storage);
  const service = new AchievementService(store);

  const first = service.recordEvent({
    eventId: 'evt_score_100',
    type: 'score_earned',
    amount: 100,
  });
  assert.equal(first.length, 1);
  assert.equal(first[0].reward.reward_id, 'shield');

  // Replaying the exact same eventId is ignored
  const replay = service.recordEvent({
    eventId: 'evt_score_100',
    type: 'score_earned',
    amount: 100,
  });
  assert.equal(replay.length, 0);

  const score200Ach = service
    .getAchievements()
    .find((a) => a.achievement_id === 'score_200')!;
  assert.equal(score200Ach.progress, 100);
});

test('Multiple score milestones in a single batch unlock together, cycle active powers, and persist across reloads', () => {
  const storage = new MemoryStorage();
  const store1 = new LocalProgressStore(storage);
  const service1 = new AchievementService(store1);

  service1.recordFirstPlay();
  const unlocked = service1.evaluateRunScore(500);
  assert.equal(unlocked.length, 5);
  assert.deepEqual(
    unlocked.map((u) => u.reward.reward_id),
    ['shield', 'time_freeze', 'magnet', 'second_chance', 'wapres']
  );

  assert.equal(service1.getEquippedRewardId(), 'wapres');

  // Cycling active powers cycles through dash -> time_freeze -> wapres
  const cycled = service1.cycleUnlockedPower();
  assert.equal(cycled, 'dash');

  const equipRes = service1.equipReward('wapres');
  assert.equal(equipRes.success, true);

  // Simulate reload
  const store2 = new LocalProgressStore(storage);
  const service2 = new AchievementService(store2);

  assert.equal(service2.getEquippedRewardId(), 'wapres');
  assert.equal(service2.isRewardUnlocked('dash'), true);
  assert.equal(service2.isRewardUnlocked('shield'), true);
  assert.equal(service2.isRewardUnlocked('time_freeze'), true);
  assert.equal(service2.isRewardUnlocked('magnet'), true);
  assert.equal(service2.isRewardUnlocked('second_chance'), true);
  assert.equal(service2.isRewardUnlocked('wapres'), true);
});

test('Locked power abilities cannot be equipped and tampered localStorage is sanitized', () => {
  const storage = new MemoryStorage();
  const store = new LocalProgressStore(storage);
  const service = new AchievementService(store);

  const denied = service.equipReward('wapres');
  assert.equal(denied.success, false);
  assert.equal(service.getEquippedRewardId(), 'none');

  storage.setItem(
    ACHIEVEMENTS_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 2,
      achievements: {
        score_500: { progress: 0, unlocked: true, unlocked_at: '2026-10-21T00:00:00Z' },
      },
      unlockedAchievementIds: ['score_500'],
      unlockedRewardIds: ['wapres'],
      equippedRewardId: 'wapres',
    })
  );

  service.reload();
  assert.equal(service.isRewardUnlocked('wapres'), false);
  assert.equal(service.getEquippedRewardId(), 'none');
});

test('Corrupted localStorage JSON does not crash the game and falls back cleanly', () => {
  const storage = new MemoryStorage();
  storage.setItem(ACHIEVEMENTS_STORAGE_KEY, '{corrupted_json: [123');

  const store = new LocalProgressStore(storage);
  const service = new AchievementService(store);

  assert.equal(service.getAchievements().length, 6);
  assert.equal(service.getEquippedRewardId(), 'none');
  assert.equal(service.recordEvent({ type: 'score_earned', amount: -5 }).length, 0);
  assert.equal(service.recordEvent({ type: 'score_earned', amount: Number.NaN }).length, 0);
});
