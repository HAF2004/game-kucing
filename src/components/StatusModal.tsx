import React from 'react';
import { RunSnapshot } from '../game/types';

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  snapshot: RunSnapshot;
  playerRank?: number;
  onResume?: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
  onOpenLeaderboard: () => void;
  onOpenAchievements: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  snapshot,
  playerRank,
  onResume,
  onRestart,
  onReturnTitle,
  onOpenLeaderboard,
  onOpenAchievements,
}) => {
  const isPaused = mode === 'paused';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#120D1D]/80 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div className="w-full max-w-md bg-[#231836] border-[4px] border-[#181425] rounded-3xl p-5 sm:p-6 md:p-7 shadow-[0_10px_0_#181425] text-[#FFF8E7]">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A] mb-1">
            {isPaused ? 'ISTIRAHAT SEJENAK' : snapshot.causeOfDefeat || 'PETUALANGAN SELESAI'}
          </div>
          <h2
            id="modal-heading"
            className="font-display text-2xl sm:text-3xl md:text-4xl font-bold text-[#FFF8E7] hud-stroke"
          >
            {isPaused ? 'Permainan Dijeda' : 'Barudak Terjatuh!'}
          </h2>
          {playerRank ? (
            <div className="mt-1.5 inline-block px-3 py-0.5 rounded-full bg-[#181126] border border-[#362452] text-xs font-mono-tabular font-bold text-[#38BDF8]">
              Peringkat Global: #{playerRank}
            </div>
          ) : null}
        </div>

        {/* 3 Stat Tiles with Tabular Numerals */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3 mb-4">
          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-2.5 sm:p-3 text-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold uppercase text-[#FDE68A]">
              SKOR
            </div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-[#FFF8E7] mt-0.5">
              {Math.round(snapshot.score)}
            </div>
          </div>

          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-2.5 sm:p-3 text-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold uppercase text-[#FDE68A]">
              REKOR
            </div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-[#FACC15] mt-0.5">
              {Math.round(snapshot.bestScore)}
            </div>
          </div>

          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-2.5 sm:p-3 text-center">
            <div className="text-[10px] sm:text-[11px] font-extrabold uppercase text-[#FDE68A]">
              IKAN
            </div>
            <div className="text-xl sm:text-2xl font-extrabold font-mono-tabular text-[#38BDF8] mt-0.5">
              {Math.round(snapshot.fishCollected)}
            </div>
          </div>
        </div>

        {/* Secondary Run Stats Pill */}
        <div className="grid grid-cols-3 divide-x divide-[#362452] bg-[#181126]/85 border border-[#362452] rounded-xl py-2 px-1 text-center text-[11px] sm:text-xs font-semibold text-[#E2E8F0] mb-5">
          <span className="px-1 truncate">Atap: {Math.round(snapshot.pipesCleared)}</span>
          <span className="px-1 truncate">Jarak: {Math.round(snapshot.distanceMeters)}m</span>
          <span className="px-1 truncate">Kombo: x{Math.round(snapshot.maxCombo)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          {isPaused && onResume && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="w-full py-3 px-5 rounded-2xl bg-[#10B981] hover:bg-[#059669] text-[#FFF8E7] font-display text-base sm:text-lg font-bold border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer text-center"
            >
              Lanjutkan Terbang
            </button>
          )}

          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-full py-3 px-5 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] text-[#FFF8E7] font-display text-base sm:text-lg font-bold border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer text-center"
          >
            {isPaused ? 'Mulai Ulang' : 'Coba Lagi Sekarang'}
          </button>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenLeaderboard();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#261B3A] hover:bg-[#362452] text-[#FDE047] font-bold text-[11px] sm:text-xs border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] cursor-pointer text-center leading-tight"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-[#FACC15]" fill="currentColor" aria-hidden="true">
                <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
              </svg>
              <span>Papan Peringkat</span>
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onOpenAchievements();
              }}
              className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-2xl bg-[#261B3A] hover:bg-[#362452] text-[#34D399] font-bold text-[11px] sm:text-xs border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] cursor-pointer text-center leading-tight"
            >
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 shrink-0 text-[#34D399]" fill="currentColor" aria-hidden="true">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
              <span>Power &amp; Target</span>
            </button>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnTitle();
            }}
            className="w-full py-2.5 px-5 rounded-2xl bg-[#362452] hover:bg-[#463068] text-[#FFF8E7] font-semibold text-xs sm:text-sm border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer text-center"
          >
            Kembali ke Layar Utama
          </button>
        </div>
      </div>
    </div>
  );
};
