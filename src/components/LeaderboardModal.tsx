import React, { useState } from 'react';
import {
  ClientLeaderboardData,
  ClientPlayerProfile,
} from '../game/playerClient';

interface LeaderboardModalProps {
  profile: ClientPlayerProfile | null;
  leaderboard: ClientLeaderboardData | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onUpdateUsername: (newUsername: string) => Promise<void>;
  onClose: () => void;
}

export const LeaderboardModal: React.FC<LeaderboardModalProps> = ({
  profile,
  leaderboard,
  loading,
  error,
  onRetry,
  onUpdateUsername,
  onClose,
}) => {
  const [editingName, setEditingName] = useState(false);
  const [usernameInput, setUsernameInput] = useState(profile?.username ?? '');
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameSuccess, setNameSuccess] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const handleStartEdit = () => {
    setUsernameInput(profile?.username ?? '');
    setNameError(null);
    setNameSuccess(null);
    setEditingName(true);
  };

  const handleSubmitUsername = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(null);

    const trimmed = usernameInput.trim().replace(/\s+/g, ' ');
    if (trimmed.length < 3 || trimmed.length > 20) {
      setNameError('Username harus terdiri dari 3 hingga 20 karakter.');
      return;
    }
    if (!/^[a-zA-Z0-9_ -]+$/.test(trimmed)) {
      setNameError('Gunakan hanya huruf, angka, spasi, garis bawah (_), atau strip (-).');
      return;
    }

    setSavingName(true);
    try {
      await onUpdateUsername(trimmed);
      setEditingName(false);
      setNameSuccess('Username berhasil diperbarui!');
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'Gagal memperbarui username.');
    } finally {
      setSavingName(false);
    }
  };

  const entries = leaderboard?.entries ?? [];
  const currentRank = leaderboard?.currentPlayer?.rank ?? profile?.rank;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#120D1D]/80 pointer-events-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="leaderboard-modal-title"
    >
      <div className="w-full max-w-2xl max-h-[calc(100dvh-1rem)] sm:max-h-[90vh] flex flex-col bg-[#231836] border-[3px] sm:border-[4px] border-[#181425] rounded-2xl sm:rounded-3xl p-4 sm:p-5 md:p-6 shadow-[0_10px_0_#181425] text-[#FFF8E7]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 pb-4 border-b-2 border-[#362452]">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-widest text-[#FDE68A]">
              PAPAN PERINGKAT & PROFIL
            </div>
            <h2
              id="leaderboard-modal-title"
              className="font-display text-2xl md:text-3xl font-bold text-[#FFF8E7] hud-stroke-sm"
            >
              Legenda Atap Senja
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup Papan Peringkat"
            className="px-3.5 py-2 rounded-xl bg-[#362452] hover:bg-[#463068] border-2 border-[#181425] shadow-[0_3px_0_#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer"
          >
            <span>Tutup</span><span className="hidden sm:inline"> [Esc]</span>
          </button>
        </div>

        {/* Player Identity & Editable Username Banner */}
        <div className="mt-4 bg-[#181126] border-2 border-[#181425] rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#FDE68A]">
                  PROFIL
                </span>
                {currentRank && (
                  <span className="text-xs font-mono-tabular font-extrabold text-[#38BDF8]">
                    PERINGKAT #{currentRank}
                  </span>
                )}
              </div>

              {!editingName ? (
                <div className="flex items-center gap-3 mt-1">
                  <span
                    data-testid="profile-username"
                    className="font-display text-xl font-bold text-[#FFF8E7]"
                  >
                    {profile?.username ?? 'Memuat...'}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="px-2.5 py-1 rounded-lg bg-[#362452] hover:bg-[#463068] border-2 border-[#181425] text-xs font-bold text-[#FDE047] cursor-pointer"
                  >
                    Ubah Nama
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitUsername} className="mt-2 flex flex-wrap items-center gap-2">
                  <label htmlFor="username-edit-input" className="sr-only">
                    Username Baru
                  </label>
                  <input
                    id="username-edit-input"
                    type="text"
                    value={usernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    maxLength={20}
                    placeholder="3-20 karakter"
                    disabled={savingName}
                    className="px-3 py-1.5 rounded-xl bg-[#261B3A] border-2 border-[#FACC15] text-sm font-bold text-[#FFF8E7] focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="px-3.5 py-1.5 rounded-xl bg-[#10B981] hover:bg-[#059669] border-2 border-[#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer disabled:opacity-50"
                  >
                    {savingName ? 'Menyimpan...' : 'Simpan'}
                  </button>
                  <button
                    type="button"
                    disabled={savingName}
                    onClick={() => {
                      setEditingName(false);
                      setNameError(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#362452] border-2 border-[#181425] text-xs font-bold text-[#E2E8F0] cursor-pointer"
                  >
                    Batal
                  </button>
                </form>
              )}

              {nameError && (
                <p role="alert" className="mt-1.5 text-xs font-bold text-[#FB7185]">
                  {nameError}
                </p>
              )}
              {nameSuccess && (
                <p role="status" className="mt-1.5 text-xs font-bold text-[#34D399]">
                  {nameSuccess}
                </p>
              )}
            </div>

            {/* Current Player Quick Stats */}
            {profile && (
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-[#231836] border border-[#362452] rounded-xl px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase text-[#FDE68A]">SKOR</div>
                  <div className="text-base font-extrabold font-mono-tabular text-[#FACC15]">
                    {Math.round(profile.best_score)}
                  </div>
                </div>
                <div className="bg-[#231836] border border-[#362452] rounded-xl px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase text-[#FDE68A]">IKAN</div>
                  <div className="text-base font-extrabold font-mono-tabular text-[#38BDF8]">
                    {Math.round(profile.total_fish_collected)}
                  </div>
                </div>
                <div className="bg-[#231836] border border-[#362452] rounded-xl px-3 py-1.5">
                  <div className="text-[10px] font-bold uppercase text-[#FDE68A]">ATAP</div>
                  <div className="text-base font-extrabold font-mono-tabular text-[#34D399]">
                    {Math.round(profile.total_pipes_cleared)}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Leaderboard Table Region */}
        <div className="mt-4 flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="py-12 text-center text-sm font-bold text-[#FDE68A]">
              Memuat data papan peringkat dari database...
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm font-bold text-[#FB7185] mb-3">{error}</p>
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 rounded-xl bg-[#F97316] hover:bg-[#EA580C] border-2 border-[#181425] shadow-[0_3px_0_#181425] text-xs font-bold text-[#FFF8E7] cursor-pointer"
              >
                Muat Ulang Peringkat
              </button>
            </div>
          ) : entries.length === 0 ? (
            <div className="py-12 text-center text-sm font-semibold text-[#E2E8F0]">
              Belum ada skor tercatat. Jadilah Barudak pertama yang menaklukkan atap!
            </div>
          ) : (
            <table className="w-full text-left border-collapse" aria-label="Daftar Peringkat Pemain">
              <thead>
                <tr className="border-b-2 border-[#362452] text-[11px] font-extrabold uppercase text-[#FDE68A]">
                  <th className="py-2 px-3">Rank</th>
                  <th className="py-2 px-3">Pemain</th>
                  <th className="py-2 px-3 text-right">Skor</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell">Atap</th>
                  <th className="py-2 px-3 text-right hidden sm:table-cell">Ikan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2E2046] text-sm">
                {entries.map((entry) => {
                  const isCurrentPlayer = profile?.player_id === entry.player_id;
                  return (
                    <tr
                      key={entry.player_id}
                      data-testid={isCurrentPlayer ? 'leaderboard-current-player-row' : undefined}
                      className={
                        isCurrentPlayer
                          ? 'bg-[#362452] font-bold text-[#FFF8E7]'
                          : 'hover:bg-[#2A1D40] text-[#E2E8F0]'
                      }
                    >
                      <td className="py-2.5 px-3 font-mono-tabular font-extrabold text-[#FDE047]">
                        #{entry.rank}
                      </td>
                      <td className="py-2.5 px-3">
                        <span>{entry.username}</span>
                        {isCurrentPlayer && (
                          <span className="ml-2 text-[10px] font-extrabold uppercase text-[#38BDF8]">
                            (Kamu)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular font-extrabold text-[#FFF8E7]">
                        {Math.round(entry.best_score)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-[#34D399] hidden sm:table-cell">
                        {Math.round(entry.total_pipes_cleared)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono-tabular text-[#38BDF8] hidden sm:table-cell">
                        {Math.round(entry.total_fish_collected)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
