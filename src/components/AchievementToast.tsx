import React from 'react';
import { AchievementUnlockNotice } from '../game/achievementService';
import { PowerIcon } from './PowerIcon';

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
      className="fixed top-3 sm:top-16 md:top-auto md:bottom-12 left-1/2 -translate-x-1/2 z-50 pointer-events-none flex items-center gap-2.5 px-3 py-2 rounded-2xl bg-[#231836]/95 border-2 border-[#FACC15] shadow-[0_4px_0_#181425] text-[#FFF8E7] transition-all duration-200 max-w-[min(92vw,17rem)]"
    >
      <PowerIcon power={latest.reward} size="md" />

      <div className="text-left min-w-0">
        <div className="text-[9px] font-extrabold uppercase tracking-wider text-[#FDE047]">
          POWER UNLOCK
        </div>
        <div className="font-display text-sm font-bold text-[#FFF8E7] leading-tight truncate">
          {latest.reward.shortName} terbuka
        </div>
      </div>
    </div>
  );
};
