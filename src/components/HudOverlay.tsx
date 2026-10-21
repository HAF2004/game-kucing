import React from 'react';

export interface HudSnapshot {
  score: number;
  bestScore: number;
  combo: number;
  hp: number;
  maxHp: number;
  dashEnergy: number;
  dashReady: boolean;
  fishCollected: number;
}

interface HudOverlayProps {
  hud: HudSnapshot;
  muted: boolean;
  dashBarRef: React.RefObject<HTMLDivElement | null>;
  dashGhostRef: React.RefObject<HTMLDivElement | null>;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRestart: () => void;
  onTriggerDash: () => void;
}

export const HudOverlay: React.FC<HudOverlayProps> = ({
  hud,
  muted,
  dashBarRef,
  dashGhostRef,
  onToggleMute,
  onTogglePause,
  onRestart,
  onTriggerDash,
}) => {
  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none flex flex-col justify-between p-4 md:p-6"
      aria-label="HUD Permainan"
    >
      {/* Top Perimeter Bar: 3 Compact Corner/Edge Clusters */}
      <div className="flex items-start justify-between gap-4">
        {/* Cluster 1 (Top-Left): 3 Discrete Paw Vitality Sockets + Purr Dash Meter */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2" aria-label={`Nyawa Kucing: ${hud.hp} dari ${hud.maxHp}`}>
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A] hud-stroke-sm mr-1">
              NYAWA
            </span>
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
                  className="w-7 h-7 drop-shadow-[0_2px_0_#181425]"
                  aria-hidden="true"
                >
                  {/* Dark outer silhouette */}
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
                  {/* Top highlight or crack detail */}
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

          {/* Continuous Purr Dash Meter with Delayed Ghost Drain Bar */}
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onTriggerDash();
            }}
            aria-label="Aktifkan Seruduk Cepat (Shift)"
            className="pointer-events-auto group flex items-center gap-2 text-left cursor-pointer"
          >
            <div className="w-32 h-3.5 bg-[#1E152E] border-2 border-[#181425] rounded-md overflow-hidden relative shadow-[0_2px_0_#181425]">
              {/* Delayed trailing ghost bar */}
              <div
                ref={dashGhostRef}
                className="absolute inset-y-0 left-0 bg-[#FDE047] transition-all duration-300 origin-left"
                style={{ width: `${Math.round(hud.dashEnergy)}%` }}
              />
              {/* Live fill bar */}
              <div
                ref={dashBarRef}
                className={`absolute inset-y-0 left-0 ${
                  hud.dashReady ? 'bg-[#38BDF8]' : 'bg-[#64748B]'
                }`}
                style={{ width: `${Math.round(hud.dashEnergy)}%` }}
              />
            </div>
            <span className="text-[11px] font-bold font-mono-tabular text-[#FFF8E7] hud-stroke-sm">
              DASH [Shift]
            </span>
          </button>
        </div>

        {/* Cluster 2 (Top-Center): Hero Score Readout (~3:1 Hero-to-Kicker scale) */}
        <div className="flex flex-col items-center text-center -mt-1">
          <span className="text-[11px] font-extrabold uppercase tracking-widest text-[#FDE68A] hud-stroke-sm">
            SKOR ATAP
          </span>
          <div
            className="text-4xl md:text-5xl font-extrabold font-mono-tabular text-[#FFF8E7] hud-stroke leading-none"
            data-testid="hud-score"
          >
            {Math.round(hud.score)}
          </div>
          <div className="mt-1 flex items-center gap-2 text-xs font-bold font-mono-tabular text-[#FDE047] hud-stroke-sm">
            <span>IKAN: {Math.round(hud.fishCollected)}</span>
            {hud.combo > 1 && (
              <>
                <span aria-hidden="true">·</span>
                <span>KOMBO x{Math.round(hud.combo)}</span>
              </>
            )}
          </div>
        </div>

        {/* Cluster 3 (Top-Right): Compact Square SVG Utility Buttons (Mute [M], Pause [P], Restart [R]) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            aria-label={muted ? 'Nyalakan Suara (M)' : 'Bisukan Suara (M)'}
            title="Suara [M]"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4">
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
            aria-label="Ulangi Permainan (R)"
            title="Ulangi [R]"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2.4">
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
            aria-label="Jeda Permainan (P)"
            title="Jeda [P]"
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-[#261B3A] hover:bg-[#362452] border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          </button>
        </div>
      </div>

      {/* Bottom Subtle Control Reminder on Mobile / Desktop */}
      <div className="flex justify-between items-end text-[11px] font-bold text-[#FDE68A] hud-stroke-sm">
        <span>REKOR: {Math.round(hud.bestScore)}</span>
        <span>[SPASI / KLIK] KEPAK · [SHIFT] SERUDUK</span>
      </div>
    </div>
  );
};
