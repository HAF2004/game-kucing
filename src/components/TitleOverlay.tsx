import React from 'react';
import { CAT_SKINS, CatSkinId } from '../game/types';

interface TitleOverlayProps {
  selectedSkin: CatSkinId;
  bestScore: number;
  onSelectSkin: (skin: CatSkinId) => void;
  onStartGame: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedSkin,
  bestScore,
  onSelectSkin,
  onStartGame,
}) => {
  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-6 md:p-10 pointer-events-none"
      aria-label="Layar Utama Kucing Terbang"
    >
      {/* Top Row: Best Score Readout in right corner (clean unboxed text) */}
      <div className="flex items-center justify-end">
        {bestScore > 0 && (
          <div className="text-right">
            <div className="text-[11px] font-bold tracking-wider uppercase text-[#FDE68A] hud-stroke-sm">
              REKOR ATAP
            </div>
            <div className="text-2xl md:text-3xl font-extrabold font-mono-tabular text-[#FFF8E7] hud-stroke">
              {Math.round(bestScore)}
            </div>
          </div>
        )}
      </div>

      {/* Center-Right Focal Lockup over 35% Sky Negative Space (leaving upper/left sky open for live hovering Cat) */}
      <div className="mt-auto mb-6 md:my-auto ml-auto mr-auto md:mr-12 max-w-lg w-full flex flex-col items-center md:items-end text-center md:text-right">
        {/* Bespoke Inline SVG Title Emblem */}
        <svg
          viewBox="0 0 520 155"
          className="w-full max-w-[460px] h-auto drop-shadow-[0_6px_0_#181425] mb-3"
          role="img"
          aria-label="Kucing Terbang: Petualangan Atap"
        >
          {/* Decorative wooden rooftop plaque silhouette */}
          <path
            d="M28 28 L492 20 L506 128 L16 136 Z"
            fill="#2A1B3D"
            stroke="#181425"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M34 34 L486 26 L498 122 L22 130 Z"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeDasharray="10 6"
          />
          {/* Cat ear silhouette accents on plaque top-left */}
          <polygon
            points="48,28 64,4 84,26"
            fill="#F97316"
            stroke="#181425"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          <polygon
            points="92,26 112,2 128,25"
            fill="#F97316"
            stroke="#181425"
            strokeWidth="5"
            strokeLinejoin="round"
          />
          {/* Golden Fish Icon Accent on top-right */}
          <g transform="translate(445, 22) rotate(-12)">
            <ellipse
              cx="0"
              cy="0"
              rx="18"
              ry="10"
              fill="#FDE047"
              stroke="#181425"
              strokeWidth="4"
            />
            <polygon
              points="15,0 28,-10 26,0 28,10"
              fill="#F59E0B"
              stroke="#181425"
              strokeWidth="3.5"
            />
            <circle cx="-8" cy="-2" r="2.5" fill="#181425" />
          </g>

          {/* Main Display Title Text */}
          <text
            x="262"
            y="82"
            textAnchor="middle"
            fontFamily="Fredoka, Plus Jakarta Sans, sans-serif"
            fontWeight="700"
            fontSize="50"
            fill="#FFF8E7"
            stroke="#181425"
            strokeWidth="9"
            paintOrder="stroke fill"
          >
            KUCING TERBANG
          </text>
          <text
            x="262"
            y="115"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontSize="16"
            letterSpacing="3"
            fill="#FDE047"
            stroke="#181425"
            strokeWidth="5"
            paintOrder="stroke fill"
          >
            PETUALANGAN ATAP SENJA
          </text>
        </svg>

        {/* Character / Cat Skin Selection Dock */}
        <div
          className="w-full bg-[#1E152E] border-[3px] border-[#181425] rounded-2xl p-3.5 shadow-[0_6px_0_#181425] mb-5 pointer-events-auto"
          role="radiogroup"
          aria-label="Pilih Karakter Kucing"
        >
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CAT_SKINS.map((skin, idx) => {
              const active = selectedSkin === skin.id;
              return (
                <button
                  key={skin.id}
                  type="button"
                  onClick={(e) => {
                    onSelectSkin(skin.id);
                    e.currentTarget.blur();
                  }}
                  aria-pressed={active}
                  className={`flex flex-col items-center p-2 rounded-xl border-2 transition-transform duration-150 cursor-pointer ${
                    active
                      ? 'bg-[#362452] border-[#FACC15] -translate-y-0.5 shadow-[0_3px_0_#181425]'
                      : 'bg-[#261B3A] border-[#181425] opacity-85 hover:opacity-100'
                  }`}
                >
                  {skin.sprites ? (
                    <div className="w-10 h-9 mb-1 flex items-center justify-center overflow-hidden rounded-full border-2 border-[#181425] bg-[#362452]">
                      <img
                        src={skin.sprites.idle}
                        alt=""
                        aria-hidden="true"
                        referrerPolicy="no-referrer"
                        className="w-10 h-10 object-cover scale-125"
                      />
                    </div>
                  ) : (
                    <svg viewBox="0 0 48 42" className="w-10 h-9 mb-1">
                      <polygon
                        points="8,18 12,4 22,14"
                        fill={skin.primaryColor}
                        stroke="#181425"
                        strokeWidth="3"
                      />
                      <polygon
                        points="40,18 36,4 26,14"
                        fill={skin.primaryColor}
                        stroke="#181425"
                        strokeWidth="3"
                      />
                      <ellipse
                        cx="24"
                        cy="24"
                        rx="16"
                        ry="13"
                        fill={skin.primaryColor}
                        stroke="#181425"
                        strokeWidth="3"
                      />
                      <circle cx="19" cy="22" r="2.3" fill="#181425" />
                      <circle cx="29" cy="22" r="2.3" fill="#181425" />
                      <circle cx="24" cy="25" r="2" fill="#FB7185" />
                    </svg>
                  )}
                  <span className="text-xs font-bold text-[#FFF8E7] whitespace-nowrap">
                    {skin.name}
                  </span>
                  <span className="text-[10px] font-mono-tabular text-[#FDE68A]">
                    [{idx + 1}]
                  </span>
                </button>
              );
            })}
          </div>
          {/* Live Role & Effect Clue for Selected Cat */}
          <div className="mt-2.5 pt-2 border-t border-[#382854] text-center text-xs text-[#FDE68A] font-medium">
            {CAT_SKINS.find((s) => s.id === selectedSkin)?.role}
          </div>
        </div>

        {/* Single Primary Start CTA */}
        <button
          type="button"
          data-start="true"
          onClick={(e) => {
            e.currentTarget.blur();
            onStartGame();
          }}
          className="pointer-events-auto px-8 py-4 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] active:translate-y-0.5 text-[#FFF8E7] font-display text-xl md:text-2xl font-bold tracking-wide border-[3.5px] border-[#181425] shadow-[0_6px_0_#181425] transition-transform duration-150 cursor-pointer whitespace-nowrap"
        >
          Mulai Terbang [Spasi]
        </button>
      </div>

      {/* Single Flat Borderless Control Hint Line in Bottom Safe Margin */}
      <div className="w-full text-center text-[11px] md:text-sm font-semibold text-[#FFF8E7] hud-stroke-sm tracking-wide whitespace-nowrap">
        Spasi/Klik Kepak · Shift Seruduk · P Jeda · M Suara
      </div>
    </div>
  );
};
