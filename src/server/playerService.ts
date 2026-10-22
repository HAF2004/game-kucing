import { PlayerRepository, PublicPlayerProfile, RepositoryTransaction } from './playerRepository';
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
  /** Returned when a new profile is created or an existing token is verified. */
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

  /** Registers, retrieves, or securely recovers the persistent device profile. */
  public async registerOrRetrieveProfile(
    input: RegisterOrRetrieveInput
  ): Promise<RegisterOrRetrieveResult> {
    const ipHash = input.ipAddress ? this.security.hashSecret(input.ipAddress) : null;
    const deviceId = typeof input.deviceId === 'string' ? input.deviceId.trim() : '';
    const rateSubject = this.security.hashSecret(ipHash ?? (deviceId.slice(0, 128) || 'invalid-device'));
    const rate = await this.repo.checkRateLimit('register', rateSubject, {
      windowMs: 60_000,
      maxRequests: 30,
      baseBackoffMs: 2_000,
    });
    if (!rate.allowed) {
      await this.repo.logSecurityEvent({
        event_type: 'RATE_LIMIT_REGISTER',
        device_id: deviceId ? deviceId.slice(0, 128) : null,
        ip_hash: ipHash,
        reason: 'Rate limit exceeded; retry in ' + rate.retryAfterMs + 'ms',
      });
      throw new ServiceError(
        'Terlalu banyak permintaan pendaftaran. Silakan tunggu beberapa detik.',
        429,
        'RATE_LIMITED'
      );
    }

    const deviceCheck = this.security.validateDeviceId(input.deviceId);
    if (!deviceCheck.valid) {
      await this.repo.logSecurityEvent({
        event_type: 'INVALID_DEVICE_ID',
        device_id: deviceId ? deviceId.slice(0, 128) : null,
        ip_hash: ipHash,
        reason: deviceCheck.reason ?? 'Invalid device ID',
      });
      throw new ServiceError(
        deviceCheck.reason ?? 'Device ID tidak valid.',
        400,
        deviceCheck.code ?? 'INVALID_DEVICE_ID'
      );
    }

    return this.repo.runInTransaction(async (scope) => {
      const tx = scope.sql;
      const nowIso = new Date().toISOString();
      const existingByDevice = await this.repo.findByDeviceId(deviceId, tx);

      if (existingByDevice) {
        if (
          !input.authToken ||
          !this.security.verifyAuthToken(input.authToken, existingByDevice.auth_token_hash)
        ) {
          await this.repo.logSecurityEvent(
            {
              event_type: 'UNVERIFIED_DEVICE_ACCESS',
              player_id: existingByDevice.player_id,
              device_id: deviceId,
              ip_hash: ipHash,
              reason: 'Attempted to claim existing device_id without valid auth token.',
            },
            scope
          );
          throw new ServiceError(
            'Profil perangkat sudah terdaftar tetapi token autentikasi tidak cocok.',
            401,
            'DEVICE_IDENTITY_UNVERIFIED'
          );
        }

        await this.repo.touchLastActive(existingByDevice.player_id, nowIso, tx);
        const refreshed = await this.repo.findByPlayerId(existingByDevice.player_id, tx);
        if (!refreshed) throw new Error('Player profile disappeared during session refresh.');
        return {
          profile: await this.repo.toPublicProfile(refreshed, tx),
          authToken: input.authToken,
          isNewProfile: false,
          recovered: false,
        };
      }

      // Recovery after local device storage was regenerated.
      if (input.recoveryPlayerId && input.authToken) {
        const recoveryPlayerId = input.recoveryPlayerId.trim();
        const existingByPlayerId = await this.repo.findByPlayerId(recoveryPlayerId, tx);
        if (!existingByPlayerId) {
          await this.repo.logSecurityEvent(
            {
              event_type: 'RECOVERY_PLAYER_NOT_FOUND',
              player_id: recoveryPlayerId,
              device_id: deviceId,
              ip_hash: ipHash,
              reason: 'Recovery player ID does not exist.',
            },
            scope
          );
          throw new ServiceError('Profil pemulihan tidak ditemukan.', 404, 'RECOVERY_NOT_FOUND');
        }

        if (!this.security.verifyAuthToken(input.authToken, existingByPlayerId.auth_token_hash)) {
          await this.repo.logSecurityEvent(
            {
              event_type: 'RECOVERY_TOKEN_MISMATCH',
              player_id: existingByPlayerId.player_id,
              device_id: deviceId,
              ip_hash: ipHash,
              reason: 'Invalid token during profile recovery attempt.',
            },
            scope
          );
          throw new ServiceError('Token pemulihan tidak sah.', 401, 'RECOVERY_UNAUTHORIZED');
        }

        await this.repo.updatePlayerDeviceBinding(
          existingByPlayerId.player_id,
          deviceId,
          nowIso,
          tx
        );
        const recoveredRecord = await this.repo.findByPlayerId(existingByPlayerId.player_id, tx);
        if (!recoveredRecord) throw new Error('Player profile disappeared during recovery.');
        return {
          profile: await this.repo.toPublicProfile(recoveredRecord, tx),
          authToken: input.authToken,
          isNewProfile: false,
          recovered: true,
        };
      }

      const playerId = this.security.generatePlayerId();
      const authToken = this.security.generateAuthToken();
      const authTokenHash = this.security.hashSecret(authToken);
      const { username, normalizedUsername } = await this.allocateUniqueInitialUsername(
        input.preferredUsername,
        playerId,
        scope
      );
      const created = await this.repo.createPlayer(
        {
          player_id: playerId,
          device_id: deviceId,
          auth_token_hash: authTokenHash,
          username,
          normalized_username: normalizedUsername,
          nowIso,
        },
        tx
      );

      return {
        profile: await this.repo.toPublicProfile(created, tx),
        authToken,
        isNewProfile: true,
        recovered: false,
      };
    });
  }

  public async getProfileByPlayerId(playerId: string): Promise<PublicPlayerProfile> {
    const record = await this.repo.findByPlayerId(playerId);
    if (!record) {
      throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
    }
    return this.repo.toPublicProfile(record);
  }

  /** Updates the existing player record without changing their score or rank. */
  public async updateUsername(params: {
    playerId: string;
    authToken: string;
    newUsername: unknown;
    ipAddress?: string;
  }): Promise<PublicPlayerProfile> {
    const ipHash = params.ipAddress ? this.security.hashSecret(params.ipAddress) : null;
    if (typeof params.playerId !== 'string' || !params.playerId.trim()) {
      throw new ServiceError('Player ID wajib diisi.', 400, 'INVALID_PLAYER_ID');
    }

    const playerId = params.playerId.trim();
    const rate = await this.repo.checkRateLimit(
      'username_update',
      this.security.hashSecret(playerId),
      { windowMs: 60_000, maxRequests: 10, baseBackoffMs: 2_000 }
    );
    if (!rate.allowed) {
      await this.repo.logSecurityEvent({
        event_type: 'RATE_LIMIT_USERNAME',
        player_id: playerId,
        ip_hash: ipHash,
        reason: 'Username change rate limit exceeded',
      });
      throw new ServiceError(
        'Terlalu sering mengubah username. Coba lagi sebentar lagi.',
        429,
        'RATE_LIMITED'
      );
    }

    const validation = this.security.validateAndNormalizeUsername(params.newUsername);
    if (!validation.valid || !validation.username || !validation.normalizedUsername) {
      await this.repo.logSecurityEvent({
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
    const username = validation.username;
    const normalizedUsername = validation.normalizedUsername;

    return this.repo.runInTransaction(async (scope) => {
      const tx = scope.sql;
      const existingPlayer = await this.repo.findByPlayerId(playerId, tx);
      if (!existingPlayer) {
        throw new ServiceError('Profil pemain tidak ditemukan.', 404, 'PLAYER_NOT_FOUND');
      }

      if (!this.security.verifyAuthToken(params.authToken, existingPlayer.auth_token_hash)) {
        await this.repo.logSecurityEvent(
          {
            event_type: 'UNAUTHORIZED_USERNAME_UPDATE',
            player_id: playerId,
            ip_hash: ipHash,
            reason: 'Invalid or missing auth token for username update.',
          },
          scope
        );
        throw new ServiceError(
          'Tidak memiliki izin untuk mengubah profil pemain ini.',
          403,
          'UNAUTHORIZED'
        );
      }

      const conflict = await this.repo.findByNormalizedUsername(
        normalizedUsername,
        tx
      );
      if (conflict && conflict.player_id !== playerId) {
        throw new ServiceError(
          'Username tersebut sudah digunakan pemain lain. Pilih nama lain!',
          409,
          'USERNAME_TAKEN'
        );
      }

      const updated = await this.repo.updateUsername(
        {
          player_id: playerId,
          username,
          normalized_username: normalizedUsername,
          nowIso: new Date().toISOString(),
        },
        tx
      );
      return this.repo.toPublicProfile(updated, tx);
    });
  }

  private async allocateUniqueInitialUsername(
    preferred: string | undefined,
    playerId: string,
    scope: RepositoryTransaction
  ): Promise<{ username: string; normalizedUsername: string }> {
    if (preferred) {
      const check = this.security.validateAndNormalizeUsername(preferred);
      if (check.valid && check.username && check.normalizedUsername) {
        const username = check.username;
        const normalizedUsername = check.normalizedUsername;
        const collision = await this.repo.findByNormalizedUsername(
          normalizedUsername,
          scope.sql
        );
        if (!collision) {
          return { username, normalizedUsername };
        }
      }
    }

    const suffix = playerId.replace(/^plr_/, '').slice(0, 4).toUpperCase();
    const candidates = [
      'Barudak_' + suffix,
      'Pirang_' + suffix,
      'Atap_' + suffix,
      'Jagoan_' + playerId.slice(-5).toUpperCase(),
    ];
    for (const candidate of candidates) {
      const normalizedUsername = candidate.toLowerCase();
      if (!(await this.repo.findByNormalizedUsername(normalizedUsername, scope.sql))) {
        return { username: candidate, normalizedUsername };
      }
    }

    const fallback = 'Barudak_' + Date.now().toString(36).slice(-6).toUpperCase();
    return { username: fallback, normalizedUsername: fallback.toLowerCase() };
  }
}
