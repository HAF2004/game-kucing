import { useCallback, useEffect, useRef, useState } from 'react';
import { CAT_SKINS, CatSkinId, GameState, RunSnapshot, WorldSimulation } from './game/types';
import {
  createInitialWorld,
  resizeWorld,
  startNewRun,
  stepWorldSimulation,
  triggerPurrDash,
  createEmptyEvents,
} from './game/rules';
import { WorldCanvasRenderer } from './game/renderer';
import { soundEngine } from './game/audio';
import { TitleOverlay } from './components/TitleOverlay';
import { HudOverlay, HudSnapshot } from './components/HudOverlay';
import { StatusModal } from './components/StatusModal';

const BEST_SCORE_STORAGE_KEY = 'kucing_terbang_best_score_v1';

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

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const initialBest = readStoredBestScore();
  const [uiState, setUiState] = useState<GameState>(() =>
    autostart ? 'playing' : 'title'
  );
  const initialSkin = ((): CatSkinId => {
    if (typeof window === 'undefined') return 'oyen';
    const q = new URLSearchParams(window.location.search).get('skin');
    if (q === 'oyen' || q === 'mochi' || q === 'kopi' || q === 'pirang') return q;
    return 'oyen';
  })();

  const [selectedSkin, setSelectedSkin] = useState<CatSkinId>(initialSkin);
  const [muted, setMuted] = useState(false);

  const [hud, setHud] = useState<HudSnapshot>({
    score: 0,
    bestScore: initialBest,
    combo: 0,
    hp: initialSkin === 'pirang' ? 4 : 3,
    maxHp: initialSkin === 'pirang' ? 4 : 3,
    dashEnergy: 100,
    dashReady: true,
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

  // Unified input state hub
  const inputHubRef = useRef({
    keysHeld: new Set<string>(),
    pointerHeld: false,
    flapJustPressed: false,
    flapJustReleased: false,
    dashJustPressed: false,
    pointerOffset: { x: 0, y: 0 },
  });

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
  }, []);

  const handleStartOrRestart = useCallback(
    (skinOverride?: CatSkinId) => {
      const sim = simRef.current;
      if (!sim) return;
      const skinToUse = skinOverride ?? selectedSkinRef.current;
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      clearHeldInputs();
      startNewRun(sim, skinToUse);
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
        dashReady: true,
        fishCollected: 0,
      });
      soundEngine.playFlap();
      canvasRef.current?.focus();
    },
    [clearHeldInputs, syncBodyState]
  );

  const handleSelectSkin = useCallback((skin: CatSkinId) => {
    setSelectedSkin(skin);
    selectedSkinRef.current = skin;
    if (simRef.current) {
      simRef.current.skin = skin;
    }
  }, []);

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
      clearHeldInputs();
      sim.state = 'playing';
      syncBodyState('playing');
      canvasRef.current?.focus();
    }
  }, [clearHeldInputs, syncBodyState]);

  const handleReturnTitle = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return;
    clearHeldInputs();
    sim.state = 'title';
    syncBodyState('title');
  }, [clearHeldInputs, syncBodyState]);

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
    if (triggerPurrDash(sim, ev)) {
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

    const sim = createInitialWorld(
      window.innerWidth,
      window.innerHeight,
      selectedSkinRef.current,
      readStoredBestScore()
    );
    simRef.current = sim;

    const queryWeather = new URLSearchParams(window.location.search).get('weather');
    const validWeather =
      queryWeather === 'cherry_blossoms' ||
      queryWeather === 'twinkling_stars' ||
      queryWeather === 'firefly_breeze'
        ? queryWeather
        : undefined;
    const renderer = new WorldCanvasRenderer(validWeather);
    rendererRef.current = renderer;
    document.body.dataset.weather = renderer.getCurrentWeather();

    if (autostart) {
      startNewRun(sim, selectedSkinRef.current);
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
      const code = e.code;
      const key = e.key.toLowerCase();

      // Cat skin quick keys 1/2/3/4 on Title Screen
      if (sim.state === 'title') {
        if (key === '1') handleSelectSkin(CAT_SKINS[0].id);
        if (key === '2') handleSelectSkin(CAT_SKINS[1].id);
        if (key === '3') handleSelectSkin(CAT_SKINS[2].id);
        if (key === '4') handleSelectSkin(CAT_SKINS[3].id);
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

      const isFlapKey =
        code === 'Space' ||
        code === 'ArrowUp' ||
        key === 'w';
      const isDashKey =
        code === 'ShiftLeft' ||
        code === 'ShiftRight' ||
        key === 'k' ||
        code === 'ArrowRight' ||
        key === 'd';

      if (isFlapKey) {
        e.preventDefault();
        if (!inputHubRef.current.keysHeld.has('flap')) {
          inputHubRef.current.keysHeld.add('flap');
          inputHubRef.current.flapJustPressed = true;
        }
      }

      if (isDashKey) {
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
        key === 'd'
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
    let lastDashReady = true;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      const hub = inputHubRef.current;
      const events = stepWorldSimulation(sim, dt, {
        flapJustPressed: hub.flapJustPressed,
        flapHeld: hub.keysHeld.has('flap') || hub.pointerHeld,
        flapJustReleased: hub.flapJustReleased,
        dashJustPressed: hub.dashJustPressed,
      });

      // Consume single-frame edge triggers
      hub.flapJustPressed = false;
      hub.flapJustReleased = false;
      hub.dashJustPressed = false;

      // Audio & particle juice
      soundEngine.dispatchSimulationEvents(events);
      renderer.emitFromEvents(sim, events);

      // Update continuous Dash bar via DOM refs at 60fps without React re-renders
      const pct = `${Math.round(sim.cat.dashEnergy)}%`;
      if (dashBarRef.current) {
        dashBarRef.current.style.width = pct;
      }
      if (dashGhostRef.current) {
        dashGhostRef.current.style.width = pct;
      }

      // Throttle React HUD state updates strictly to discrete integer/state changes
      if (sim.state === 'playing') {
        const dashReady = sim.cat.dashEnergy >= 35 && sim.cat.dashCooldown <= 0;
        if (
          sim.score !== lastHudScore ||
          sim.cat.hp !== lastHudHp ||
          sim.combo !== lastHudCombo ||
          sim.fishCollected !== lastHudFish ||
          dashReady !== lastDashReady
        ) {
          lastHudScore = sim.score;
          lastHudHp = sim.cat.hp;
          lastHudCombo = sim.combo;
          lastHudFish = sim.fishCollected;
          lastDashReady = dashReady;
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
            dashReady,
            fishCollected: sim.fishCollected,
          });
        }
      }

      if (events.gameOverTriggered) {
        saveBestScore(sim.bestScore);
        setModalSnapshot({ ...sim.snapshot });
        syncBodyState('gameover');
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
    handleSelectSkin,
    handleStartOrRestart,
    handleToggleMute,
    handleTogglePause,
    syncBodyState,
  ]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#181425] select-none">
      {/* Isolated Full-Viewport 60 FPS Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        data-testid="game-canvas"
        aria-label="Kanvas Permainan Kucing Terbang"
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

      {/* State-Driven Overlays */}
      {uiState === 'title' && (
        <TitleOverlay
          selectedSkin={selectedSkin}
          bestScore={hud.bestScore}
          onSelectSkin={handleSelectSkin}
          onStartGame={() => handleStartOrRestart()}
        />
      )}

      {(uiState === 'playing' || uiState === 'paused') && (
        <HudOverlay
          hud={hud}
          muted={muted}
          dashBarRef={dashBarRef}
          dashGhostRef={dashGhostRef}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onRestart={() => handleStartOrRestart()}
          onTriggerDash={handleTriggerDashFromHud}
        />
      )}

      {(uiState === 'paused' || uiState === 'gameover') && (
        <StatusModal
          mode={uiState}
          snapshot={modalSnapshot}
          onResume={uiState === 'paused' ? handleTogglePause : undefined}
          onRestart={() => handleStartOrRestart()}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
