import React, { useState } from 'react';
import { Copy, Check, Crown, Mic, Bot, Shield, Play, Users, LogOut } from 'lucide-react';
import { computeCountryMilitary } from '../../shared/advisor';
import { CountryId, GameRoomState, GameSettings } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface LobbyScreenProps {
  room: GameRoomState;
  playerId: string;
  onSelectRole: (countryId: CountryId | null, asGM?: boolean) => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
  errorFa: string | null;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  playerId,
  onSelectRole,
  onUpdateSettings,
  onStartGame,
  onLeaveLobby,
  errorFa,
}) => {
  const [copied, setCopied] = useState(false);
  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`
      : room.roomCode;

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const countries = Object.values(room.countries);

  return (
    <div className="min-h-screen tactical-grid-bg px-3 sm:px-6 py-5">
      <div className="max-w-7xl mx-auto space-y-5">
        {/* Top Lobby Bar */}
        <div className="bg-[#0b1220]/95 border border-slate-700/80 rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 font-mono font-bold text-emerald-300 text-sm tracking-widest">
                کد لابی: {room.roomCode}
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white">{room.roomName}</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              لینک دعوت را برای دوستات بفرست؛ هر کشوری که بازیکن انسانی برندارد توسط{' '}
              <span className="text-cyan-300 font-semibold">هوش مصنوعی استراتژیک</span> اداره می‌شود!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={copyInvite}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs sm:text-sm font-bold text-white flex items-center gap-2 transition"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
              {copied ? 'لینک دعوت کپی شد!' : 'کپی لینک دعوت دوستان'}
            </button>

            <button
              type="button"
              onClick={onLeaveLobby}
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition"
            >
              <LogOut className="w-4 h-4" />
              خروج
            </button>
          </div>
        </div>

        {errorFa && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-medium">
            {errorFa}
          </div>
        )}

        {/* Players + GM Switch + Start Button */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-[#0b1220]/90 border border-slate-800 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                اعضای حاضر در اتاق جنگ ({room.players.length} نفر)
              </h2>
              <span className="text-xs text-slate-400">
                {room.settings.gmMode === 'HUMAN' ? '🎙️ حالت راوی انسانی فعال' : '🤖 حالت راوی خودکار فعال'}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              {room.players.map((p) => {
                const c = p.countryId ? room.countries[p.countryId] : null;
                return (
                  <div
                    key={p.id}
                    className={`px-3.5 py-2 rounded-xl border text-xs sm:text-sm flex items-center gap-2 ${
                      p.id === playerId
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-white'
                        : 'bg-[#070d18] border-slate-800 text-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    <span className="font-bold">{p.name}</span>
                    <span className="text-slate-400">←</span>
                    {p.isGM ? (
                      <span className="text-amber-300 font-bold">🎙️ راوی کل جهان</span>
                    ) : c ? (
                      <span className="text-emerald-300 font-bold">
                        {c.flag} {c.nameFa}
                      </span>
                    ) : (
                      <span className="text-slate-500">در حال انتخاب کشور...</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host & GM Role Panel */}
          <div className="bg-[#0b1220]/90 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              {isHost && (
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
                  <span className="text-xs font-bold text-slate-300">حالت راوی:</span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ gmMode: 'AUTO' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                        room.settings.gmMode === 'AUTO'
                          ? 'bg-emerald-500 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Bot className="w-3.5 h-3.5" /> خودکار
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateSettings({ gmMode: 'HUMAN' })}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 ${
                        room.settings.gmMode === 'HUMAN'
                          ? 'bg-amber-400 text-slate-950'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Mic className="w-3.5 h-3.5" /> راوی انسانی
                    </button>
                  </div>
                </div>
              )}

              {room.settings.gmMode === 'HUMAN' && (
                <button
                  type="button"
                  onClick={() => onSelectRole(null, true)}
                  className={`w-full py-2.5 px-3 rounded-xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition ${
                    me?.isGM
                      ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                      : 'bg-slate-900 border-slate-700 text-slate-300 hover:border-amber-400/60'
                  }`}
                >
                  <Mic className="w-4 h-4 text-amber-400" />
                  {me?.isGM ? 'شما راوی و مجری کل جهان هستید ✓' : 'انتخاب نقش «راوی و مجری کل بازی»'}
                </button>
              )}
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={onStartGame}
                className="w-full py-3.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition"
              >
                <Play className="w-5 h-5 fill-current" />
                شروع بازی و باز کردن اتاق فرماندهی!
              </button>
            ) : (
              <div className="text-center py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-400">
                کشورت را انتخاب کن؛ منتظر شروع بازی توسط میزبان هستیم...
              </div>
            )}
          </div>
        </div>

        {/* 16 Real Countries Selection Grid */}
        <div>
          <h2 className="text-base sm:text-lg font-black text-white mb-3 flex items-center gap-2">
            <Shield className="w-5 h-5 text-emerald-400" />
            انتخاب کشور (بر اساس قدرت اقتصادی، انرژی و تسلیحات واقعی جهان)
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {countries.map((c) => {
              const isMine = c.playerId === playerId;
              const isTakenByOther = Boolean(c.playerId && c.playerId !== playerId);
              const mil = computeCountryMilitary(c);

              return (
                <button
                  key={c.id}
                  type="button"
                  disabled={isTakenByOther}
                  onClick={() => onSelectRole(c.id, false)}
                  className={`text-right rounded-2xl p-4 border transition flex flex-col justify-between gap-3 ${
                    isMine
                      ? 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/30 shadow-lg shadow-emerald-950'
                      : isTakenByOther
                      ? 'bg-slate-900/50 border-slate-800 opacity-65 cursor-not-allowed'
                      : 'bg-[#0b1220]/90 border-slate-800 hover:border-cyan-400/60 hover:bg-[#0f192d]'
                  }`}
                >
                  <div className="space-y-2 w-full">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <CountryFlag countryId={c.id} size="lg" />
                        <div>
                          <div className="font-black text-white text-sm sm:text-base">{c.nameFa}</div>
                          <div className="text-[11px] text-slate-400">
                            {c.capitalFa} • اطلاعات: {c.agencyCode}
                          </div>
                        </div>
                      </div>
                      {c.isUNVetoMember && (
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 shrink-0">
                          حق وتو
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                      {c.doctrineSummaryFa}
                    </p>

                    {/* Quick Real Stat Pills */}
                    <div className="grid grid-cols-3 gap-1.5 pt-1 text-[11px]">
                      <div className="bg-[#060b14] rounded-lg px-2 py-1.5 border border-slate-800/80">
                        <div className="text-slate-400 text-[10px]">خزانه</div>
                        <div className="font-bold text-emerald-300 font-mono">${c.treasuryB}B</div>
                      </div>
                      <div className="bg-[#060b14] rounded-lg px-2 py-1.5 border border-slate-800/80">
                        <div className="text-slate-400 text-[10px]">تولید نفت</div>
                        <div className="font-bold text-amber-300 font-mono">{c.oilProduction}</div>
                      </div>
                      <div className="bg-[#060b14] rounded-lg px-2 py-1.5 border border-slate-800/80">
                        <div className="text-slate-400 text-[10px]">قدرت رزم</div>
                        <div className="font-bold text-rose-300 font-mono">{mil.attackScore + mil.defenseScore}</div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800/80 w-full flex items-center justify-between text-xs">
                    {isMine ? (
                      <span className="text-emerald-300 font-black">✓ کشور انتخابی شما</span>
                    ) : isTakenByOther ? (
                      <span className="text-amber-300 font-bold">در اختیار {c.playerName}</span>
                    ) : (
                      <span className="text-cyan-300 font-semibold">انتخاب رهبری {c.nameFa} ←</span>
                    )}
                    {c.warheads > 0 && <span title="دارای بازدارندگی هسته‌ای">☢️</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
