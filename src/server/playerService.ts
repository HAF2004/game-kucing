import { PlayerRepository, PublicPlayerProfile } from './playerRepository';
import { SecurityService } from './securityService';

export class ServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 400, code = 'BAD_REQUEST') {
    super(message);
    this.name = 'ServiceError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export interface RegisterOrRetrieveInput {
  deviceId: string;
  authToken?: string;
  preferredUsername?: string;
  recoveryPlayerId?: string;
  ipAddress?: string;
}

export interface RegisterOrRetrieveResult {
  profile: PublicPlayerProfile;
  /** Returned when a new profile is created or when existing token is verified */
  authToken: string;
  isNewProfile: boolean;
  recovered: boolean;
}

export class PlayerService {
  private repo: PlayerRepository;
  private security: SecurityService;

  constructor(repo: PlayerRepository, security: SecurityService) {
    this.repo = repo;
    this.security = security;
  }

  /**
   * Registers a new player profile for a device on first launch, or retrieves
   * the existing profile on subsequent launches.
   * Never silently creates a replacement player if an existing device identity cannot be verified.
   */
  public registerOrRetrieveProfile(input: RegisterOrRetrieveInput): RegisterOrRetrieveResult {
    const ipHash = input.ipAddress ? this.security.hashSecret(input.ipAddress) : null;
    const deviceCheck = this.security.validateDeviceId(input.deviceId);
    if (!deviceCheck.valid) {
      this.repo.logSecurityEvent({
        event_type: 'INVALID_DEVICE_ID',
        device_id: typeof input.deviceId === 'string' ? input.deviceId : null,
        ip_hash: ipHash,
        reason: deviceCheck.reason ?? 'Invalid device ID',
      });
      throw new ServiceError(
        deviceCheck.reason ?? 'Device ID tidak valid.',
        400,
        deviceCheck.code ?? 'INVALID_DEVICE_ID'
      );
    }

    const deviceId = input.deviceId.trim();
    const rate = this.security.checkRateLimit('register', ipHash ?? deviceId, {
      windowMs: 60_000,
      maxRequests: 30,
      baseBackoffMs: 2_000,
    });
    if (!rate.allowed) {
      this.repo.logSecurityEvent({
        event_type: 'RATE_LIMIT_REGISTER',
        device_id: deviceId,
        ip_hash: ipHash,
        reason: `Rate limit exceeded; retry in ${rate.retryAfterMs}ms`,
      });
      throw new ServiceError(
        'Terlalu banyak permintaan pendaftaran. Silakan tunggu beberapa detik.',
        429,
        'RATE_LIMITED'
      );
    }

    return this.repo.runInTransaction(() => {
      const nowIso = new Date().toISOString();

      // 1. Check if this device_id already has a registered profile
      const existingByDevice = this.repo.findByDeviceId(deviceId);
      if (existingByDevice) {
        if (
          !input.authToken ||
          !this.security.verifyAuthToken(input.authToken, existingByDevice.auth_token_hash)
        ) {
          this.repo.logSecurityEvent({
            event_type: 'UNVERIFIED_DEVICE_ACCESS',
            player_id: existingByDevice.player_id,
            device_id: deviceId,
            ip_hash: ipHash,
            reason: 'Attempted to claim existing device_id without valid auth token.',
          });
          throw new ServiceError(
            'Profil perangkat sudah terdaftar tetapi token autentikasi tidak cocok.',
            401,
            'DEVICE_IDENTITY_UNVERIFIED'
          );
        }

        this.repo.touchLastActive(existingByDevice.player_id, nowIso);
        const refreshed = this.repo.findByPlayerId(existingByDevice.player_id)!;
        return {
          profile: this.repo.toPublicProfile(refreshed),
          authToken: input.authToken,
          isNewProfile: false,
          recovered: false,
        };
      }

      // 2. Recovery strategy if device_id was regenerated after storage corruption,
      //    but recoveryPlayerId + valid authToken were preserved in backup storage
      if (input.recoveryPlayerId && input.authToken) {
        const existingByPlayerId = this.repo.findByPlayerId(input.recoveryPlayerId.trim());
        if (!existingByPlayerId) {
          this.repo.logSecurityEvent({
            event_type: 'RECOVERY_PLAYER_NOT_FOUND',
            player_id: input.recoveryPlayerId,
            device_id: deviceId,
            ip_hash: ipHash,
            reason: 'Recovery player ID does not exist.',
          });
          throw new ServiceError(
            'Profil pemulihan tidak ditemukan.',
            404,
            'RECOVERY_NOT_FOUND'
          );
        }

        if (!this.security.verifyAuthToken(input.authToken, existingByPlayerId.auth_token_hash)) {
          this.repo.logSecurityEvent({
            event_type: 'RECOVERY_TOKEN_MISMATCH',
            player_id: existingByPlayerId.player_id,
            device_id: deviceId,
            ip_hash: ipHash,
            reason: 'Invalid token during profile recovery attempt.',
          });
          throw new ServiceError(
            'Token pemulihan tidak sah.',
            401,
            'RECOVERY_UNAUTHORIZED'
          );
        }

        this.repo.updatePlayerDeviceBinding(existingByPlayerId.player_id, deviceId, nowIso);
        const recoveredRecord = this.repo.findByPlayerId(existingByPlayerId.player_id)!;
        return {
          profile: this.repo.toPublicProfile(recoveredRecord),
          authToken: input.authToken,
          isNewProfile: false,
          recovered: true,
        };
      }

      // 3. First-time device launch: generate immutable player_id, secret authToken, and unique username
      const playerId = this.security.generatePlayerId();
      const authToken = this.security.generateAuthToken();
      const authTokenHash = this.security.hashSecret(authToken);

      const { username, normalizedUsername } = this.allocateUniqueInitialUsername(
        input.preferredUsername,
        playerId
      );

      const created = this.repo.createPlayer({
        player_id: playerId,
        device_id: deviceId,
        auth_token_hash: authTokenHash,
        username,
        normalized_username: normalizedUsername,
        nowIso,
      });

      return {
        profile: this.repo.toPublicProfile(created),
        authToken,
        isNewProfile: true,
        recovered: false,
      };
    });
  }

  public getProfileByPlayerId(playerId: string): PublicPlayerProfile {
    const record = this.repo.findByPlayerId(playerId);
    if (!record) {
      throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
    }
    return this.repo.toPublicProfile(record);
  }

  /**
   * Updates an existing player's display username without creating a duplicate player
   * or altering their score, achievements, or leaderboard rank.
   */
  public updateUsername(params: {
    playerId: string;
    authToken: string;
    newUsername: unknown;
    ipAddress?: string;
  }): PublicPlayerProfile {
    const ipHash = params.ipAddress ? this.security.hashSecret(params.ipAddress) : null;

    if (typeof params.playerId !== 'string' || !params.playerId.trim()) {
      throw new ServiceError('Player ID wajib diisi.', 400, 'INVALID_PLAYER_ID');
    }

    const playerId = params.playerId.trim();
    const rate = this.security.checkRateLimit('username_update', playerId, {
      windowMs: 60_000,
      maxRequests: 10,
      baseBackoffMs: 2_000,
    });
    if (!rate.allowed) {
      this.repo.logSecurityEvent({
        event_type: 'RATE_LIMIT_USERNAME',
        player_id: playerId,
        ip_hash: ipHash,
        reason: `Username change rate limit exceeded`,
      });
      throw new ServiceError(
        'Terlalu sering mengubah username. Coba lagi sebentar lagi.',
        429,
        'RATE_LIMITED'
      );
    }

    const validation = this.security.validateAndNormalizeUsername(params.newUsername);
    if (!validation.valid || !validation.username || !validation.normalizedUsername) {
      this.repo.logSecurityEvent({
        event_type: 'INVALID_USERNAME_ATTEMPT',
        player_id: playerId,
        ip_hash: ipHash,
        reason: validation.reason ?? 'Invalid username format',
      });
      throw new ServiceError(
        validation.reason ?? 'Format username tidak valid.',
        400,
        validation.code ?? 'INVALID_USERNAME'
      );
    }

    return this.repo.runInTransaction(() => {
      const existingPlayer = this.repo.findByPlayerId(playerId);
      if (!existingPlayer) {
        throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
      }

      if (!this.security.verifyAuthToken(params.authToken, existingPlayer.auth_token_hash)) {
        this.repo.logSecurityEvent({
          event_type: 'UNAUTHORIZED_USERNAME_UPDATE',
          player_id: playerId,
          ip_hash: ipHash,
          reason: 'Invalid or missing auth token for username update.',
        });
        throw new ServiceError(
          'Tidak memiliki izin untuk mengubah profil pemain ini.',
          403,
          'UNAUTHORIZED'
        );
      }

      const conflict = this.repo.findByNormalizedUsername(validation.normalizedUsername!);
      if (conflict && conflict.player_id !== playerId) {
        throw new ServiceError(
          'Username tersebut sudah digunakan pemain lain. Pilih nama lain!',
          409,
          'USERNAME_TAKEN'
        );
      }

      const updated = this.repo.updateUsername({
        player_id: playerId,
        username: validation.username!,
        normalized_username: validation.normalizedUsername!,
        nowIso: new Date().toISOString(),
      });

      return this.repo.toPublicProfile(updated);
    });
  }

  private allocateUniqueInitialUsername(
    preferred: string | undefined,
    playerId: string
  ): { username: string; normalizedUsername: string } {
    if (preferred) {
      const check = this.security.validateAndNormalizeUsername(preferred);
      if (check.valid && check.username && check.normalizedUsername) {
        const collision = this.repo.findByNormalizedUsername(check.normalizedUsername);
        if (!collision) {
          return {
            username: check.username,
            normalizedUsername: check.normalizedUsername,
          };
        }
      }
    }

    const suffix = playerId.replace(/^plr_/, '').slice(0, 4).toUpperCase();
    const baseCandidates = [
      `Barudak_${suffix}`,
      `Pirang_${suffix}`,
      `Atap_${suffix}`,
      `Jagoan_${playerId.slice(-5).toUpperCase()}`,
    ];

    for (const candidate of baseCandidates) {
      const norm = candidate.toLowerCase();
      if (!this.repo.findByNormalizedUsername(norm)) {
        return { username: candidate, normalizedUsername: norm };
      }
    }

    const fallback = `Barudak_${Date.now().toString(36).slice(-6).toUpperCase()}`;
    return { username: fallback, normalizedUsername: fallback.toLowerCase() };
  }
}
