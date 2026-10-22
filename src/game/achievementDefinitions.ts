export type AchievementCategory = 'collection' | 'progression' | 'gameplay';

export type GameplayEventType =
  | 'first_play'
  | 'fish_collected'
  | 'pipe_cleared'
  | 'score_earned'
  | 'run_score_reached';

export type CorePowerId =
  | 'dash'
  | 'shield'
  | 'time_freeze'
  | 'magnet'
  | 'second_chance'
  | 'wapres';

export type PowerAbilityId = 'none' | CorePowerId;

export type PowerCategory = 'active' | 'passive';

// Keep alias for backward type imports where needed
export type CatColorRewardId = PowerAbilityId;

export interface PowerAbilitySpec {
  reward_id: PowerAbilityId;
  category: PowerCategory;
  name: string;
  shortName: string;
  tierLabel: string;
  unlockScore: number;
  unlockMilestoneLabel: string;
  description: string;
  energyCost: number;
  cooldownSec: number;
  durationSec: number;
  maxChargesPerRun: number | null;
  passiveRegenPerSec: number;
  fishEnergyGain: number;
  primaryColor: string;
  accentColor: string;
  auraColor: string;
  hotkeyLabel?: string;
  iconAsset?: string;
  isUltimate?: boolean;
  isDefault?: boolean;
}

export type CatColorPalette = PowerAbilitySpec;

export interface AchievementDefinition {
  achievement_id: string;
  name: string;
  description: string;
  category: AchievementCategory;
  event_type: GameplayEventType;
  target_value: number;
  reward_id: CorePowerId;
  icon:
    | 'fish_bronze'
    | 'fish_silver'
    | 'fish_gold'
    | 'pipe_emerald'
    | 'pipe_crown'
    | 'star_crest';
}

export interface AchievementState extends AchievementDefinition {
  unlocked: boolean;
  progress: number;
  unlocked_at: string | null;
}

export const WAPRES_ASSET_PATH = '/assets/aistudio/wapres_87f4190e.png';

export const POWER_ABILITIES: Record<PowerAbilityId, PowerAbilitySpec> = {
  none: {
    reward_id: 'none',
    category: 'active',
    name: 'Belum Ada Power',
    shortName: 'Terkunci',
    tierLabel: 'Terkunci',
    unlockScore: 0,
    unlockMilestoneLabel: 'Main Pertama (First Play)',
    description: 'Mulai permainan pertamamu untuk membuka skill aktif Dash!',
    energyCost: 0,
    cooldownSec: 8,
    durationSec: 0,
    maxChargesPerRun: null,
    passiveRegenPerSec: 0,
    fishEnergyGain: 0,
    primaryColor: '#64748B',
    accentColor: '#475569',
    auraColor: 'rgba(100, 116, 139, 0.2)',
    isDefault: true,
  },
  dash: {
    reward_id: 'dash',
    category: 'active',
    name: 'Dash (Seruduk Kilat)',
    shortName: 'Dash',
    tierLabel: 'First Play · Aktif',
    unlockScore: 0,
    unlockMilestoneLabel: 'Pencapaian First Play',
    description:
      'Skill Aktif: Dorongan mobilitas 0.5 detik dengan stabilisasi vertikal tanpa melewati batas arena. Cooldown 8 detik.',
    energyCost: 0,
    cooldownSec: 8.0,
    durationSec: 0.5,
    maxChargesPerRun: null,
    passiveRegenPerSec: 12.5,
    fishEnergyGain: 15,
    primaryColor: '#38BDF8',
    accentColor: '#0284C7',
    auraColor: 'rgba(56, 189, 248, 0.38)',
    hotkeyLabel: '1 / Shift',
  },
  shield: {
    reward_id: 'shield',
    category: 'passive',
    name: 'Shield (Perisai Pasif)',
    shortName: 'Shield',
    tierLabel: '100 Skor · Pasif',
    unlockScore: 100,
    unlockMilestoneLabel: '100 Skor',
    description:
      'Skill Pasif: Otomatis menahan 1 tabrakan fatal pipa/rintangan per run tanpa perlu ditekan manual (1 muatan/run).',
    energyCost: 0,
    cooldownSec: 0,
    durationSec: 0,
    maxChargesPerRun: 1,
    passiveRegenPerSec: 0,
    fishEnergyGain: 0,
    primaryColor: '#10B981',
    accentColor: '#059669',
    auraColor: 'rgba(16, 185, 129, 0.42)',
  },
  time_freeze: {
    reward_id: 'time_freeze',
    category: 'active',
    name: 'Time Freeze (Bekukan Waktu)',
    shortName: 'Time Freeze',
    tierLabel: '200 Skor · Aktif',
    unlockScore: 200,
    unlockMilestoneLabel: '200 Skor',
    description:
      'Skill Aktif: Melambatkan kecepatan pipa & rintangan menjadi 45% selama 3 detik sementara kendali karakter tetap responsif. Cooldown 15 detik.',
    energyCost: 0,
    cooldownSec: 15.0,
    durationSec: 3.0,
    maxChargesPerRun: null,
    passiveRegenPerSec: 6.7,
    fishEnergyGain: 10,
    primaryColor: '#818CF8',
    accentColor: '#4F46E5',
    auraColor: 'rgba(129, 140, 248, 0.44)',
    hotkeyLabel: '2 / E',
  },
  magnet: {
    reward_id: 'magnet',
    category: 'passive',
    name: 'Magnet (Penarik Koleksi)',
    shortName: 'Magnet',
    tierLabel: '300 Skor · Pasif',
    unlockScore: 300,
    unlockMilestoneLabel: '300 Skor',
    description:
      'Skill Pasif: Otomatis menarik ikan/koleksi di sekitar karakter dalam radius 125 unit secara mulus sepanjang run.',
    energyCost: 0,
    cooldownSec: 0,
    durationSec: 0,
    maxChargesPerRun: null,
    passiveRegenPerSec: 0,
    fishEnergyGain: 0,
    primaryColor: '#A855F7',
    accentColor: '#7E22CE',
    auraColor: 'rgba(168, 85, 247, 0.44)',
  },
  second_chance: {
    reward_id: 'second_chance',
    category: 'passive',
    name: 'Second Chance (Kesempatan Kedua)',
    shortName: 'Second Chance',
    tierLabel: '400 Skor · Pasif',
    unlockScore: 400,
    unlockMilestoneLabel: '400 Skor',
    description:
      'Skill Pasif: Otomatis membangkitkan karakter 1 kali per run saat tabrakan fatal (setelah Shield habis), memindahkan ke posisi aman & kebal 1 detik.',
    energyCost: 0,
    cooldownSec: 0,
    durationSec: 1.0,
    maxChargesPerRun: 1,
    passiveRegenPerSec: 0,
    fishEnergyGain: 0,
    primaryColor: '#F59E0B',
    accentColor: '#D97706',
    auraColor: 'rgba(245, 158, 11, 0.46)',
  },
  wapres: {
    reward_id: 'wapres',
    category: 'active',
    name: 'Wapres (Ultimate Kebal)',
    shortName: 'Wapres',
    tierLabel: '500 Skor · Ultimate',
    unlockScore: 500,
    unlockMilestoneLabel: '500 Skor',
    description:
      'Ultimate Aktif: Transformasi wujud Wapres selama 4 detik! Kebal penuh dari seluruh tabrakan fatal tanpa mengurangi Shield atau Second Chance (1x per run).',
    energyCost: 0,
    cooldownSec: 0,
    durationSec: 4.0,
    maxChargesPerRun: 1,
    passiveRegenPerSec: 0,
    fishEnergyGain: 0,
    primaryColor: '#FACC15',
    accentColor: '#EF4444',
    auraColor: 'rgba(250, 204, 21, 0.58)',
    hotkeyLabel: '3 / F',
    iconAsset: WAPRES_ASSET_PATH,
    isUltimate: true,
  },
};

export const CAT_COLOR_REWARDS = POWER_ABILITIES;

export const CORE_POWER_IDS: CorePowerId[] = [
  'dash',
  'shield',
  'time_freeze',
  'magnet',
  'second_chance',
  'wapres',
];

export const ACTIVE_POWER_IDS: CorePowerId[] = ['dash', 'time_freeze', 'wapres'];
export const PASSIVE_POWER_IDS: CorePowerId[] = ['shield', 'magnet', 'second_chance'];

export const POWER_ABILITY_LIST: PowerAbilitySpec[] = CORE_POWER_IDS.map(
  (id) => POWER_ABILITIES[id]
);

export const ACHIEVEMENT_DEFINITIONS: AchievementDefinition[] = [
  {
    achievement_id: 'first_play',
    name: 'First Play · Langkah Pertama',
    description: 'Mulai permainan pertamamu untuk membuka Skill Aktif: Dash (0.5 dtk, CD 8 dtk).',
    category: 'progression',
    event_type: 'first_play',
    target_value: 1,
    reward_id: 'dash',
    icon: 'fish_bronze',
  },
  {
    achievement_id: 'score_100',
    name: 'Skor 100 · Perisai Pelindung',
    description: 'Capai 100 Skor untuk membuka Skill Pasif: Shield (menahan 1 tabrakan fatal per run).',
    category: 'gameplay',
    event_type: 'score_earned',
    target_value: 100,
    reward_id: 'shield',
    icon: 'fish_silver',
  },
  {
    achievement_id: 'score_200',
    name: 'Skor 200 · Pengendali Waktu',
    description: 'Capai 200 Skor untuk membuka Skill Aktif: Time Freeze (pipa melambat 45% selama 3 dtk, CD 15 dtk).',
    category: 'gameplay',
    event_type: 'score_earned',
    target_value: 200,
    reward_id: 'time_freeze',
    icon: 'pipe_emerald',
  },
  {
    achievement_id: 'score_300',
    name: 'Skor 300 · Magnet Koleksi',
    description: 'Capai 300 Skor untuk membuka Skill Pasif: Magnet (menarik koleksi otomatis dalam radius 125 unit).',
    category: 'gameplay',
    event_type: 'score_earned',
    target_value: 300,
    reward_id: 'magnet',
    icon: 'star_crest',
  },
  {
    achievement_id: 'score_400',
    name: 'Skor 400 · Kesempatan Kedua',
    description: 'Capai 400 Skor untuk membuka Skill Pasif: Second Chance (1x bangkit kembali ke posisi aman + kebal 1 dtk).',
    category: 'gameplay',
    event_type: 'score_earned',
    target_value: 400,
    reward_id: 'second_chance',
    icon: 'pipe_crown',
  },
  {
    achievement_id: 'score_500',
    name: 'Skor 500 · Mode Wapres Ultimate',
    description: 'Capai 500 Skor untuk membuka Skill Ultimate: Wapres (transformasi Wapres & kebal penuh 4 dtk, 1x per run)!',
    category: 'gameplay',
    event_type: 'score_earned',
    target_value: 500,
    reward_id: 'wapres',
    icon: 'fish_gold',
  },
];

/**
 * Normalizes any legacy power IDs from older localStorage saves to the canonical 6-power IDs.
 */
export function normalizePowerId(raw: unknown): PowerAbilityId {
  if (typeof raw !== 'string') return 'none';
  if (Object.prototype.hasOwnProperty.call(POWER_ABILITIES, raw)) {
    return raw as PowerAbilityId;
  }
  const legacyMap: Record<string, PowerAbilityId> = {
    power_dash: 'dash',
    power_shield: 'shield',
    power_laser: 'time_freeze',
    power_shockwave: 'magnet',
    power_overdrive: 'second_chance',
    power_godmode: 'wapres',
  };
  return legacyMap[raw] ?? 'none';
}
