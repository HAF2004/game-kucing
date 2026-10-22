import React from 'react';
import {
  AchievementState,
  POWER_ABILITIES,
  PowerAbilityId,
  PowerAbilitySpec,
} from '../game/achievementDefinitions';

interface AchievementsModalProps {
  achievements: AchievementState[];
  rewards: Array<
    PowerAbilitySpec & {
      unlocked: boolean;
      equipped: boolean;
      requiredAchievementName?: string;
    }
  >;
  canSelectSkill?: boolean;
  onEquipReward: (rewardId: PowerAbilityId) => void;
  onClose: () => void;
}

export const AchievementsModal: React.FC<AchievementsModalProps> = ({
  achievements,
  rewards,
  canSelectSkill = true,
  onEquipReward,
  onClose,
}) => {
  const unlockedCount = achievements.filter((a) => a.unlocked).length;

  const formatUnitLabel = (eventType: AchievementState['event_type']): string => {
    if (eventType === 'first_play') return 'main';
    if (eventType === 'fish_collected') return 'ikan';
    if (eventType === 'pipe_cleared') return 'rintangan';
    return 'skor';
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-3.5 sm:p-4 bg-[#120D1D]/85 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="achievements-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-[#231836] border-[4px] border-[#181425] rounded-3xl p-4 sm:p-6 shadow-[0_10px_0_#181425] text-[#FFF8E7]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-3.5 border-b-2 border-[#362452]">
          <div className="min-w-0">
            <div className="text-[10px] sm:text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A]">
              ARSENAL 6 POWER PROGRESI ({unlockedCount} / {achievements.length} TERBUKA)
            </div>
            <h2
              id="achievements-modal-title"
              className="font-display text-xl sm:text-2xl md:text-3xl font-bold text-[#FFF8E7] hud-stroke-sm truncate"
            >
              Power &amp; Pencapaian Barudak
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Pencapaian"
            className="shrink-0 px-4 py-2 rounded-xl bg-[#362452] hover:bg-[#463068] border-2 border-[#181425] shadow-[0_3px_0_#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer"
          >
            Tutup
          </button>
        </div>

        {/* 6-Power Selection & Status Section */}
        <div className="mt-3.5 bg-[#181126] border-2 border-[#181425] rounded-2xl p-3 sm:p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-1 mb-2">
            <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-wider text-[#FDE68A]">
              3 SKILL AKTIF &amp; 3 SKILL PASIF
            </span>
            <span className="text-[10px] sm:text-[11px] font-semibold text-[#E2E8F0]">
              {canSelectSkill
                ? 'Pilih 1 Skill Aktif di awal game · Skill Pasif aktif otomatis'
                : 'Skill Aktif dikunci saat bermain · Kembali ke Layar Utama untuk ganti skill'}
            </span>
          </div>

          <div
            className="grid grid-cols-2 sm:grid-cols-3 gap-2"
            role="radiogroup"
            aria-label="Pilih Kemampuan Power Barudak"
          >
            {rewards.map((reward) => {
              const isPassive = reward.category === 'passive';
              const isSelectable = reward.unlocked && !isPassive && canSelectSkill;
              const isSelectedActive = !isPassive && reward.equipped;
              return (
                <button
                  key={reward.reward_id}
                  type="button"
                  disabled={!isSelectable}
                  aria-pressed={isSelectedActive}
                  onClick={() => {
                    if (isSelectable) {
                      onEquipReward(reward.reward_id);
                    }
                  }}
                  className={`flex items-center gap-2.5 p-2 rounded-xl border-2 text-left transition-transform ${
                    isSelectedActive
                      ? 'bg-[#362452] border-[#FACC15] shadow-[0_3px_0_#181425]'
                      : reward.unlocked && isPassive
                      ? 'bg-[#1D283A] border-[#38BDF8]/70 cursor-default'
                      : isSelectable
                      ? 'bg-[#261B3A] border-[#181425] hover:bg-[#31224A] cursor-pointer'
                      : 'bg-[#1B1329] border-[#181425] opacity-65 cursor-not-allowed'
                  }`}
                >
                  {/* Power Emblem Badge or Wapres Head Icon */}
                  {reward.iconAsset ? (
                    <img
                      src={reward.iconAsset}
                      alt={reward.shortName}
                      className="w-8 h-8 rounded-xl border-2 border-[#FACC15] object-cover shrink-0 bg-[#181425]"
                    />
                  ) : (
                    <span
                      className="w-8 h-8 rounded-xl border-2 border-[#181425] shrink-0 flex items-center justify-center"
                      style={{
                        background: `linear-gradient(135deg, ${reward.primaryColor} 60%, ${reward.accentColor} 100%)`,
                      }}
                      aria-hidden="true"
                    >
                      {reward.unlocked ? (
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-[#181425]" fill="currentColor">
                          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#181425]" fill="currentColor">
                          <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V7z" />
                        </svg>
                      )}
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-[#FFF8E7] truncate">
                      {reward.shortName}
                    </div>
                    <div className="text-[10px] font-bold text-[#FDE68A] truncate">
                      {!reward.unlocked
                        ? reward.unlockScore === 0
                          ? 'Butuh First Play'
                          : `Butuh ${reward.unlockScore} Skor`
                        : isPassive
                        ? 'Pasif · Otomatis Aktif'
                        : isSelectedActive
                        ? 'Aktif · TERPILIH'
                        : canSelectSkill
                        ? `Aktif · Klik Pilih`
                        : 'Terkunci Saat Main'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Achievement List */}
        <div className="mt-3.5 flex-1 overflow-y-auto space-y-2.5 pr-1">
          {achievements.map((ach) => {
            const reward = POWER_ABILITIES[ach.reward_id];
            const pct = Math.min(100, Math.round((ach.progress / ach.target_value) * 100));
            const unit = formatUnitLabel(ach.event_type);

            return (
              <div
                key={ach.achievement_id}
                data-testid={`achievement-card-${ach.achievement_id}`}
                className={`p-3.5 rounded-2xl border-2 ${
                  ach.unlocked
                    ? 'bg-[#2E2046] border-[#FACC15]'
                    : 'bg-[#181126] border-[#181425]'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base font-bold text-[#FFF8E7]">
                        {ach.name}
                      </span>
                      <span
                        className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md border border-[#181425] ${
                          ach.unlocked
                            ? 'bg-[#10B981] text-[#181425]'
                            : 'bg-[#362452] text-[#FDE68A]'
                        }`}
                      >
                        {ach.unlocked ? 'TERBUKA' : 'TERKUNCI'}
                      </span>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-[#181425] border border-[#362452] text-[#38BDF8]">
                        {reward?.category === 'passive' ? 'SKILL PASIF' : 'SKILL AKTIF'}
                      </span>
                    </div>
                    <p className="text-xs text-[#E2E8F0] mt-1 leading-relaxed">
                      {reward ? reward.description : ach.description}
                    </p>
                  </div>

                  {/* Power Ability Reward & Cooldown Badge */}
                  <div className="flex items-center gap-2 bg-[#231836] border border-[#362452] rounded-xl px-3 py-1.5 shrink-0 self-start sm:self-center">
                    {reward?.iconAsset ? (
                      <img
                        src={reward.iconAsset}
                        alt={reward.shortName}
                        className="w-6 h-6 rounded-full border border-[#FACC15] object-cover shrink-0"
                      />
                    ) : (
                      <span
                        className="w-3.5 h-3.5 rounded-full border border-[#181425] shrink-0"
                        style={{ backgroundColor: reward?.primaryColor || '#F97316' }}
                        aria-hidden="true"
                      />
                    )}
                    <div className="text-[11px] leading-tight">
                      <div className="font-bold text-[#FFF8E7]">{reward?.shortName}</div>
                      <div className="text-[10px] font-mono-tabular font-semibold text-[#FDE68A]">
                        {reward?.category === 'passive'
                          ? reward.maxChargesPerRun
                            ? `${reward.maxChargesPerRun}x Otomatis / Run`
                            : 'Radius 125 Unit'
                          : reward?.maxChargesPerRun
                          ? `Durasi ${reward.durationSec}s · 1x/Run`
                          : `Durasi ${reward?.durationSec}s · CD ${reward?.cooldownSec}s`}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Counter */}
                <div className="mt-2.5">
                  <div className="flex items-center justify-between text-xs font-mono-tabular font-bold mb-1">
                    <span className="text-[#FDE68A]">
                      Target: {ach.progress} / {ach.target_value} {unit}
                    </span>
                    {ach.unlocked && ach.unlocked_at ? (
                      <span className="text-[11px] text-[#34D399]">
                        Terbuka: {new Date(ach.unlocked_at).toLocaleDateString('id-ID')}
                      </span>
                    ) : (
                      <span className="text-[#E2E8F0]">{pct}%</span>
                    )}
                  </div>
                  <div className="w-full h-2.5 bg-[#120D1D] border border-[#181425] rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        ach.unlocked ? 'bg-[#10B981]' : 'bg-[#38BDF8]'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
