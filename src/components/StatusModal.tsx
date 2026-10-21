import React from 'react';
import { RunSnapshot } from '../game/types';

interface StatusModalProps {
  mode: 'paused' | 'gameover';
  snapshot: RunSnapshot;
  onResume?: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  mode,
  snapshot,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  const isPaused = mode === 'paused';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#120D1D]/75 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-heading"
    >
      <div className="w-full max-w-md bg-[#231836] border-[4px] border-[#181425] rounded-3xl p-6 md:p-7 shadow-[0_10px_0_#181425] text-[#FFF8E7]">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-xs font-extrabold uppercase tracking-widest text-[#FDE68A] mb-1">
            {isPaused ? 'ISTIRAHAT SEJENAK' : snapshot.causeOfDefeat || 'PETUALANGAN SELESAI'}
          </div>
          <h2
            id="modal-heading"
            className="font-display text-3xl md:text-4xl font-bold text-[#FFF8E7] hud-stroke"
          >
            {isPaused ? 'Permainan Dijeda' : 'Kucing Terjatuh!'}
          </h2>
        </div>

        {/* 3 Stat Tiles with Tabular Numerals */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase text-[#FDE68A]">SKOR</div>
            <div className="text-2xl font-extrabold font-mono-tabular text-[#FFF8E7] mt-0.5">
              {Math.round(snapshot.score)}
            </div>
          </div>

          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase text-[#FDE68A]">REKOR</div>
            <div className="text-2xl font-extrabold font-mono-tabular text-[#FACC15] mt-0.5">
              {Math.round(snapshot.bestScore)}
            </div>
          </div>

          <div className="bg-[#181126] border-2 border-[#181425] rounded-2xl p-3 text-center">
            <div className="text-[11px] font-bold uppercase text-[#FDE68A]">IKAN EMAS</div>
            <div className="text-2xl font-extrabold font-mono-tabular text-[#38BDF8] mt-0.5">
              {Math.round(snapshot.fishCollected)}
            </div>
          </div>
        </div>

        {/* Progress-Toward-Goal Subtitle */}
        <div className="text-center text-xs font-medium text-[#E2E8F0] mb-6">
          <span>Atap Terlewati: {Math.round(snapshot.pipesCleared)}</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>Jarak Terbang: {Math.round(snapshot.distanceMeters)}m</span>
          <span className="mx-2" aria-hidden="true">·</span>
          <span>Kombo Maks: x{Math.round(snapshot.maxCombo)}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-3">
          {isPaused && onResume && (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="w-full py-3.5 px-5 rounded-2xl bg-[#10B981] hover:bg-[#059669] text-[#FFF8E7] font-display text-lg font-bold border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer whitespace-nowrap"
            >
              Lanjutkan Terbang [Esc / P]
            </button>
          )}

          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-full py-3.5 px-5 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] text-[#FFF8E7] font-display text-lg font-bold border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer whitespace-nowrap"
          >
            {isPaused ? 'Mulai Ulang [R]' : 'Coba Lagi [Spasi / Enter]'}
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onReturnTitle();
            }}
            className="w-full py-3 px-5 rounded-2xl bg-[#362452] hover:bg-[#463068] text-[#FFF8E7] font-semibold text-sm border-[3px] border-[#181425] shadow-[0_4px_0_#181425] cursor-pointer whitespace-nowrap"
          >
            Kembali ke Layar Utama
          </button>
        </div>
      </div>
    </div>
  );
};
