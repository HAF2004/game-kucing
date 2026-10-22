import React from 'react';
import { PowerAbilitySpec } from '../game/achievementDefinitions';

interface PowerIconProps {
  power: Pick<PowerAbilitySpec, 'reward_id' | 'primaryColor' | 'accentColor' | 'iconAsset' | 'shortName'>;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<PowerIconProps['size']>, string> = {
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-11 h-11',
};

function PowerGlyph({ rewardId }: { rewardId: PowerAbilitySpec['reward_id'] }) {
  if (rewardId === 'dash') {
    return (
      <path d="M13.5 2L5 13h6l-1 9 8.5-12h-6L13.5 2z" fill="currentColor" />
    );
  }
  if (rewardId === 'time_freeze') {
    return (
      <>
        <circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M12 7v5l3 2M5 4l2 2M19 4l-2 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    );
  }
  if (rewardId === 'shield') {
    return <path d="M12 3l7 3v5c0 4.7-3 8.1-7 10-4-1.9-7-5.3-7-10V6l7-3zm-1 11l-2-2-1.4 1.4L11 16.8l5.4-5.4L15 10l-4 4z" fill="currentColor" />;
  }
  if (rewardId === 'magnet') {
    return <path d="M5 4v7a7 7 0 0014 0V4h-4v7a3 3 0 01-6 0V4H5zm0 0h4v4H5V4zm10 0h4v4h-4V4z" fill="currentColor" />;
  }
  if (rewardId === 'second_chance') {
    return <path d="M12 20.5S4 15.8 4 9.7A4.2 4.2 0 018.2 5.5c1.6 0 3 .9 3.8 2.1.8-1.2 2.2-2.1 3.8-2.1A4.2 4.2 0 0120 9.7c0 6.1-8 10.8-8 10.8z" fill="currentColor" />;
  }
  if (rewardId === 'wapres') {
    return <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" />;
  }
  return <path d="M12 3a5 5 0 00-5 5v2H6a2 2 0 00-2 2v7a2 2 0 002 2h12a2 2 0 002-2v-7a2 2 0 00-2-2h-1V8a5 5 0 00-5-5zm-3 7V8a3 3 0 016 0v2H9z" fill="currentColor" />;
}

export const PowerIcon: React.FC<PowerIconProps> = ({ power, size = 'md' }) => (
  <span
    className={`${SIZE_CLASSES[size]} rounded-full border-2 border-[#181425] shrink-0 inline-flex items-center justify-center overflow-hidden shadow-[0_2px_0_#181425]`}
    style={{
      background: `linear-gradient(135deg, ${power.primaryColor} 20%, ${power.accentColor} 100%)`,
    }}
    title={power.shortName}
    aria-hidden="true"
  >
    {power.iconAsset ? (
      <img src={power.iconAsset} alt="" className="w-full h-full object-cover" />
    ) : (
      <svg viewBox="0 0 24 24" className="w-1/2 h-1/2 text-[#181425]" aria-hidden="true">
        <PowerGlyph rewardId={power.reward_id} />
      </svg>
    )}
  </span>
);
