import React from 'react';
import {
  CorePowerId,
  PASSIVE_POWER_IDS,
  POWER_ABILITIES,
  PowerAbilityId,
  PowerAbilitySpec,
} from '../game/achievementDefinitions';
import { RunPowerMap } from '../game/types';
import { PowerIcon } from './PowerIcon';

export interface HudSnapshot {
  score: number;
  bestScore: number;
  combo: number;
  hp: number;
  maxHp: number;
  dashEnergy: number;
  dashCooldown: number;
  powerActive: boolean;
  dashReady: boolean;
  fishCollected: number;
  powers?: RunPowerMap;
}

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  equippedPower: PowerAbilitySpec;
  dashBarRef: React.RefObject<HTMLDivElement | null>;
  dashGhostRef: React.RefObject<HTMLDivElement | null>;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onTriggerDash: (powerId?: PowerAbilityId) => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  muted,
  equippedPower,
  dashBarRef,
  dashGhostRef,
  onToggleMute,
  onTogglePause,
  onRestart,
  onTriggerDash,
}) => {
  const isPowerSelected = equippedPower.reward_id !== 'none';
  const isManualPower = equippedPower.category === 'active';
  const selectedRuntime =
    equippedPower.reward_id !== 'none' ? hud.powers?.[equippedPower.reward_id as CorePowerId] : undefined;
  const isPowerUnlocked = Boolean(isPowerSelected && selectedRuntime?.unlocked);
  const energyPct = Math.round(hud.dashEnergy);

  const formatChosenActiveSkillState = (): {
    ready: boolean;
    active: boolean;
    unlocked: boolean;
    statusText: string;
  } => {
    if (!isPowerSelected) {
      return {
        ready: false,
        active: false,
        unlocked: false,
        statusText: 'BELUM DIPILIH',
      };
    }
    const id = equippedPower.reward_id as CorePowerId;
    const p = selectedRuntime;
    if (!p || !p.unlocked) {
      return {
        ready: false,
        active: false,
        unlocked: false,
        statusText:
          equippedPower.unlockScore === 0
            ? 'First Play'
            : `${equippedPower.unlockScore} Skor`,
      };
    }
    if (!isManualPower) {
      return {
        ready: false,
        active: p.isActive,
        unlocked: true,
        statusText:
          id === 'magnet'
            ? 'AKTIF PASIF'
            : p.chargesRemaining > 0
            ? `SIAP (${p.chargesRemaining}/1)`
            : 'TERPAKAI',
      };
    }
    if (p.isActive && p.remainingDuration > 0) {
      return {
        ready: false,
        active: true,
        unlocked: true,
        statusText: `AKTIF ${p.remainingDuration.toFixed(1)}s`,
      };
    }
    if (p.maxChargesPerRun !== null && p.chargesRemaining <= 0) {
      return {
        ready: false,
        active: false,
        unlocked: true,
        statusText: 'HABIS (0/1)',
      };
    }
    if (p.remainingCooldown > 0) {
      return {
        ready: false,
        active: false,
        unlocked: true,
        statusText: `CD ${Math.ceil(p.remainingCooldown)}s`,
      };
    }
    return {
      ready: true,
      active: false,
      unlocked: true,
      statusText: p.maxChargesPerRun !== null ? `SIAP (${p.chargesRemaining}/1)` : 'SIAP!',
    };
  };

  const formatPassiveSkillBadge = (id: CorePowerId): {
    unlocked: boolean;
    available: boolean;
    label: string;
  } => {
    const p = hud.powers?.[id];
    const spec = POWER_ABILITIES[id];
    if (!p || !p.unlocked) {
      return {
        unlocked: false,
        available: false,
        label: `${spec.shortName}: ${spec.unlockScore}`,
      };
    }
    if (id === 'magnet') {
      return {
        unlocked: true,
        available: true,
        label: 'Magnet: AKTIF',
      };
    }
    const hasCharge = p.chargesRemaining > 0;
    return {
      unlocked: true,
      available: hasCharge,
      label: `${spec.shortName}: ${hasCharge ? 'SIAP (1/1)' : 'TERPAKAI'}`,
    };
  };

  const chosenSkillState = formatChosenActiveSkillState();

  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-2.5 sm:p-3.5 md:p-6"
      aria-label="HUD Permainan Barudak Terbang"
    >
      {/* Top Perimeter Bar: 3-Column Grid guarantees zero overlap and zero right-edge clipping */}
      <div className="grid grid-cols-3 items-start w-full gap-1.5 sm:gap-2 md:gap-4">
        {/* Column 1 (Top-Left): Vitality Sockets + Passive Skills Status Strip + Single Chosen Active Skill */}
        <div className="justify-self-start flex flex-col gap-1.5 min-w-0">
          <div
            className="inline-flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-1.5 bg-[#181425]/85 border-2 border-[#362452] rounded-xl px-2 py-1 sm:px-2.5 sm:py-1.5 shadow-[0_3px_0_#181425] w-fit"
            aria-label={`Nyawa Barudak: ${hud.hp} dari ${hud.maxHp}`}
          >
            <span className="text-[9px] sm:text-[10px] md:text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A] leading-none">
              NYAWA
            </span>
            <div className="flex items-center gap-1 sm:gap-1.5">
              {Array.from({ length: hud.maxHp }).map((_, i) => {
                const state: 'full' | 'cracked' | 'empty' =
                  i < hud.hp
                    ? i === hud.hp - 1 && hud.hp === 1
                      ? 'cracked'
                      : 'full'
                    : 'empty';
                return (
                  <svg
                    key={i}
                    viewBox="0 0 28 28"
                    className="w-4 h-4 sm:w-5 sm:h-5 md:w-6 md:h-6 shrink-0 drop-shadow-[0_1px_0_#181425]"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 24 C7 20 3 14 3 9.5 C3 6 5.8 3.5 9 3.5 C11.2 3.5 13 4.8 14 6.5 C15 4.8 16.8 3.5 19 3.5 C22.2 3.5 25 6 25 9.5 C25 14 21 20 14 24 Z"
                      fill={
                        state === 'full'
                          ? '#F43F5E'
                          : state === 'cracked'
                          ? '#FB923C'
                          : '#261B3A'
                      }
                      stroke="#181425"
                      strokeWidth="2.8"
                    />
                    {state === 'full' && (
                      <circle cx="9.5" cy="9" r="2.2" fill="#FFE4E6" />
                    )}
                    {state === 'cracked' && (
                      <path
                        d="M14 6 L12 12 L16 15 L13 22"
                        stroke="#181425"
                        strokeWidth="2.2"
                        fill="none"
                      />
                    )}
                  </svg>
                );
              })}
            </div>
          </div>

          {/* Passive Skills Status Strip (Shield 100, Magnet 300, Second Chance 400) — Status-only, no manual button */}
          <div
            data-testid="hud-passive-skills"
            className="hidden sm:flex flex-wrap items-center gap-1 max-w-[260px] sm:max-w-none"
            aria-label="Status Skill Pasif"
          >
            {PASSIVE_POWER_IDS.map((pid) => {
              const badge = formatPassiveSkillBadge(pid);
              const spec = POWER_ABILITIES[pid];
              return (
                <div
                  key={pid}
                  data-testid={`passive-badge-${pid}`}
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-[9px] sm:text-[10px] font-extrabold font-mono-tabular whitespace-nowrap ${
                    !badge.unlocked
                      ? 'bg-[#181425]/70 border-[#362452] text-[#94A3B8] opacity-75'
                      : badge.available
                      ? 'bg-[#181425]/95 border-[#FACC15] text-[#FFF8E7]'
                      : 'bg-[#181425]/85 border-[#475569] text-[#94A3B8]'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      backgroundColor:
                        badge.unlocked && badge.available ? spec.primaryColor : '#475569',
                    }}
                  />
                  <span>{badge.label}</span>
                </div>
              );
            })}
          </div>

          {/* Desktop single selected power control (locked at game start). */}
          <div className="hidden md:flex items-center gap-2 pointer-events-auto">
            <button
              type="button"
              tabIndex={-1}
              data-testid="desktop-equipped-skill-btn"
              disabled={!chosenSkillState.ready}
              onClick={(e) => {
                e.currentTarget.blur();
                if (chosenSkillState.ready) {
                  onTriggerDash(equippedPower.reward_id);
                }
              }}
              aria-label={`Aktifkan Skill Pilihan ${equippedPower.shortName} [Shift / E]`}
              className={`relative w-[4.5rem] h-[4.5rem] shrink-0 rounded-full border-[3px] border-[#181425] shadow-[0_4px_0_#181425] flex items-center justify-center transition-transform cursor-pointer disabled:cursor-default ${
                chosenSkillState.active
                  ? 'bg-[#362452] ring-2 ring-[#FACC15]'
                  : chosenSkillState.ready
                  ? 'bg-[#261B3A] hover:bg-[#362452] ring-1 ring-[#FDE047]'
                  : 'bg-[#181425]/85 opacity-80'
              }`}
            >
              <span
                className="absolute inset-0 rounded-full"
                style={{
                  background: `conic-gradient(${equippedPower.primaryColor || '#F97316'} ${isManualPower ? energyPct : 100}%, #362452 0)`,
                }}
                aria-hidden="true"
              />
              <span className="relative rounded-full bg-[#181425] p-1">
                <PowerIcon power={equippedPower} size="lg" />
              </span>
              <span className="absolute -right-2 -bottom-1 px-1.5 py-0.5 rounded-full bg-[#181126] border border-[#FACC15] text-[9px] font-mono-tabular font-extrabold text-[#34D399] whitespace-nowrap">
                {chosenSkillState.statusText}
              </span>
              <span ref={dashGhostRef} className="hidden" aria-hidden="true" />
              <span ref={dashBarRef} className="hidden" aria-hidden="true" />
            </button>
            <div className="min-w-0 max-w-[10rem]">
              <div className="text-[11px] font-extrabold text-[#FFF8E7] truncate">
                {isPowerUnlocked ? equippedPower.shortName : 'Tanpa Power'}
              </div>
              <div className="text-[9px] font-extrabold text-[#FDE68A]">
                {isManualPower ? '[SHIFT / E] AKTIFKAN' : 'PASIF · TERPILIH'}
              </div>
            </div>
          </div>
        </div>

        {/* Column 2 (Top-Center): Hero Score Readout */}
        <div className="justify-self-center flex flex-col items-center text-center min-w-0">
          <span className="text-[10px] md:text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A] hud-stroke-sm whitespace-nowrap">
            SKOR ATAP
          </span>
          <div
            className="text-3xl sm:text-4xl md:text-5xl font-extrabold font-mono-tabular text-[#FFF8E7] hud-stroke leading-none mt-0.5"
            data-testid="hud-score"
          >
            {Math.round(hud.score)}
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#181425]/90 border border-[#362452] shadow-[0_2px_0_#181425] text-[10px] md:text-xs font-extrabold font-mono-tabular text-[#FDE047] whitespace-nowrap">
            <span>IKAN: {Math.round(hud.fishCollected)}</span>
            {hud.combo > 1 && (
              <>
                <span className="text-[#94A3B8]" aria-hidden="true">
                  |
                </span>
                <span className="text-[#34D399]">KOMBO x{Math.round(hud.combo)}</span>
              </>
            )}
          </div>
        </div>

        {/* Column 3 (Top-Right): Compact Square SVG Utility Buttons (never clips off right edge) */}
        <div className="justify-self-end flex items-center gap-1 sm:gap-1.5 md:gap-2 pointer-events-auto shrink-0">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Nyalakan Suara' : 'Bisukan Suara'}
            className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-2 sm:border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.4">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" />
              {muted ? (
                <path d="M22 9l-6 6M16 9l6 6" stroke="#F43F5E" strokeLinecap="round" />
              ) : (
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" strokeLinecap="round" />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            aria-label="Ulangi Permainan"
            className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-2 sm:border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" strokeWidth="2.4">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M3 3v5h5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTogglePause();
            }}
            aria-label="Jeda Permainan"
            className="w-8 h-8 sm:w-9 sm:h-9 md:w-10 md:h-10 shrink-0 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-2 sm:border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 sm:w-5 sm:h-5" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* MOBILE DEDICATED TOUCH ACTION DECK (Single Chosen Skill Only — No mid-run switching) */}
      <div
        data-testid="mobile-action-deck"
        className="flex md:hidden flex-col gap-1.5 w-full pointer-events-none pb-0.5"
      >
        <div className="flex items-center justify-between gap-2 w-full">
          <div className="px-2.5 py-1.5 rounded-xl bg-[#181425]/90 border border-[#362452] text-[10px] font-bold text-[#FDE68A] leading-none whitespace-nowrap">
            REKOR ATAP: {Math.round(hud.bestScore)}
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-[#181425]/85 border border-[#362452] text-[10px] font-bold text-[#E2E8F0] leading-none whitespace-nowrap">
            Ketuk Layar = Terbang
          </span>
        </div>

        <div className="pointer-events-none flex items-center justify-end gap-2 w-full">
          <div className="text-right max-w-[10rem]">
            <div className="font-display text-xs font-extrabold text-[#FFF8E7] truncate">
              {isPowerUnlocked ? equippedPower.shortName.toUpperCase() : 'POWER TERKUNCI'}
            </div>
            <div className="text-[10px] font-semibold text-[#FDE68A] truncate">
              {isManualPower ? '[SHIFT / E] AKTIFKAN' : 'PASIF · TERPILIH'}
            </div>
          </div>
          <button
            type="button"
            data-testid="mobile-power-btn"
            disabled={!chosenSkillState.ready}
            onPointerDown={(e) => {
              e.stopPropagation();
              if (chosenSkillState.ready) {
                onTriggerDash(equippedPower.reward_id);
              }
            }}
            onClick={(e) => {
              e.stopPropagation();
              e.currentTarget.blur();
            }}
            aria-label={
              isPowerUnlocked && isManualPower
                ? `Aktifkan Skill ${equippedPower.shortName}`
                : `Power ${equippedPower.shortName} pasif`
            }
            className={`pointer-events-auto relative w-[4.25rem] h-[4.25rem] shrink-0 flex items-center justify-center rounded-full border-[3px] border-[#181425] shadow-[0_4px_0_#181425] active:translate-y-0.5 transition-transform select-none ${
              chosenSkillState.active
                ? 'bg-[#362452] text-[#FDE047] ring-2 ring-[#FACC15]'
                : chosenSkillState.ready
                ? 'bg-[#261B3A] text-[#FFF8E7] ring-1 ring-[#FACC15]'
                : 'bg-[#181425]/90 text-[#94A3B8] opacity-85'
            }`}
          >
            <span
              className="absolute inset-0 rounded-full"
              style={{
                background: `conic-gradient(${equippedPower.primaryColor || '#F97316'} ${isManualPower ? energyPct : 100}%, #362452 0)`,
              }}
              aria-hidden="true"
            />
            <span className="relative rounded-full bg-[#181425] p-1">
              <PowerIcon power={equippedPower} size="md" />
            </span>
            <span className="absolute -left-2 -bottom-1 px-1.5 py-0.5 rounded-full bg-[#181126] border border-[#FACC15] text-[9px] text-[#34D399] font-mono-tabular font-extrabold whitespace-nowrap">
              {chosenSkillState.statusText}
            </span>
          </button>
        </div>
      </div>

      {/* DESKTOP BOTTOM CONTROL REMINDER (Hidden on mobile) */}
      <div className="hidden md:flex justify-between items-end text-[11px] font-bold text-[#FDE68A] hud-stroke-sm">
        <span className="px-2.5 py-1 rounded-lg bg-[#181425]/80 border border-[#362452]">
          REKOR {Math.round(hud.bestScore)} · SKILL {equippedPower.shortName.toUpperCase()}
        </span>
        <span className="px-2.5 py-1 rounded-lg bg-[#181425]/80 border border-[#362452]">
          [SPASI / KLIK] TERBANG · [SHIFT / E] SKILL · [P] JEDA
        </span>
      </div>
    </div>
  );
};

