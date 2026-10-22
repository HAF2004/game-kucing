import React from 'react';
import { CAT_SKINS, CatSkinId, getCharacterSkin } from '../game/types';
import {
  POWER_ABILITIES,
  PowerAbilityId,
  PowerAbilitySpec,
} from '../game/achievementDefinitions';

interface TitleOverlayProps {
  selectedSkin: CatSkinId;
  onSelectSkin: (skinId: CatSkinId) => void;
  equippedRewardId: PowerAbilityId;
  rewards: Array<
    PowerAbilitySpec & {
      unlocked: boolean;
      equipped: boolean;
      requiredAchievementName?: string;
    }
  >;
  unlockedAchievementsCount: number;
  totalAchievementsCount: number;
  playerUsername: string;
  playerRank?: number;
  bestScore: number;
  onEquipReward: (rewardId: PowerAbilityId) => void;
  onOpenLeaderboard: () => void;
  onOpenAchievements: () => void;
  onStartGame: () => void;
}

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedSkin,
  onSelectSkin,
  equippedRewardId,
  rewards,
  unlockedAchievementsCount,
  totalAchievementsCount,
  playerUsername,
  playerRank,
  bestScore,
  onEquipReward,
  onOpenLeaderboard,
  onOpenAchievements,
  onStartGame,
}) => {
  const activePower = POWER_ABILITIES[equippedRewardId] ?? POWER_ABILITIES.none;
  const activeCharacter = getCharacterSkin(selectedSkin);

  return (
    <div
      className="fixed inset-0 z-20 flex flex-col justify-between p-3.5 sm:p-5 md:p-8 pointer-events-none"
      aria-label="Layar Utama Barudak Terbang"
    >
      {/* Top Row: Player Identity / Leaderboard & Achievements Buttons on Left, Best Score Readout on Right */}
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenLeaderboard();
            }}
            aria-label="Buka Papan Peringkat dan Profil Pemain"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#261B3A] hover:bg-[#362452] border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#FACC15]" fill="currentColor" aria-hidden="true">
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
            <span data-testid="title-player-username" className="truncate max-w-[120px] sm:max-w-[160px]">
              {playerUsername}
            </span>
            {playerRank ? (
              <span className="font-mono-tabular text-[#38BDF8]">#{playerRank}</span>
            ) : null}
            <span className="hidden sm:inline text-[10px] uppercase tracking-wider text-[#FDE68A]">
              Peringkat
            </span>
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.blur();
              onOpenAchievements();
            }}
            aria-label="Buka Daftar Pencapaian dan Arsenal Power Barudak"
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#261B3A] hover:bg-[#362452] border-[2.5px] border-[#181425] shadow-[0_3px_0_#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 text-[#34D399]" fill="currentColor" aria-hidden="true">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
            <span>Power &amp; Target</span>
            <span
              data-testid="title-achievements-count"
              className="px-1.5 py-0.5 rounded-md bg-[#181126] font-mono-tabular text-[11px] text-[#FDE047]"
            >
              {unlockedAchievementsCount}/{totalAchievementsCount}
            </span>
          </button>
        </div>

        {bestScore > 0 && (
          <div className="bg-[#181425]/85 border-2 border-[#362452] rounded-xl px-3 py-1.5 text-right shrink-0 shadow-[0_3px_0_#181425]">
            <div className="text-[10px] font-extrabold tracking-wider uppercase text-[#FDE68A] leading-none">
              REKOR ATAP
            </div>
            <div className="text-xl md:text-2xl font-extrabold font-mono-tabular text-[#FFF8E7] leading-tight mt-0.5">
              {Math.round(bestScore)}
            </div>
          </div>
        )}
      </div>

      {/* Center-Right Focal Lockup over Sky Negative Space */}
      <div className="mt-auto mb-1.5 md:my-auto ml-auto mr-auto md:mr-10 max-w-lg w-full flex flex-col items-center md:items-end text-center md:text-right">
        {/* Bespoke Inline SVG Title Emblem for BARUDAK TERBANG */}
        <svg
          viewBox="0 0 540 144"
          className="w-full max-w-[430px] h-auto drop-shadow-[0_6px_0_#181425] mb-2"
          role="img"
          aria-label="Barudak Terbang: Petualangan Atap Senja"
        >
          <path
            d="M24 22 L512 14 L524 122 L14 130 Z"
            fill="#2A1B3D"
            stroke="#181425"
            strokeWidth="6"
            strokeLinejoin="round"
          />
          <path
            d="M32 29 L504 21 L515 115 L22 123 Z"
            fill="none"
            stroke="#F59E0B"
            strokeWidth="2.5"
            strokeDasharray="10 6"
          />
          <polygon
            points="58,6 42,32 56,32 48,52 74,22 58,22"
            fill="#FACC15"
            stroke="#181425"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <g transform="translate(465, 22) rotate(-12)">
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

          <text
            x="270"
            y="75"
            textAnchor="middle"
            fontFamily="Fredoka, Plus Jakarta Sans, sans-serif"
            fontWeight="700"
            fontSize="45"
            fill="#FFF8E7"
            stroke="#181425"
            strokeWidth="9"
            paintOrder="stroke fill"
          >
            BARUDAK TERBANG
          </text>
          <text
            x="270"
            y="108"
            textAnchor="middle"
            fontFamily="Plus Jakarta Sans, sans-serif"
            fontWeight="800"
            fontSize="11.5"
            letterSpacing="1.1"
            fill="#FDE047"
            stroke="#181425"
            strokeWidth="3.5"
            paintOrder="stroke fill"
          >
            6 SKILL: DASH · SHIELD · FREEZE · MAGNET · REVIVE · WAPRES
          </text>
        </svg>

        {/* Barudak Hero Card & 6-Power Progression Arsenal */}
        <div
          className="w-full bg-[#1E152E] border-[3px] border-[#181425] rounded-2xl p-3 shadow-[0_6px_0_#181425] mb-3 pointer-events-auto text-left"
          role="region"
          aria-label="Pilih Karakter dan Arsenal Power Barudak"
        >
          {/* Character Selector Row (Barudak Pirang vs Barudak Ninja) */}
          <div className="mb-2.5 pb-2.5 border-b border-[#382854]">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A]">
                PILIH KARAKTER BARUDAK:
              </span>
              <span
                data-testid="title-equipped-power"
                className="text-[10px] font-extrabold uppercase px-2.5 py-0.5 rounded-md border border-[#181425] text-[#181425] whitespace-nowrap"
                style={{ backgroundColor: activePower.primaryColor }}
              >
                {activePower.reward_id === 'none'
                  ? 'First Play = Buka Dash!'
                  : `Skill Aktif: ${activePower.shortName}`}
              </span>
            </div>

            <div
              className="grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Pilih Karakter Barudak"
            >
              {CAT_SKINS.map((skin) => {
                const isSelected = skin.id === activeCharacter.id;
                return (
                  <button
                    key={skin.id}
                    type="button"
                    data-testid={`select-character-${skin.id}`}
                    aria-pressed={isSelected}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onSelectSkin(skin.id);
                    }}
                    className={`flex items-center gap-2.5 p-2 rounded-xl border-2 text-left transition-transform cursor-pointer ${
                      isSelected
                        ? 'bg-[#362452] border-[#FACC15] -translate-y-0.5 shadow-[0_3px_0_#181425]'
                        : 'bg-[#261B3A] border-[#181425] hover:bg-[#31224A]'
                    }`}
                  >
                    <div
                      className="w-10 h-10 rounded-full border-2 overflow-hidden shrink-0 flex items-center justify-center bg-[#181126]"
                      style={{ borderColor: isSelected ? skin.primaryColor : '#181425' }}
                    >
                      <img
                        src={skin.sprites?.idle ?? '/assets/aistudio/pirang_idle.webp'}
                        alt={skin.name}
                        width={40}
                        height={40}
                        decoding="async"
                        className="w-10 h-10 object-cover"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-xs md:text-sm font-bold text-[#FFF8E7] truncate">
                        {skin.name}
                      </div>
                      <div className="text-[10px] font-semibold text-[#FDE68A] truncate">
                        {skin.id === 'ninja' ? '4 Nyawa · Gesit' : '4 Nyawa · Jagoan'}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6-Power Progression Grid (First Play, 100, 200, 300, 400, 500) */}
          <div className="mt-2">
            <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
              <span className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A]">
                PILIH 1 SKILL AKTIF DI AWAL GAME (TIDAK BISA SWITCH SAAT MAIN):
              </span>
              <span className="text-[10px] font-bold text-[#34D399] whitespace-nowrap">
                {unlockedAchievementsCount === 0
                  ? 'Main Pertama = Buka Dash!'
                  : `${unlockedAchievementsCount}/6 Power Terbuka`}
              </span>
            </div>

            <div
              className="grid grid-cols-3 gap-1.5 sm:gap-2"
              role="radiogroup"
              aria-label="Pilih Kemampuan Power Barudak di Awal Game"
            >
              {rewards.map((reward) => {
                const isPassive = reward.category === 'passive';
                const isSelectedActive =
                  !isPassive && reward.reward_id === equippedRewardId;
                return (
                  <button
                    key={reward.reward_id}
                    type="button"
                    data-testid={`title-power-card-${reward.reward_id}`}
                    disabled={!reward.unlocked || isPassive}
                    aria-pressed={isSelectedActive}
                    aria-label={
                      !reward.unlocked
                        ? `Jurus ${reward.name} terkunci (${reward.unlockMilestoneLabel})`
                        : isPassive
                        ? `${reward.name} (Pasif Otomatis Aktif)`
                        : `Pilih jurus aktif ${reward.name} untuk awal game`
                    }
                    title={
                      reward.unlocked
                        ? `${reward.name} — ${reward.description}`
                        : `Terkunci: ${reward.unlockMilestoneLabel}`
                    }
                    onClick={(e) => {
                      e.currentTarget.blur();
                      if (reward.unlocked && !isPassive) {
                        onEquipReward(reward.reward_id);
                      }
                    }}
                    className={`flex flex-col items-center justify-between py-1.5 px-2 rounded-xl border-2 text-center transition-transform ${
                      isSelectedActive
                        ? 'bg-[#362452] border-[#FACC15] -translate-y-0.5 shadow-[0_3px_0_#181425] cursor-pointer'
                        : reward.unlocked && isPassive
                        ? 'bg-[#1D283A] border-[#38BDF8]/70 cursor-default'
                        : reward.unlocked
                        ? 'bg-[#261B3A] border-[#181425] hover:bg-[#31224A] cursor-pointer'
                        : 'bg-[#171024] border-[#181425] opacity-60 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1 mb-0.5">
                      {reward.iconAsset ? (
                        <img
                          src={reward.iconAsset}
                          alt={reward.shortName}
                          className="w-4 h-4 rounded-full border border-[#FACC15] object-cover shrink-0"
                        />
                      ) : null}
                      <span
                        className="px-1.5 py-0.5 rounded-md border border-[#181425] text-[9px] font-extrabold text-[#181425] leading-none"
                        style={{ backgroundColor: reward.primaryColor }}
                      >
                        {reward.unlockScore === 0
                          ? 'FIRST PLAY'
                          : `${reward.unlockScore} SKOR`}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] font-bold text-[#FFF8E7] leading-tight truncate w-full">
                      {reward.shortName}
                    </span>
                    <span className="text-[9px] font-mono-tabular font-semibold text-[#FDE68A] leading-none mt-0.5">
                      {!reward.unlocked
                        ? 'Terkunci'
                        : isPassive
                        ? 'Pasif Otomatis'
                        : isSelectedActive
                        ? 'TERPILIH'
                        : 'Klik Pilih'}
                    </span>
                  </button>
                );
              })}
            </div>
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
          className="pointer-events-auto px-8 py-3.5 rounded-2xl bg-[#F97316] hover:bg-[#EA580C] active:translate-y-0.5 text-[#FFF8E7] font-display text-xl md:text-2xl font-bold tracking-wide border-[3.5px] border-[#181425] shadow-[0_6px_0_#181425] transition-transform duration-150 cursor-pointer text-center"
        >
          <span className="md:hidden">Mulai Terbang Sekarang!</span>
          <span className="hidden md:inline">Mulai Terbang [Spasi]</span>
        </button>
      </div>

      {/* Responsive Bottom Control Hint Line (Mobile vs Desktop) */}
      <div className="w-full flex justify-center">
        <div className="px-3.5 py-1 rounded-full bg-[#181425]/85 border border-[#362452] text-center text-[11px] md:text-xs font-bold text-[#FFF8E7] tracking-wide whitespace-nowrap">
          <span className="md:hidden">
            Ketuk Layar = Terbang · Pilih 1 Skill Aktif di Awal Game
          </span>
          <span className="hidden md:inline">
            Spasi / Klik = Terbang · [Shift / E] Aktifkan Skill Pilihan · P = Jeda
          </span>
        </div>
      </div>
    </div>
  );
};
