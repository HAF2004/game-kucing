export interface ClientPlayerProfile {
  player_id: string;
  device_id: string;
  username: string;
  created_at: string;
  updated_at: string;
  best_score: number;
  total_score: number;
  total_fish_collected: number;
  total_pipes_cleared: number;
  runs_played: number;
  last_active_at: string;
  rank?: number;
}

export interface ClientLeaderboardEntry {
  rank: number;
  player_id: string;
  username: string;
  best_score: number;
  total_score: number;
  total_fish_collected: number;
  total_pipes_cleared: number;
  runs_played: number;
  updated_at: string;
}

export interface ClientLeaderboardData {
  entries: ClientLeaderboardEntry[];
  totalPlayers: number;
  limit: number;
  offset: number;
  currentPlayer?: ClientLeaderboardEntry;
}

interface StoredDeviceCredentials {
  schemaVersion: 1;
  deviceId: string;
  playerId: string | null;
  authToken: string | null;
}

const DEVICE_STORAGE_KEY = 'game.device_identity.v1';
const DEVICE_RECOVERY_KEY = 'game.device_recovery_backup.v1';

function generateLocalDeviceId(): string {
  const bytes = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `dev_${hex}`;
}

export function generateRunIdempotencyKey(playerId: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const cleanId = (playerId || 'anon').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  return `run_${cleanId}_${Date.now()}_${rand}`;
}

export class PlayerApiClient {
  private credentials: StoredDeviceCredentials;

  constructor() {
    this.credentials = this.loadOrInitializeCredentials();
  }

  private loadOrInitializeCredentials(): StoredDeviceCredentials {
    let primary: Partial<StoredDeviceCredentials> | null = null;
    let backup: Partial<StoredDeviceCredentials> | null = null;

    try {
      const raw = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (raw) primary = JSON.parse(raw);
    } catch {
      primary = null;
    }

    try {
      const rawBackup = sessionStorage.getItem(DEVICE_RECOVERY_KEY);
      if (rawBackup) backup = JSON.parse(rawBackup);
    } catch {
      backup = null;
    }

    const validDeviceId = (id: unknown): id is string =>
      typeof id === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(id);

    const deviceId = validDeviceId(primary?.deviceId)
      ? primary!.deviceId
      : validDeviceId(backup?.deviceId)
      ? backup!.deviceId
      : generateLocalDeviceId();

    const playerId =
      typeof primary?.playerId === 'string' && primary.playerId
        ? primary.playerId
        : typeof backup?.playerId === 'string' && backup.playerId
        ? backup.playerId
        : null;

    const authToken =
      typeof primary?.authToken === 'string' && primary.authToken
        ? primary.authToken
        : typeof backup?.authToken === 'string' && backup.authToken
        ? backup.authToken
        : null;

    const creds: StoredDeviceCredentials = {
      schemaVersion: 1,
      deviceId,
      playerId,
      authToken,
    };

    this.saveCredentials(creds);
    return creds;
  }

  private saveCredentials(creds: StoredDeviceCredentials): void {
    this.credentials = creds;
    try {
      localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(creds));
    } catch {
      // ignore storage errors
    }
    try {
      sessionStorage.setItem(DEVICE_RECOVERY_KEY, JSON.stringify(creds));
    } catch {
      // ignore storage errors
    }
  }

  public getDeviceId(): string {
    return this.credentials.deviceId;
  }

  public getPlayerId(): string | null {
    return this.credentials.playerId;
  }

  /**
   * Initializes or retrieves the persistent device profile from the SQLite backend.
   */
  public async initSession(): Promise<ClientPlayerProfile> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.credentials.authToken) {
      headers['X-Player-Token'] = this.credentials.authToken;
    }

    const res = await fetch('/api/v1/players/session', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        deviceId: this.credentials.deviceId,
        recoveryPlayerId: this.credentials.playerId ?? undefined,
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || 'Gagal memuat profil pemain.');
    }

    const { profile, authToken } = json.data as {
      profile: ClientPlayerProfile;
      authToken: string;
    };

    this.saveCredentials({
      schemaVersion: 1,
      deviceId: profile.device_id || this.credentials.deviceId,
      playerId: profile.player_id,
      authToken: authToken || this.credentials.authToken,
    });

    return profile;
  }

  /**
   * Updates the current player's display username in-place without creating a new player record.
   */
  public async updateUsername(newUsername: string): Promise<ClientPlayerProfile> {
    if (!this.credentials.playerId || !this.credentials.authToken) {
      await this.initSession();
    }

    const playerId = this.credentials.playerId!;
    const res = await fetch(`/api/v1/players/${encodeURIComponent(playerId)}/username`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Player-Token': this.credentials.authToken || '',
      },
      body: JSON.stringify({ username: newUsername }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || 'Gagal memperbarui username.');
    }

    return json.data.profile as ClientPlayerProfile;
  }

  /**
   * Fetches the global leaderboard and current player's rank.
   */
  public async fetchLeaderboard(limit = 20, offset = 0): Promise<ClientLeaderboardData> {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (this.credentials.playerId) {
      params.set('playerId', this.credentials.playerId);
    }

    const res = await fetch(`/api/v1/leaderboard?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || 'Gagal memuat papan peringkat.');
    }

    return json.data as ClientLeaderboardData;
  }

  /**
   * Submits a completed run score with an idempotency key for server-side validation.
   */
  public async submitRunScore(params: {
    idempotencyKey: string;
    score: number;
    fishCollected: number;
    pipesCleared: number;
    durationMs: number;
  }): Promise<{
    profile: ClientPlayerProfile;
    leaderboardEntry: ClientLeaderboardEntry;
    idempotentReplay: boolean;
    newPersonalBest: boolean;
  }> {
    if (!this.credentials.playerId || !this.credentials.authToken) {
      await this.initSession();
    }

    const res = await fetch('/api/v1/leaderboard/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Player-Token': this.credentials.authToken || '',
      },
      body: JSON.stringify({
        playerId: this.credentials.playerId,
        idempotencyKey: params.idempotencyKey,
        score: Math.round(params.score),
        fishCollected: Math.round(params.fishCollected),
        pipesCleared: Math.round(params.pipesCleared),
        durationMs: Math.max(450, Math.round(params.durationMs)),
      }),
    });

    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(json?.error?.message || 'Gagal mengirim skor ke server.');
    }

    return json.data;
  }
}
