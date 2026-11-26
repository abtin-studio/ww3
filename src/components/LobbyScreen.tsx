import React, { useMemo, useState } from 'react';
import {
  Copy,
  Check,
  Crown,
  Mic,
  Bot,
  Shield,
  Play,
  Users,
  LogOut,
  Gauge,
  Search,
  CheckCircle2,
  FolderOpen,
} from 'lucide-react';
import { computeCountryMilitary } from '../../shared/advisor';
import { CountryId, DifficultyLevel, GameRoomState, GameSettings } from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

interface LobbyScreenProps {
  room: GameRoomState;
  playerId: string;
  onSelectRole: (countryId: CountryId | null, asGM?: boolean) => void;
  onToggleLobbyReady: () => void;
  onUpdateSettings: (partial: Partial<GameSettings>) => void;
  onStartGame: () => void;
  onLeaveLobby: () => void;
  errorFa: string | null;
}

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  room,
  playerId,
  onSelectRole,
  onToggleLobbyReady,
  onUpdateSettings,
  onStartGame,
  onLeaveLobby,
  errorFa,
}) => {
  const [copied, setCopied] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const me = room.players.find((p) => p.id === playerId);
  const isHost = Boolean(me?.isHost);
  const isSingle = room.settings.gameMode === 'SINGLE';

  const inviteUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`
      : room.roomCode;

  const copyInvite = () => {
    sound.playClick();
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    });
  };

  const filteredCountries = useMemo(() => {
    return Object.values(room.countries).filter((c) => {
      if (regionFilter !== 'ALL' && !c.regionFa.includes(regionFilter)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          c.nameFa.includes(q) ||
          c.nameEn.toLowerCase().includes(q) ||
          c.capitalFa.includes(q) ||
          (c.archetypeTagFa || '').includes(q)
        );
      }
      return true;
    });
  }, [room.countries, regionFilter, searchQuery]);

  const anyPlayerPickedCountry = room.players.some((p) => p.countryId !== null);

  return (
    <div className="min-h-screen tactical-grid-bg px-3 sm:px-6 py-5">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Resumed Save Banner */}
        {room.isResumedSave && (
          <div className="p-3.5 rounded-2xl bg-amber-500/15 border border-amber-400/50 text-amber-200 text-xs sm:text-sm font-bold flex items-center gap-2.5 shadow-lg">
            <FolderOpen className="w-5 h-5 text-amber-400 shrink-0" />
            <span>
              بازی ذخیره‌شده از <strong>ماه {room.round} ({room.calendarLabelFa})</strong> با تمام مرزها، ارتش‌ها و ذخایر بارگذاری شد! هر بازیکن کشور خود را انتخاب کند تا ادامه نبرد آغاز شود.
            </span>
          </div>
        )}

        {/* Top Lobby Bar */}
        <div className="glass-panel rounded-2xl p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              {!isSingle && (
                <span className="px-3 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/40 font-mono font-bold text-emerald-300 text-sm tracking-widest">
                  کد لابی: {room.roomCode}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-lg bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold">
                {isSingle ? '👤 کمپین تک‌نفره' : '👥 مولتی‌پلیر آنلاین'} • سختی:{' '}
                {room.settings.difficulty === 'EXTREME'
                  ? 'فوق‌سنگین'
                  : room.settings.difficulty === 'HARD'
                  ? 'چالشی'
                  : 'متعادل'}{' '}
                • {room.settings.maxRounds} دور
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-white">{room.roomName}</h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-400">
              {isSingle
                ? 'کشور خود را انتخاب کنید و وارد اتاق فرماندهی شوید؛ ۱۹ قدرت دیگر و ۱۵۵ کشور مستقل جهان به صورت زنده رقابت می‌کنند!'
                : 'لینک یا کد ۵ حرفی را برای دوستان ارسال کنید؛ پس از انتخاب کشورها، میزبان دکمه شروع بازی را می‌زند.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!isSingle && (
              <button
                type="button"
                onClick={copyInvite}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs sm:text-sm font-bold text-white flex items-center gap-2 transition"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-cyan-400" />}
                {copied ? 'لینک دعوت کپی شد!' : 'کپی لینک دعوت دوستان'}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                onLeaveLobby();
              }}
              className="px-3.5 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition"
            >
              <LogOut className="w-4 h-4" />
              خروج از لابی
            </button>
          </div>
        </div>

        {errorFa && (
          <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-sm font-medium">
            {errorFa}
          </div>
        )}

        {/* Players + Settings + Start */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 glass-panel rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                فرماندهان حاضر در اتاق ({room.players.length} نفر)
              </h2>
              {isHost && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-slate-400 flex items-center gap-1">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" /> سختی:
                  </span>
                  {(['NORMAL', 'HARD', 'EXTREME'] as DifficultyLevel[]).map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        onUpdateSettings({ difficulty: d });
                      }}
                      className={`px-2 py-1 rounded-lg font-bold border ${
                        room.settings.difficulty === d
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-900 text-slate-400 border-slate-700'
                      }`}
                    >
                      {d === 'NORMAL' ? 'متعادل' : d === 'HARD' ? 'چالشی' : 'فوق‌سنگین'}
                    </button>
                  ))}
                  <span className="text-slate-400 mr-1">دورها:</span>
                  <input
                    type="number"
                    min={6}
                    max={200}
                    value={room.settings.maxRounds}
                    onChange={(e) => onUpdateSettings({ maxRounds: Number(e.target.value) })}
                    className="w-16 px-2 py-1 rounded-lg bg-slate-900 border border-slate-700 text-center font-mono text-emerald-300"
                  />
                </div>
              )}
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
                        : 'bg-[#060c18] border-slate-800 text-slate-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${p.connected ? 'bg-emerald-400' : 'bg-slate-500'}`} />
                    {p.isHost && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    <span className="font-bold">{p.name}</span>
                    <span className="text-slate-400">←</span>
                    {p.isGM ? (
                      <span className="text-amber-300 font-bold">🎙️ راوی کل جهان</span>
                    ) : c ? (
                      <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                        <CountryFlag countryId={c.id} size="sm" /> {c.nameFa}
                      </span>
                    ) : (
                      <span className="text-slate-500">در انتظار انتخاب کشور...</span>
                    )}
                    {p.isReadyInLobby && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                        آماده ✓
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Host Start / Guest Ready Panel */}
          <div className="glass-panel rounded-2xl p-4 flex flex-col justify-between gap-3">
            <div className="space-y-2">
              {isHost && !isSingle && (
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
                  onClick={() => {
                    sound.playClick();
                    onSelectRole(null, true);
                  }}
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
                disabled={!anyPlayerPickedCountry}
                onClick={() => {
                  sound.playOrderConfirm();
                  onStartGame();
                }}
                className="w-full py-3.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm sm:text-base flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition disabled:opacity-40"
              >
                <Play className="w-5 h-5 fill-current" />
                {room.isResumedSave
                  ? `ادامه کارزار از ماه ${room.round}!`
                  : isSingle
                  ? 'شروع فوری کارزار تک‌نفره!'
                  : 'شروع بازی و ورود به اتاق فرماندهی!'}
              </button>
            ) : (
              <button
                type="button"
                disabled={!me?.countryId && !me?.isGM}
                onClick={() => {
                  sound.playOrderConfirm();
                  onToggleLobbyReady();
                }}
                className={`w-full py-3 rounded-xl font-black text-xs sm:text-sm flex items-center justify-center gap-2 border transition disabled:opacity-40 ${
                  me?.isReadyInLobby
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                    : 'bg-cyan-500 hover:bg-cyan-400 border-cyan-300 text-slate-950'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {me?.isReadyInLobby ? 'آماده شروع هستم ✓ (در انتظار میزبان)' : 'اعلام آمادگی در لابی'}
              </button>
            )}
          </div>
        </div>

        {/* Filter & Search Bar for 20 Countries */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Shield className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base sm:text-lg font-black text-white">
              انتخاب قدرت راهبردی ({filteredCountries.length} کشور)
            </h2>
            <div className="flex flex-wrap gap-1.5 text-xs mr-2">
              {[
                ['ALL', 'همه مناطق'],
                ['خاورمیانه', 'خاورمیانه'],
                ['اروپا', 'اروپا و اوراسیا'],
                ['آسیا', 'آسیا و اقیانوسیه'],
                ['آمریکا', 'قاره آمریکا'],
              ].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setRegionFilter(key);
                  }}
                  className={`px-2.5 py-1 rounded-xl font-bold border transition ${
                    regionFilter === key
                      ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                      : 'bg-[#0b1324] text-slate-300 border-slate-800 hover:border-slate-600'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="جستجوی نام کشور یا پایتخت..."
              className="w-full pr-9 pl-3 py-2 rounded-xl bg-[#070e1c] border border-slate-700 focus:border-cyan-400 focus:outline-none text-xs text-white"
            />
          </div>
        </div>

        {/* 20 Real Countries Selection Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {filteredCountries.map((c) => {
            const isMine = c.playerId === playerId;
            const isTakenByOther = Boolean(c.playerId && c.playerId !== playerId);
            const mil = computeCountryMilitary(c);

            return (
              <button
                key={c.id}
                type="button"
                disabled={isTakenByOther || c.isEliminated}
                onClick={() => {
                  sound.playOrderConfirm();
                  onSelectRole(c.id, false);
                }}
                className={`text-right rounded-2xl p-4 border transition flex flex-col justify-between gap-3 ${
                  c.isEliminated
                    ? 'bg-rose-950/20 border-rose-800/40 opacity-50 cursor-not-allowed'
                    : isMine
                    ? 'bg-emerald-500/15 border-emerald-400 ring-2 ring-emerald-400/30 shadow-lg shadow-emerald-950'
                    : isTakenByOther
                    ? 'bg-slate-900/50 border-slate-800 opacity-65 cursor-not-allowed'
                    : 'glass-card hover:border-cyan-400/60 hover:bg-[#0f1b32]'
                }`}
              >
                <div className="space-y-2 w-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <CountryFlag countryId={c.id} size="lg" />
                      <div>
                        <div className="font-black text-white text-sm sm:text-base">{c.nameFa}</div>
                        <div className="text-[11px] text-slate-400">
                          {c.capitalFa} • {c.agencyCode}
                        </div>
                      </div>
                    </div>
                    {c.isUNVetoMember && (
                      <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300 shrink-0">
                        حق وتو
                      </span>
                    )}
                  </div>

                  {c.archetypeTagFa && (
                    <div className="inline-block px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-[10px] font-bold text-cyan-300">
                      {c.archetypeTagFa}
                    </div>
                  )}

                  <p className="text-[11px] text-slate-300 leading-relaxed line-clamp-2">
                    {c.doctrineSummaryFa}
                  </p>

                  <div className="grid grid-cols-4 gap-1 pt-1 text-[10px]">
                    <div className="bg-[#050a14] rounded-lg px-1.5 py-1.5 border border-slate-800/80 text-center">
                      <div className="text-slate-400">خزانه</div>
                      <div className="font-bold text-emerald-300 font-mono">${c.treasuryB}B</div>
                    </div>
                    <div className="bg-[#050a14] rounded-lg px-1.5 py-1.5 border border-slate-800/80 text-center">
                      <div className="text-slate-400">نفت</div>
                      <div className="font-bold text-amber-300 font-mono">{c.oilProduction}</div>
                    </div>
                    <div className="bg-[#050a14] rounded-lg px-1.5 py-1.5 border border-slate-800/80 text-center">
                      <div className="text-slate-400">غذا/آب</div>
                      <div className="font-bold text-lime-300 font-mono">{c.foodProduction}</div>
                    </div>
                    <div className="bg-[#050a14] rounded-lg px-1.5 py-1.5 border border-slate-800/80 text-center">
                      <div className="text-slate-400">رزم</div>
                      <div className="font-bold text-rose-300 font-mono">{mil.attackScore + mil.defenseScore}</div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/80 w-full flex items-center justify-between text-xs">
                  {c.isEliminated ? (
                    <span className="text-rose-400 font-bold">سقوط‌کرده</span>
                  ) : isMine ? (
                    <span className="text-emerald-300 font-black">✓ کشور انتخابی شما</span>
                  ) : isTakenByOther ? (
                    <span className="text-amber-300 font-bold">در اختیار {c.playerName}</span>
                  ) : (
                    <span className="text-cyan-300 font-semibold">انتخاب فرماندهی {c.nameFa} ←</span>
                  )}
                  {c.warheads > 0 && <span title="دارای کلاهک هسته‌ای">☢️ {c.warheads}</span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
