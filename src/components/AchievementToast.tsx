import React from 'react';
import { AchievementUnlockNotice } from '../game/achievementService';

interface AchievementToastProps {
  notices: AchievementUnlockNotice[];
}

export const AchievementToast: React.FC<AchievementToastProps> = ({ notices }) => {
  if (notices.length === 0) return null;

  const latest = notices[0];

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="achievement-unlock-toast"
      className="fixed top-16 md:top-auto md:bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#231836] border-[3px] border-[#FACC15] shadow-[0_6px_0_#181425] text-[#FFF8E7] transition-all duration-200"
    >
      {/* Power Unlock Badge or Wapres Icon */}
      {latest.reward.iconAsset ? (
        <img
          src={latest.reward.iconAsset}
          alt={latest.reward.shortName}
          className="w-9 h-9 rounded-xl border-2 border-[#FACC15] object-cover shrink-0 shadow-[0_2px_0_#181425]"
        />
      ) : (
        <div
          className="w-9 h-9 rounded-xl border-2 border-[#181425] flex items-center justify-center shrink-0 shadow-[0_2px_0_#181425]"
          style={{ backgroundColor: latest.reward.primaryColor || '#FACC15' }}
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 text-[#181425]" fill="currentColor">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        </div>
      )}

      <div className="text-left">
        <div className="text-[10px] font-extrabold uppercase tracking-wider text-[#FDE047]">
          PENCAPAIAN &amp; POWER BARU TERBUKA!
        </div>
        <div className="font-display text-sm md:text-base font-bold text-[#FFF8E7] leading-tight">
          {latest.achievement.name}
        </div>
        <div className="text-xs font-semibold text-[#34D399]">
          {latest.reward.category === 'passive' ? 'Skill Pasif' : 'Skill Aktif'}:{' '}
          {latest.reward.name}
        </div>
      </div>
    </div>
  );
};
