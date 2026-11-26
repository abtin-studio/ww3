import React, { useState } from 'react';
import { Globe2, ShieldAlert, Sparkles, Radio, Play, LogIn, User, Users, Gauge } from 'lucide-react';
import { DifficultyLevel, GameMode, GMMode } from '../../shared/types';

interface LandingScreenProps {
  initialRoomCode: string;
  defaultPlayerName: string;
  errorFa: string | null;
  busy: boolean;
  onCreateLobby: (opts: {
    playerName: string;
    roomName: string;
    gameMode: GameMode;
    difficulty: DifficultyLevel;
    gmMode: GMMode;
    maxRounds: number;
    planningTimerSec: number;
  }) => void;
  onJoinLobby: (opts: { playerName: string; roomCode: string }) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  initialRoomCode,
  defaultPlayerName,
  errorFa,
  busy,
  onCreateLobby,
  onJoinLobby,
}) => {
  const [tab, setTab] = useState<'CREATE' | 'JOIN'>(initialRoomCode ? 'JOIN' : 'CREATE');
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [roomName, setRoomName] = useState('اتاق فرماندهی جهان');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [gameMode, setGameMode] = useState<GameMode>('MULTI');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('HARD');
  const [gmMode, setGmMode] = useState<GMMode>('AUTO');
  const [maxRounds, setMaxRounds] = useState<number>(36);
  const [planningTimerSec, setPlanningTimerSec] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'CREATE') {
      onCreateLobby({
        playerName: playerName.trim() || 'فرمانده ارشد',
        roomName: roomName.trim() || 'اتاق جنگ جهانی',
        gameMode,
        difficulty,
        gmMode: gameMode === 'SINGLE' ? 'AUTO' : gmMode,
        maxRounds: Math.max(6, Math.min(200, Number(maxRounds) || 24)),
        planningTimerSec: Math.max(0, Math.min(1200, Number(planningTimerSec) || 0)),
      });
    } else {
      onJoinLobby({
        playerName: playerName.trim() || 'فرمانده',
        roomCode: roomCode.trim().toUpperCase(),
      });
    }
  };

  return (
    <div className="min-h-screen tactical-grid-bg flex flex-col justify-between px-4 py-6 sm:py-8">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* Hero Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            نسخه ۳.۰ • شبیه‌ساز واقع‌گرایانه ژئوپولیتیک، کشورگشایی و جنگ جهانی (۱۹۵ کشور فعال)
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            جنگ جهانی: <span className="text-emerald-400">فرماندهی کل</span>
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            رهبری یک قدرت واقعی جهان را در دست بگیرید؛ کشورگشایی کنید، ائتلاف و کمیته تشکیل دهید، عملیات هوایی، دریایی، زمینی، سایبری و ترور انجام دهید و از سقوط دولت خود جلوگیری کنید!
          </p>
        </div>

        {/* 3 Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">۱۹۵ کشور زنده و قابل تصرف</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                ۲۰ ابرقدرت اصلی + بیش از ۱۵۵ کشور جهان با امکان کشورگشایی، کودتا، ائتلاف و بستن تنگه‌ها!
              </p>
            </div>
          </div>
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">تک‌نفره و مولتی‌پلیر تا ۱۰۰+ دور</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                هم کمپین تک‌نفره مقابل هوش مصنوعی هوشمند دارد، هم رقابت آنلاین ۲ تا ۸+ نفره با دوستان.
              </p>
            </div>
          </div>
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">بازسازی پویا و سقوط واقعی دولت</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                ویرانه‌های جنگ قابل بازسازی‌اند، اما بحران مهارنشدنی یا فتح پایتخت باعث سقوط کامل دولت می‌شود!
              </p>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="max-w-2xl mx-auto bg-[#0b1220]/95 backdrop-blur-xl border border-slate-700/70 rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-2 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setTab('CREATE')}
              className={`py-3.5 text-sm sm:text-base font-black flex items-center justify-center gap-2 transition ${
                tab === 'CREATE'
                  ? 'bg-emerald-500/15 text-emerald-300 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-4 h-4" />
              ساخت بازی جدید (تک‌نفره / چندنفره)
            </button>
            <button
              type="button"
              onClick={() => setTab('JOIN')}
              className={`py-3.5 text-sm sm:text-base font-black flex items-center justify-center gap-2 transition ${
                tab === 'JOIN'
                  ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              ورود با کد لابی دوستان
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {errorFa && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm font-medium">
                {errorFa}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">نام یا لقب فرمانده</label>
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="مثلاً: امیر، سردار، رئیس‌جمهور..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
                />
              </div>

              {tab === 'CREATE' && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">عنوان اتاق جنگ</label>
                  <input
                    type="text"
                    maxLength={36}
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="اتاق فرماندهی جهان"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
                  />
                </div>
              )}
            </div>

            {tab === 'CREATE' ? (
              <>
                {/* 1. Single-Player vs Multiplayer */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حالت بازی</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setGameMode('SINGLE')}
                      className={`p-3 rounded-xl border text-right transition ${
                        gameMode === 'SINGLE'
                          ? 'bg-cyan-500/15 border-cyan-400 text-white'
                          : 'bg-[#060b14] border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-black text-xs sm:text-sm flex items-center gap-1.5">
                        <User className="w-4 h-4 text-cyan-400" /> تک‌نفره (انفرادی)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        رقابت استراتژیک با ۱۹ قدرت هوشمند AI و مذاکره زنده دیپلماتیک
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGameMode('MULTI')}
                      className={`p-3 rounded-xl border text-right transition ${
                        gameMode === 'MULTI'
                          ? 'bg-emerald-500/15 border-emerald-400 text-white'
                          : 'bg-[#060b14] border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-black text-xs sm:text-sm flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" /> چندنفره آنلاین (۲ تا ۸+ نفر)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ساخت لابی اختصاصی با لینک دعوت دوستان + کشورهای زنده AI
                      </p>
                    </button>
                  </div>
                </div>

                {/* 2. Difficulty Level */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" /> درجه سختی و هوش مصنوعی ربات‌ها
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        ['NORMAL', '🟢 متعادل', 'مناسب آشنایی و بازی دوستانه'],
                        ['HARD', '🟠 چالشی و واقعی', 'ربات‌های هوشمند، بستن تنگه و پیشرفت سخت‌تر'],
                        ['EXTREME', '🔴 فوق‌سنگین', 'رقابت بی‌رحمانه ابرقدرت‌ها و کشورگشایی فعال AI'],
                      ] as [DifficultyLevel, string, string][]
                    ).map(([lvl, title, desc]) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => setDifficulty(lvl)}
                        className={`p-2.5 rounded-xl border text-right transition ${
                          difficulty === lvl
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-[#060b14] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-black">{title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Custom Rounds (Up to 200!) & Custom Timer */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#060b14] border border-slate-800 rounded-2xl p-3.5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">تعداد کل دورها (ماه)</label>
                      <input
                        type="number"
                        min={6}
                        max={200}
                        value={maxRounds}
                        onChange={(e) => setMaxRounds(Number(e.target.value))}
                        className="w-20 px-2.5 py-1 rounded-lg bg-[#0b1324] border border-slate-700 text-center font-mono font-bold text-emerald-300 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {[12, 24, 36, 60, 100].map((r) => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setMaxRounds(r)}
                          className={`px-2.5 py-1 rounded-lg font-mono font-bold border ${
                            maxRounds === r
                              ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {r} دور
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300">تایمر هر دور (ثانیه)</label>
                      <input
                        type="number"
                        min={0}
                        max={1200}
                        step={30}
                        value={planningTimerSec}
                        onChange={(e) => setPlanningTimerSec(Number(e.target.value))}
                        className="w-20 px-2.5 py-1 rounded-lg bg-[#0b1324] border border-slate-700 text-center font-mono font-bold text-cyan-300 text-xs"
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                      {[
                        [0, 'آزاد'],
                        [120, '۲ دقیقه'],
                        [240, '۴ دقیقه'],
                        [420, '۷ دقیقه'],
                      ].map(([sec, lbl]) => (
                        <button
                          key={sec}
                          type="button"
                          onClick={() => setPlanningTimerSec(Number(sec))}
                          className={`px-2 py-1 rounded-lg font-bold border ${
                            planningTimerSec === sec
                              ? 'bg-cyan-400 text-slate-950 border-cyan-300'
                              : 'bg-slate-900 text-slate-300 border-slate-700'
                          }`}
                        >
                          {lbl}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 4. GM Mode (Multiplayer Only) */}
                {gameMode === 'MULTI' && (
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#060b14] border border-slate-800 text-xs">
                    <span className="font-bold text-slate-300">سیستم راوی و داوری بازی:</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setGmMode('AUTO')}
                        className={`px-3 py-1.5 rounded-lg font-bold ${
                          gmMode === 'AUTO' ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        🤖 راوی خودکار
                      </button>
                      <button
                        type="button"
                        onClick={() => setGmMode('HUMAN')}
                        className={`px-3 py-1.5 rounded-lg font-bold ${
                          gmMode === 'HUMAN' ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        🎙️ راوی انسانی
                      </button>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {busy
                    ? 'در حال آماده‌سازی نقشه جهان...'
                    : gameMode === 'SINGLE'
                    ? '🚀 ورود به انتخاب کشور و شروع کمپین تک‌نفره'
                    : '🚀 ساخت لابی چندنفره و دریافت کد دعوت دوستان'}
                </button>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">کد ۵ حرفی لابی</label>
                  <input
                    type="text"
                    required
                    maxLength={8}
                    value={roomCode}
                    onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                    placeholder="مثلاً: K9W4P"
                    dir="ltr"
                    className="w-full px-4 py-3.5 rounded-xl bg-[#060b14] border border-slate-700 focus:border-cyan-400 focus:outline-none text-center font-mono tracking-[0.35em] text-xl text-cyan-300 uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || !roomCode.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-l from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-cyan-500/20 transition disabled:opacity-50"
                >
                  {busy ? 'در حال اتصال به اتاق جنگ...' : '⚡ ورود به لابی و انتخاب کشور'}
                </button>
              </>
            )}
          </form>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-500 mt-6">
        نسخه ۳.۰ فرماندهی کل • ۱۹۵ کشور واقعی جهان • پشتیبانی از کمپین‌های ۱۰۰+ دور تک‌نفره و چندنفره
      </footer>
    </div>
  );
};
