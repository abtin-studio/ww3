import React, { useRef, useState } from 'react';
import {
  Globe2,
  ShieldAlert,
  Sparkles,
  Radio,
  Play,
  LogIn,
  User,
  Users,
  Gauge,
  FolderOpen,
  Upload,
} from 'lucide-react';
import { DifficultyLevel, GameMode, GMMode } from '../../shared/types';
import { sound } from '../utils/sound';

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
  onLoadSavedGame: (opts: {
    playerName: string;
    saveCode?: string;
    rawRoomJson?: string;
  }) => void;
}

export const LandingScreen: React.FC<LandingScreenProps> = ({
  initialRoomCode,
  defaultPlayerName,
  errorFa,
  busy,
  onCreateLobby,
  onJoinLobby,
  onLoadSavedGame,
}) => {
  const [tab, setTab] = useState<'CREATE' | 'JOIN' | 'LOAD'>(initialRoomCode ? 'JOIN' : 'CREATE');
  const [playerName, setPlayerName] = useState(defaultPlayerName);
  const [roomName, setRoomName] = useState('اتاق فرماندهی جهان');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [saveCode, setSaveCode] = useState('');
  const [uploadedJson, setUploadedJson] = useState<string>('');
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [gameMode, setGameMode] = useState<GameMode>('MULTI');
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('HARD');
  const [gmMode, setGmMode] = useState<GMMode>('AUTO');
  const [maxRounds, setMaxRounds] = useState<number>(36);
  const [planningTimerSec, setPlanningTimerSec] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setUploadedJson(reader.result);
      }
    };
    reader.readAsText(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sound.playOrderConfirm();
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
    } else if (tab === 'JOIN') {
      onJoinLobby({
        playerName: playerName.trim() || 'فرمانده',
        roomCode: roomCode.trim().toUpperCase(),
      });
    } else {
      onLoadSavedGame({
        playerName: playerName.trim() || 'فرمانده ارشد',
        saveCode: saveCode.trim() || undefined,
        rawRoomJson: uploadedJson || undefined,
      });
    }
  };

  return (
    <div className="min-h-screen tactical-grid-bg flex flex-col justify-between px-4 py-6 sm:py-8">
      <div className="max-w-5xl w-full mx-auto space-y-6">
        {/* Hero Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold shadow-lg">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            نسخه ۵.۰ فرماندهی کل • پخش زنده سینمایی نبردها، پیمان‌های مخفی، جنگ نیابتی و فرماندهی فضایی
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            جنگ جهانی: <span className="text-emerald-400">فرماندهی کل</span>
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            رهبری یکی از ۲۰ قدرت راهبردی را در دست بگیرید؛ پیمان صلح یا اولتیماتوم صادر کنید، بین رقبا بذر نفرت بکارید، فناوری و ارتش واقعی بسازید و در نبردهای چندماهه امپراتوری خود را گسترش دهید!
          </p>
        </div>

        {/* 3 Highlights */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="glass-card rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">۱۹۵ کشور، اشغال مرحله‌ای و سیاست پویا</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                هیچ کشوری یک‌شبه سقوط نمی‌کند؛ خطوط مقدم روی نقشه هاشور می‌خورند و ربات‌ها در سازمان ملل ائتلاف و پرونده می‌سازند!
              </p>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">توقف موقت و ذخیره کامل بازی</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                هر زمان خواستید بازی را Pause یا ذخیره (Save) کنید تا روز بعد با همان دوستان دقیقاً از همان ماه ادامه دهید!
              </p>
            </div>
          </div>
          <div className="glass-card rounded-2xl p-3.5 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-xs sm:text-sm text-white">اکوسیستم واقعی سوخت، برق، غذا و آب</h3>
              <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                هر سامانه نظامی نقش متمایز و مصرف سوخت واقعی دارد و می‌توانید تسلیحات مازاد را بخرید یا بفروشید.
              </p>
            </div>
          </div>
        </div>

        {/* Main Card */}
        <div className="max-w-2xl mx-auto glass-panel rounded-3xl overflow-hidden animate-panel-in">
          <div className="grid grid-cols-3 border-b border-slate-800 text-xs sm:text-sm font-black">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('CREATE');
              }}
              className={`py-3.5 px-2 flex items-center justify-center gap-1.5 transition ${
                tab === 'CREATE'
                  ? 'bg-emerald-500/15 text-emerald-300 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-4 h-4 shrink-0" />
              <span>ساخت بازی جدید</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('JOIN');
              }}
              className={`py-3.5 px-2 flex items-center justify-center gap-1.5 transition ${
                tab === 'JOIN'
                  ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>ورود با کد لابی</span>
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('LOAD');
              }}
              className={`py-3.5 px-2 flex items-center justify-center gap-1.5 transition ${
                tab === 'LOAD'
                  ? 'bg-amber-500/15 text-amber-300 border-b-2 border-amber-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>ادامه بازی ذخیره‌شده</span>
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
            {errorFa && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm font-medium">
                {errorFa}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className={tab !== 'CREATE' ? 'sm:col-span-2' : ''}>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">نام یا لقب فرمانده</label>
                <input
                  type="text"
                  required
                  maxLength={24}
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="مثلاً: آبتین، امیر، سردار..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#050a14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
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
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#050a14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
                  />
                </div>
              )}
            </div>

            {tab === 'CREATE' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">حالت بازی</label>
                  <div className="grid grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        setGameMode('SINGLE');
                      }}
                      className={`p-3 rounded-xl border text-right transition ${
                        gameMode === 'SINGLE'
                          ? 'bg-cyan-500/15 border-cyan-400 text-white'
                          : 'bg-[#050a14] border-slate-800 text-slate-400 hover:border-slate-600'
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
                      onClick={() => {
                        sound.playClick();
                        setGameMode('MULTI');
                      }}
                      className={`p-3 rounded-xl border text-right transition ${
                        gameMode === 'MULTI'
                          ? 'bg-emerald-500/15 border-emerald-400 text-white'
                          : 'bg-[#050a14] border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-black text-xs sm:text-sm flex items-center gap-1.5">
                        <Users className="w-4 h-4 text-emerald-400" /> چندنفره آنلاین (۲ تا ۸+ نفر)
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        ساخت لابی اختصاصی با کد دعوت، کنترل توقف (Pause) و ذخیره بازی
                      </p>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                    <Gauge className="w-3.5 h-3.5 text-amber-400" /> درجه سختی و هوش مصنوعی ربات‌ها
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(
                      [
                        ['NORMAL', '🟢 متعادل', 'مناسب آشنایی و بازی دوستانه'],
                        ['HARD', '🟠 چالشی و واقعی', 'ربات‌های هوشمند، ائتلاف‌سازی و موازنه قدرت'],
                        ['EXTREME', '🔴 فوق‌سنگین', 'رقابت بی‌رحمانه ابرقدرت‌ها و کشورگشایی فعال AI'],
                      ] as [DifficultyLevel, string, string][]
                    ).map(([lvl, title, desc]) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          sound.playClick();
                          setDifficulty(lvl);
                        }}
                        className={`p-2.5 rounded-xl border text-right transition ${
                          difficulty === lvl
                            ? 'bg-amber-500/15 border-amber-400 text-white'
                            : 'bg-[#050a14] border-slate-800 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="font-black">{title}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5 leading-snug">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#050a14] border border-slate-800 rounded-2xl p-3.5">
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
                          onClick={() => {
                            sound.playClick();
                            setMaxRounds(r);
                          }}
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
                          onClick={() => {
                            sound.playClick();
                            setPlanningTimerSec(Number(sec));
                          }}
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

                {gameMode === 'MULTI' && (
                  <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl bg-[#050a14] border border-slate-800 text-xs">
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
            ) : tab === 'JOIN' ? (
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
                    className="w-full px-4 py-3.5 rounded-xl bg-[#050a14] border border-slate-700 focus:border-cyan-400 focus:outline-none text-center font-mono tracking-[0.35em] text-xl text-cyan-300 uppercase"
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
            ) : (
              /* LOAD SAVED GAME TAB (ITEM #5) */
              <div className="space-y-4">
                <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                  📂 برای ادامه یک بازی ذخیره‌شده با دوستان، فایل <code className="font-mono">.ww3save.json</code> دانلودشده را بارگذاری کنید (یا کد ذخیره سرور را وارد نمایید). لابی جدید با همان نقشه، ماه و ذخایر باز می‌شود تا دوستانتان کشورشان را بردارند و ادامه دهند!
                </div>

                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFilePick}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-4 px-4 rounded-2xl border-2 border-dashed border-amber-400/50 hover:border-amber-400 bg-[#050a14] text-amber-200 text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition"
                  >
                    <Upload className="w-4 h-4" />
                    {uploadedFileName
                      ? `فایل انتخاب شد: ${uploadedFileName} ✓`
                      : 'انتخاب فایل ذخیره بازی (.ww3save.json) از دستگاه'}
                  </button>
                </div>

                <div className="text-center text-[11px] text-slate-500">— یا ورود با کد ذخیره سرور —</div>

                <div>
                  <input
                    type="text"
                    value={saveCode}
                    onChange={(e) => setSaveCode(e.target.value.toUpperCase())}
                    placeholder="مثلاً: SV-K9W4P-8"
                    dir="ltr"
                    className="w-full px-4 py-2.5 rounded-xl bg-[#050a14] border border-slate-700 focus:border-amber-400 focus:outline-none text-center font-mono text-sm text-amber-300 uppercase"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy || (!uploadedJson && !saveCode.trim())}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-l from-amber-500 to-orange-400 hover:from-amber-400 hover:to-orange-300 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
                >
                  {busy ? 'در حال بازیابی جهان ذخیره‌شده...' : '📂 ساخت لابی از فایل ذخیره و دعوت دوستان'}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <footer className="text-center text-xs text-slate-500 mt-6">
        نسخه ۴.۰ فرماندهی کل • ۱۹۵ کشور واقعی جهان • ذخیره کامل، توقف موقت و دیپلماسی پویا
      </footer>
    </div>
  );
};
