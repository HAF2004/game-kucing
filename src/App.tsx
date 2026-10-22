import { useCallback, useEffect, useRef, useState } from 'react';
import { CatSkinId, GameState, RunPowerMap, RunSnapshot, WorldSimulation } from './game/types';
import {
  canActivatePower,
  createEmptyEvents,
  createInitialWorld,
  resizeWorld,
  startNewRun,
  stepWorldSimulation,
  syncUnlockedPowers,
  triggerPowerAbility,
} from './game/rules';
import { WorldCanvasRenderer } from './game/renderer';
import { soundEngine } from './game/audio';
import { TitleOverlay } from './components/TitleOverlay';
import { HudOverlay, HudSnapshot } from './components/HudOverlay';
import { StatusModal } from './components/StatusModal';
import { LeaderboardModal } from './components/LeaderboardModal';
import { AchievementsModal } from './components/AchievementsModal';
import { AchievementToast } from './components/AchievementToast';
import {
  AchievementService,
  AchievementUnlockNotice,
} from './game/achievementService';
import {
  AchievementState,
  CORE_POWER_IDS,
  POWER_ABILITIES,
  PowerAbilityId,
  PowerAbilitySpec,
} from './game/achievementDefinitions';
import {
  ClientLeaderboardData,
  ClientPlayerProfile,
  generateRunIdempotencyKey,
  PlayerApiClient,
} from './game/playerClient';

const BEST_SCORE_STORAGE_KEY = 'kucing_terbang_best_score_v1';
const CHARACTER_SKIN_STORAGE_KEY = 'barudak_terbang_skin_v1';

function readStoredBestScore(): number {
  try {
    const val = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
    return val ? Math.max(0, parseInt(val, 10) || 0) : 0;
  } catch {
    return 0;
  }
}

function saveBestScore(score: number): void {
  try {
    localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(Math.round(score)));
  } catch {
    // ignore storage errors
  }
}

function readStoredSkin(): CatSkinId {
  try {
    const val = localStorage.getItem(CHARACTER_SKIN_STORAGE_KEY);
    return val === 'ninja' ? 'ninja' : 'pirang';
  } catch {
    return 'pirang';
  }
}

function saveStoredSkin(skin: CatSkinId): void {
  try {
    localStorage.setItem(CHARACTER_SKIN_STORAGE_KEY, skin);
  } catch {
    // ignore storage errors
  }
}

function cloneRunPowerMap(powers: RunPowerMap): RunPowerMap {
  const copy = {} as RunPowerMap;
  for (const id of CORE_POWER_IDS) {
    copy[id] = { ...powers[id] };
  }
  return copy;
}

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const achievementServiceRef = useRef<AchievementService | null>(null);
  if (!achievementServiceRef.current) {
    achievementServiceRef.current = new AchievementService();
  }

  const playerClientRef = useRef<PlayerApiClient | null>(null);
  if (!playerClientRef.current) {
    playerClientRef.current = new PlayerApiClient();
  }

  const initialBest = readStoredBestScore();
  const [uiState, setUiState] = useState<GameState>(() =>
    autostart ? 'playing' : 'title'
  );
  const [selectedSkin, setSelectedSkin] = useState<CatSkinId>(() => readStoredSkin());
  const [muted, setMuted] = useState(false);

  // Achievements & 6-Power Progression State
  const [achievements, setAchievements] = useState<AchievementState[]>(() =>
    achievementServiceRef.current!.getAchievements()
  );
  const [rewards, setRewards] = useState<
    Array<
      PowerAbilitySpec & {
        unlocked: boolean;
        equipped: boolean;
        requiredAchievementName?: string;
      }
    >
  >(() => achievementServiceRef.current!.getAllRewardsWithStatus());
  const [equippedRewardId, setEquippedRewardId] = useState<PowerAbilityId>(() =>
    achievementServiceRef.current!.getEquippedRewardId()
  );
  const [unlockNotices, setUnlockNotices] = useState<AchievementUnlockNotice[]>([]);

  // Player Profile & Global Leaderboard State
  const [playerProfile, setPlayerProfile] = useState<ClientPlayerProfile | null>(null);
  const [leaderboardData, setLeaderboardData] = useState<ClientLeaderboardData | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [activeSubModal, setActiveSubModal] = useState<'leaderboard' | 'achievements' | null>(null);
  const playerDataRequestVersionRef = useRef(0);

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    bestScore: initialBest,
    combo: 0,
    hp: 4,
    maxHp: 4,
    dashEnergy: 100,
    dashCooldown: 0,
    powerActive: false,
    dashReady: equippedRewardId !== 'none',
    fishCollected: 0,
  });

  const [modalSnapshot, setModalSnapshot] = useState<RunSnapshot>({
    score: 0,
    bestScore: initialBest,
    fishCollected: 0,
    distanceMeters: 0,
    pipesCleared: 0,
    maxCombo: 0,
    causeOfDefeat: '',
  });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dashBarRef = useRef<HTMLDivElement | null>(null);
  const dashGhostRef = useRef<HTMLDivElement | null>(null);

  const simRef = useRef<WorldSimulation | null>(null);
  const rendererRef = useRef<WorldCanvasRenderer | null>(null);
  const selectedSkinRef = useRef<CatSkinId>(selectedSkin);
  selectedSkinRef.current = selectedSkin;

  const activeSubModalRef = useRef<'leaderboard' | 'achievements' | null>(activeSubModal);
  activeSubModalRef.current = activeSubModal;

  const runStartTimeMsRef = useRef<number>(Date.now());
  const currentRunIdempotencyKeyRef = useRef<string>(generateRunIdempotencyKey('init'));

  // Unified input state hub
  const inputHubRef = useRef({
    keysHeld: new Set<string>(),
    pointerHeld: false,
    flapJustPressed: false,
    flapJustReleased: false,
    dashJustPressed: false,
    activateSkillId: null as PowerAbilityId | null,
    pointerOffset: { x: 0, y: 0 },
  });

  const syncAchievementUiState = useCallback(() => {
    const svc = achievementServiceRef.current;
    if (!svc) return;
    setAchievements(svc.getAchievements());
    setRewards(svc.getAllRewardsWithStatus());
    const eq = svc.getEquippedRewardId();
    // Only allow updating the active equipped skill on the Title screen (start of game).
    // Once a run is in progress, the chosen active skill is locked for that run.
    if (!simRef.current || simRef.current.state === 'title') {
      setEquippedRewardId(eq);
      if (simRef.current) {
        simRef.current.cat.activePower = eq;
        simRef.current.powers.magnet.isActive =
          eq === 'magnet' && simRef.current.powers.magnet.unlocked;
      }
      rendererRef.current?.setEquippedRewardId(eq);
    }
    if (simRef.current) {
      syncUnlockedPowers(simRef.current, svc.getUnlockedRewardIds());
    }
  }, []);

  const pushUnlockNotices = useCallback(
    (notices: AchievementUnlockNotice[]) => {
      if (notices.length === 0) return;
      syncAchievementUiState();
      setUnlockNotices((prev) => [...prev, ...notices]);
      soundEngine.playFishPickup(true);
    },
    [syncAchievementUiState]
  );

  // Auto-dismiss oldest unlock toast after 3.8 seconds
  useEffect(() => {
    if (unlockNotices.length === 0) return;
    const timer = window.setTimeout(() => {
      setUnlockNotices((prev) => prev.slice(1));
    }, 3800);
    return () => window.clearTimeout(timer);
  }, [unlockNotices]);

  const refreshLeaderboardAndProfile = useCallback(async () => {
    const client = playerClientRef.current;
    if (!client) return;
    const requestVersion = ++playerDataRequestVersionRef.current;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const profile = await client.initSession();
      if (requestVersion !== playerDataRequestVersionRef.current) return;
      setPlayerProfile(profile);
      if (profile.best_score > readStoredBestScore()) {
        saveBestScore(profile.best_score);
        if (simRef.current) {
          simRef.current.bestScore = Math.max(simRef.current.bestScore, profile.best_score);
        }
        setHud((prev) => ({
          ...prev,
          bestScore: Math.max(prev.bestScore, profile.best_score),
        }));
      }
      const board = await client.fetchLeaderboard(20, 0);
      if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardData(board);
    } catch (err) {
      if (requestVersion === playerDataRequestVersionRef.current) {
        setLeaderboardError(
          err instanceof Error ? err.message : 'Gagal terhubung ke server papan peringkat.'
        );
      }
    } finally {
      if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLeaderboardAndProfile();
  }, [refreshLeaderboardAndProfile]);

  const handleUpdateUsername = useCallback(async (newUsername: string) => {
    const client = playerClientRef.current;
    if (!client) return;
    const requestVersion = ++playerDataRequestVersionRef.current;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const updatedProfile = await client.updateUsername(newUsername);
      if (requestVersion !== playerDataRequestVersionRef.current) return;
      setPlayerProfile(updatedProfile);
      const board = await client.fetchLeaderboard(20, 0);
      if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardData(board);
    } catch (err) {
      if (requestVersion === playerDataRequestVersionRef.current) {
        setLeaderboardError(err instanceof Error ? err.message : 'Gagal memperbarui username.');
      }
      throw err;
    } finally {
      if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardLoading(false);
    }
  }, []);

  const handleEquipReward = useCallback(
    (rewardId: PowerAbilityId) => {
      // Skills can only be selected at the start of the game (Title screen)
      if (simRef.current && simRef.current.state !== 'title') return;
      const svc = achievementServiceRef.current;
      if (!svc) return;
      const res = svc.equipReward(rewardId);
      if (res.success) {
        syncAchievementUiState();
      }
    },
    [syncAchievementUiState]
  );

  const handleCyclePower = useCallback(() => {
    // Skills can only be cycled at the start of the game (Title screen)
    if (simRef.current && simRef.current.state !== 'title') return;
    const svc = achievementServiceRef.current;
    if (!svc) return;
    svc.cycleUnlockedPower();
    syncAchievementUiState();
  }, [syncAchievementUiState]);

  const handleSelectSkin = useCallback((skinId: CatSkinId) => {
    setSelectedSkin(skinId);
    selectedSkinRef.current = skinId;
    saveStoredSkin(skinId);
    if (simRef.current) {
      simRef.current.skin = skinId;
      simRef.current.cat.earFlapTimer = 0.25;
      simRef.current.cat.scaleX = 0.86;
      simRef.current.cat.scaleY = 1.18;
    }
    soundEngine.playFlap();
  }, []);

  const submitRunToBackend = useCallback(
    async (score: number, fishCollected: number, pipesCleared: number) => {
      const client = playerClientRef.current;
      if (!client) return;
      const durationMs = Math.max(500, Date.now() - runStartTimeMsRef.current);
      const idempotencyKey = currentRunIdempotencyKeyRef.current;
      const requestVersion = ++playerDataRequestVersionRef.current;
      setLeaderboardLoading(true);
      try {
        const res = await client.submitRunScore({
          idempotencyKey,
          score: Math.round(score),
          fishCollected: Math.round(fishCollected),
          pipesCleared: Math.round(pipesCleared),
          durationMs,
        });
        if (requestVersion !== playerDataRequestVersionRef.current) return;
        setPlayerProfile(res.profile);
        const board = await client.fetchLeaderboard(20, 0);
        if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardData(board);
      } catch {
        // Non-fatal if offline or rejected
      } finally {
        if (requestVersion === playerDataRequestVersionRef.current) setLeaderboardLoading(false);
      }
    },
    []
  );

  const syncBodyState = useCallback((nextState: GameState) => {
    document.body.dataset.state = nextState;
    setUiState(nextState);
  }, []);

  const clearHeldInputs = useCallback(() => {
    inputHubRef.current.keysHeld.clear();
    inputHubRef.current.pointerHeld = false;
    inputHubRef.current.flapJustPressed = false;
    inputHubRef.current.flapJustReleased = false;
    inputHubRef.current.dashJustPressed = false;
    inputHubRef.current.activateSkillId = null;
  }, []);

  const handleStartOrRestart = useCallback(
    (skinOverride?: CatSkinId) => {
      const sim = simRef.current;
      const svc = achievementServiceRef.current;
      if (!sim) return;

      // Unlock First Play achievement (Dash) when starting a run!
      if (svc) {
        const firstPlayNotices = svc.recordFirstPlay();
        if (firstPlayNotices.length > 0) {
          pushUnlockNotices(firstPlayNotices);
        }
      }

      const skinToUse = skinOverride ?? selectedSkinRef.current;
      // Preserve the skill selected on the Title screen (or default to newly unlocked Dash on very first run)
      const eqPower = svc?.getEquippedRewardId() ?? 'none';
      const unlockedList = svc?.getUnlockedRewardIds() ?? [];

      setEquippedRewardId(eqPower);
      rendererRef.current?.setEquippedRewardId(eqPower);

      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setActiveSubModal(null);
      clearHeldInputs();
      startNewRun(sim, skinToUse, eqPower, unlockedList);
      runStartTimeMsRef.current = Date.now();
      currentRunIdempotencyKeyRef.current = generateRunIdempotencyKey(
        playerClientRef.current?.getPlayerId() ?? 'local'
      );

      if (rendererRef.current) {
        const nextWeather = rendererRef.current.randomizeWeather();
        document.body.dataset.weather = nextWeather;
      }
      syncBodyState('playing');
      setHud({
        score: 0,
        bestScore: sim.bestScore,
        combo: 0,
        hp: sim.cat.hp,
        maxHp: sim.cat.maxHp,
        dashEnergy: 100,
        dashCooldown: 0,
        powerActive: false,
        dashReady: canActivatePower(sim, eqPower),
        fishCollected: 0,
        powers: cloneRunPowerMap(sim.powers),
      });
      soundEngine.playFlap();
      canvasRef.current?.focus();
    },
    [clearHeldInputs, pushUnlockNotices, syncBodyState]
  );

  const handleTogglePause = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    if (sim.state === 'playing') {
      clearHeldInputs();
      sim.state = 'paused';
      setModalSnapshot({
        score: Math.round(sim.score),
        bestScore: Math.round(sim.bestScore),
        fishCollected: sim.fishCollected,
        distanceMeters: Math.max(1, Math.round(sim.distancePx / 45)),
        pipesCleared: sim.pipesCleared,
        maxCombo: sim.maxCombo,
        causeOfDefeat: 'Permainan Dijeda',
      });
      syncBodyState('paused');
    } else if (sim.state === 'paused') {
      setActiveSubModal(null);
      clearHeldInputs();
      sim.state = 'playing';
      syncBodyState('playing');
      canvasRef.current?.focus();
    }
  }, [clearHeldInputs, syncBodyState]);

  const handleReturnTitle = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    setActiveSubModal(null);
    clearHeldInputs();
    sim.state = 'title';
    syncBodyState('title');
    syncAchievementUiState();
  }, [clearHeldInputs, syncAchievementUiState, syncBodyState]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleTriggerDashFromHud = useCallback(() => {
    const sim = simRef.current;
    const renderer = rendererRef.current;
    if (!sim || sim.state !== 'playing') return;
    const ev = createEmptyEvents();
    const targetPower = sim.cat.activePower;
    if (targetPower !== 'none' && triggerPowerAbility(sim, ev, targetPower)) {
      soundEngine.dispatchSimulationEvents(ev);
      renderer?.emitFromEvents(sim, ev);
    }
  }, []);

  // Mount Canvas & 60 FPS loop once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const svc = achievementServiceRef.current;
    if (autostart && svc) {
      const notices = svc.recordFirstPlay();
      if (notices.length > 0) {
        pushUnlockNotices(notices);
      }
    }

    const initialEqReward = svc?.getEquippedRewardId() ?? 'none';
    const initialUnlocked = svc?.getUnlockedRewardIds() ?? [];

    const sim = createInitialWorld(
      window.innerWidth,
      window.innerHeight,
      selectedSkinRef.current,
      readStoredBestScore(),
      initialEqReward,
      initialUnlocked
    );
    simRef.current = sim;

    const queryWeather = new URLSearchParams(window.location.search).get('weather');
    const validWeather =
      queryWeather === 'cherry_blossoms' ||
      queryWeather === 'twinkling_stars' ||
      queryWeather === 'firefly_breeze'
        ? queryWeather
        : undefined;
    const renderer = new WorldCanvasRenderer(validWeather, initialEqReward);
    rendererRef.current = renderer;
    document.body.dataset.weather = renderer.getCurrentWeather();

    if (autostart) {
      startNewRun(sim, selectedSkinRef.current, initialEqReward, initialUnlocked);
      runStartTimeMsRef.current = Date.now();
      currentRunIdempotencyKeyRef.current = generateRunIdempotencyKey(
        playerClientRef.current?.getPlayerId() ?? 'local'
      );
      document.body.dataset.state = 'playing';
    } else {
      document.body.dataset.state = 'title';
    }

    const updateCanvasBounds = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(320, Math.round(rect.width || window.innerWidth));
      const h = Math.max(420, Math.round(rect.height || window.innerHeight));
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      resizeWorld(sim, w, h);
    };

    updateCanvasBounds();
    const resizeObs = new ResizeObserver(() => updateCanvasBounds());
    resizeObs.observe(canvas);

    // Unified Keyboard & Pointer Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        if (e.code === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      const code = e.code;
      const key = e.key.toLowerCase();

      if (activeSubModalRef.current !== null) {
        if (code === 'Escape') {
          e.preventDefault();
          setActiveSubModal(null);
        }
        return;
      }

      if (sim.state === 'title') {
        if (key === 'q') {
          e.preventDefault();
          handleCyclePower();
          return;
        }
        if (code === 'Space' || code === 'Enter') {
          e.preventDefault();
          handleStartOrRestart();
        }
        return;
      }

      if (sim.state === 'gameover') {
        if (code === 'Space' || code === 'Enter') {
          e.preventDefault();
          handleStartOrRestart();
        }
        return;
      }

      if (code === 'Escape' || key === 'p') {
        e.preventDefault();
        handleTogglePause();
        return;
      }

      if (key === 'm') {
        e.preventDefault();
        handleToggleMute();
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        handleStartOrRestart();
        return;
      }

      if (sim.state !== 'playing') return;

      const isFlapKey = code === 'Space' || code === 'ArrowUp' || key === 'w';
      const isPrimaryPowerKey =
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        key === 'k' ||
        code === 'ArrowRight' ||
        key === 'd' ||
        key === 'e' ||
        key === 'f' ||
        key === '1';

      if (isFlapKey) {
        e.preventDefault();
        if (!inputHubRef.current.keysHeld.has('flap')) {
          inputHubRef.current.keysHeld.add('flap');
          inputHubRef.current.flapJustPressed = true;
        }
      }

      if (isPrimaryPowerKey) {
        e.preventDefault();
        if (!inputHubRef.current.keysHeld.has('dash')) {
          inputHubRef.current.keysHeld.add('dash');
          inputHubRef.current.dashJustPressed = true;
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const code = e.code;
      const key = e.key.toLowerCase();
      if (code === 'Space' || code === 'ArrowUp' || key === 'w') {
        if (inputHubRef.current.keysHeld.has('flap')) {
          inputHubRef.current.keysHeld.delete('flap');
          inputHubRef.current.flapJustReleased = true;
        }
      }
      if (
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        key === 'k' ||
        code === 'ArrowRight' ||
        key === 'd' ||
        key === 'e' ||
        key === 'f' ||
        key === '1'
      ) {
        inputHubRef.current.keysHeld.delete('dash');
      }
    };

    const onBlurOrVisibility = () => {
      clearHeldInputs();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlurOrVisibility);
    document.addEventListener('visibilitychange', onBlurOrVisibility);

    let rafId = 0;
    let lastTime = performance.now();
    let lastHudScore = -1;
    let lastHudHp = -1;
    let lastHudCombo = -1;
    let lastHudFish = -1;
    let lastHudCooldownCeil = -1;
    let lastPowerActive = false;
    let lastDashReady = false;
    let lastPowerSummarySig = '';

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      const prevScore = sim.score;
      const hub = inputHubRef.current;
      const events = stepWorldSimulation(sim, dt, {
        flapJustPressed: hub.flapJustPressed,
        flapHeld: hub.keysHeld.has('flap') || hub.pointerHeld,
        flapJustReleased: hub.flapJustReleased,
        dashJustPressed: hub.dashJustPressed,
        activateSkillId: hub.activateSkillId,
      });

      // Consume single-frame edge triggers
      hub.flapJustPressed = false;
      hub.flapJustReleased = false;
      hub.dashJustPressed = false;
      hub.activateSkillId = null;

      // Event-driven Achievement & Score Milestone Tracking (First Play, 100..500 Score)
      const achSvc = achievementServiceRef.current;
      if (achSvc && sim.state === 'playing') {
        const unlockedBatch: AchievementUnlockNotice[] = [];

        if (events.collectedFish || events.collectedGoldenFish) {
          unlockedBatch.push(
            ...achSvc.recordEvent({
              type: 'fish_collected',
              amount: 1,
            })
          );
        }

        if (events.scoredPipe) {
          unlockedBatch.push(
            ...achSvc.recordEvent({
              type: 'pipe_cleared',
              amount: 1,
            })
          );
        }

        const scoreDelta = Math.max(0, Math.round(sim.score - prevScore));
        if (scoreDelta > 0) {
          unlockedBatch.push(
            ...achSvc.recordEvent({
              type: 'score_earned',
              amount: scoreDelta,
            })
          );
          unlockedBatch.push(...achSvc.evaluateRunScore(sim.score));
        }

        if (unlockedBatch.length > 0) {
          syncUnlockedPowers(sim, achSvc.getUnlockedRewardIds());
          pushUnlockNotices(unlockedBatch);
        } else if (
          scoreDelta > 0 ||
          events.collectedFish ||
          events.collectedGoldenFish ||
          events.scoredPipe
        ) {
          setAchievements(achSvc.getAchievements());
        }
      }

      // Audio & particle juice
      soundEngine.dispatchSimulationEvents(events);
      renderer.emitFromEvents(sim, events);

      // Update continuous Power bar via DOM refs at 60fps without React re-renders
      const pct = `${sim.cat.activePower === 'none' ? 0 : Math.round(sim.cat.dashEnergy)}%`;
      if (dashBarRef.current) {
        dashBarRef.current.style.width = pct;
      }
      if (dashGhostRef.current) {
        dashGhostRef.current.style.width = pct;
      }

      // Throttle React HUD state updates strictly to discrete integer/state changes
      if (sim.state === 'playing') {
        const powerActive =
          sim.powers.dash.isActive ||
          sim.powers.time_freeze.isActive ||
          sim.powers.wapres.isActive;
        const dashReady = canActivatePower(sim, sim.cat.activePower);
        const cooldownCeil = Math.ceil(Math.max(0, sim.cat.dashCooldown));
        const powerSummarySig = CORE_POWER_IDS.map((id) => {
          const p = sim.powers[id];
          return `${id}:${p.unlocked ? 1 : 0}:${p.isActive ? 1 : 0}:${Math.round(
            p.remainingDuration * 10
          )}:${Math.round(p.remainingCooldown * 10)}:${p.chargesRemaining}`;
        }).join('|');

        if (
          sim.score !== lastHudScore ||
          sim.cat.hp !== lastHudHp ||
          sim.combo !== lastHudCombo ||
          sim.fishCollected !== lastHudFish ||
          dashReady !== lastDashReady ||
          powerActive !== lastPowerActive ||
          cooldownCeil !== lastHudCooldownCeil ||
          powerSummarySig !== lastPowerSummarySig
        ) {
          lastHudScore = sim.score;
          lastHudHp = sim.cat.hp;
          lastHudCombo = sim.combo;
          lastHudFish = sim.fishCollected;
          lastDashReady = dashReady;
          lastPowerActive = powerActive;
          lastHudCooldownCeil = cooldownCeil;
          lastPowerSummarySig = powerSummarySig;

          if (sim.bestScore > readStoredBestScore()) {
            saveBestScore(sim.bestScore);
          }
          setHud({
            score: sim.score,
            bestScore: sim.bestScore,
            combo: sim.combo,
            hp: sim.cat.hp,
            maxHp: sim.cat.maxHp,
            dashEnergy: sim.cat.dashEnergy,
            dashCooldown: sim.cat.dashCooldown,
            powerActive,
            dashReady,
            fishCollected: sim.fishCollected,
            powers: cloneRunPowerMap(sim.powers),
          });
        }
      }

      if (events.gameOverTriggered) {
        saveBestScore(sim.bestScore);
        setModalSnapshot({ ...sim.snapshot });
        syncBodyState('gameover');
        void submitRunToBackend(
          sim.snapshot.score,
          sim.snapshot.fishCollected,
          sim.snapshot.pipesCleared
        );
      }

      renderer.updateAndDraw(ctx, sim, dt, hub.pointerOffset);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObs.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlurOrVisibility);
      document.removeEventListener('visibilitychange', onBlurOrVisibility);
    };
  }, [
    autostart,
    clearHeldInputs,
    handleCyclePower,
    handleStartOrRestart,
    handleToggleMute,
    handleTogglePause,
    pushUnlockNotices,
    submitRunToBackend,
    syncBodyState,
  ]);

  const unlockedAchievementsCount = achievements.filter((a) => a.unlocked).length;
  const equippedPowerSpec = POWER_ABILITIES[equippedRewardId] ?? POWER_ABILITIES.none;

  return (
    <main className="relative w-screen h-[100dvh] min-h-[100svh] overflow-hidden bg-[#181425] select-none">
      {/* Isolated Full-Viewport 60 FPS Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-testid="game-canvas"
        aria-label="Kanvas Permainan Barudak Terbang"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          const ny = ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
          inputHubRef.current.pointerOffset = { x: nx, y: ny };
        }}
        onPointerDown={(e) => {
          if (simRef.current?.state === 'playing') {
            if (e.button === 2) {
              inputHubRef.current.dashJustPressed = true;
            } else {
              inputHubRef.current.pointerHeld = true;
              inputHubRef.current.flapJustPressed = true;
            }
          }
        }}
        onPointerUp={() => {
          if (inputHubRef.current.pointerHeld) {
            inputHubRef.current.pointerHeld = false;
            inputHubRef.current.flapJustReleased = true;
          }
        }}
        onContextMenu={(e) => e.preventDefault()}
        className="block w-full h-full outline-none cursor-pointer"
      />

      {/* Non-blocking Achievement Unlock Notification */}
      <AchievementToast notices={unlockNotices} />

      {/* State-Driven Overlays */}
      {uiState === 'title' && (
        <TitleOverlay
          selectedSkin={selectedSkin}
          onSelectSkin={handleSelectSkin}
          equippedRewardId={equippedRewardId}
          rewards={rewards}
          unlockedAchievementsCount={unlockedAchievementsCount}
          totalAchievementsCount={achievements.length}
          playerUsername={playerProfile?.username ?? 'Barudak_Atap'}
          playerRank={leaderboardData?.currentPlayer?.rank ?? playerProfile?.rank}
          bestScore={Math.max(hud.bestScore, playerProfile?.best_score ?? 0)}
          onEquipReward={handleEquipReward}
          onOpenLeaderboard={() => {
            void refreshLeaderboardAndProfile();
            setActiveSubModal('leaderboard');
          }}
          onOpenAchievements={() => {
            syncAchievementUiState();
            setActiveSubModal('achievements');
          }}
          onStartGame={() => handleStartOrRestart()}
        />
      )}

      {(uiState === 'playing' || uiState === 'paused') && (
        <HudOverlay
          hud={hud}
          muted={muted}
          equippedPower={equippedPowerSpec}
          dashBarRef={dashBarRef}
          dashGhostRef={dashGhostRef}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onRestart={() => handleStartOrRestart()}
          onTriggerDash={handleTriggerDashFromHud}
        />
      )}

      {(uiState === 'paused' || uiState === 'gameover') && !activeSubModal && (
        <StatusModal
          mode={uiState}
          snapshot={modalSnapshot}
          playerRank={leaderboardData?.currentPlayer?.rank ?? playerProfile?.rank}
          onResume={uiState === 'paused' ? handleTogglePause : undefined}
          onRestart={() => handleStartOrRestart()}
          onReturnTitle={handleReturnTitle}
          onOpenLeaderboard={() => {
            void refreshLeaderboardAndProfile();
            setActiveSubModal('leaderboard');
          }}
          onOpenAchievements={() => {
            syncAchievementUiState();
            setActiveSubModal('achievements');
          }}
        />
      )}

      {/* Global Leaderboard & Profile Modal */}
      {activeSubModal === 'leaderboard' && (
        <LeaderboardModal
          profile={playerProfile}
          leaderboard={leaderboardData}
          loading={leaderboardLoading}
          error={leaderboardError}
          onRetry={() => void refreshLeaderboardAndProfile()}
          onUpdateUsername={handleUpdateUsername}
          onClose={() => setActiveSubModal(null)}
        />
      )}

      {/* Achievements & Power Abilities Modal */}
      {activeSubModal === 'achievements' && (
        <AchievementsModal
          achievements={achievements}
          rewards={rewards}
          canSelectSkill={uiState === 'title'}
          onEquipReward={handleEquipReward}
          onClose={() => setActiveSubModal(null)}
        />
      )}
    </main>
  );
}
