import React, { useState } from 'react';
import { Globe2, ShieldAlert, Users, Sparkles, Radio, Play, LogIn } from 'lucide-react';
import { GMMode } from '../../shared/types';

interface LandingScreenProps {
  initialRoomCode: string;
  defaultPlayerName: string;
  errorFa: string | null;
  busy: boolean;
  onCreateLobby: (opts: {
    playerName: string;
    roomName: string;
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
  const [roomName, setRoomName] = useState('اتاق جنگ دوستان');
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [gmMode, setGmMode] = useState<GMMode>('AUTO');
  const [maxRounds, setMaxRounds] = useState<number>(12);
  const [planningTimerSec, setPlanningTimerSec] = useState<number>(0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'CREATE') {
      onCreateLobby({
        playerName: playerName.trim() || 'فرمانده ارشد',
        roomName: roomName.trim() || 'اتاق جنگ جهانی',
        gmMode,
        maxRounds,
        planningTimerSec,
      });
    } else {
      onJoinLobby({
        playerName: playerName.trim() || 'فرمانده',
        roomCode: roomCode.trim().toUpperCase(),
      });
    }
  };

  return (
    <div className="min-h-screen tactical-grid-bg flex flex-col justify-between px-4 py-6 sm:py-10">
      <div className="max-w-5xl w-full mx-auto space-y-8">
        {/* Hero Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-medium">
            <Radio className="w-4 h-4 animate-pulse text-emerald-400" />
            شبیه‌ساز آنلاین ژئوپولیتیک، دیپلماسی و اتاق جنگ جهانی
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
            جنگ جهانی: <span className="text-emerald-400">فرماندهی کل</span>
          </h1>
          <p className="text-slate-300 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            رهبری یک قدرت واقعی جهان را با آمار و تسلیحات ۱۰۰٪ واقعی به دست بگیرید؛ نفت و سلاح معامله کنید، پیمان ببندید، جاسوس و ویروس بفرستید یا آسمان رقبا را به چالش بکشید!
          </p>
        </div>

        {/* 3 Zero-Reading Quick Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-500/15 text-emerald-400 shrink-0">
              <Globe2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">۱. کشور واقعی بردار</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                ایران، آمریکا، روسیه، چین، آلمان و... هر کدام با ذخایر نفت، اقتصاد و ارتش واقعی خودشان.
              </p>
            </div>
          </div>
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">۲. بدون پیچیدگی دستور بده</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                مشاوران کابینه بهترین حرکت‌ها را پیشنهاد می‌دهند؛ فقط روی هر کشور در نقشه کلیک کن و تصمیم بگیر!
              </p>
            </div>
          </div>
          <div className="bg-[#0b1324]/90 border border-slate-800 rounded-2xl p-4 flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-500/15 text-rose-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">۳. راوی هوشمند یا انسانی</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                هم می‌توانید همگی بازی کنید و سایت راوی باشد، هم یک نفر مجری و کارگردان اتاق خبر جهان شود!
              </p>
            </div>
          </div>
        </div>

        {/* Main Lobby Card */}
        <div className="max-w-xl mx-auto bg-[#0b1220]/95 backdrop-blur-xl border border-slate-700/70 rounded-3xl shadow-2xl overflow-hidden">
          <div className="grid grid-cols-2 border-b border-slate-800">
            <button
              type="button"
              onClick={() => setTab('CREATE')}
              className={`py-4 text-sm sm:text-base font-bold flex items-center justify-center gap-2 transition ${
                tab === 'CREATE'
                  ? 'bg-emerald-500/15 text-emerald-300 border-b-2 border-emerald-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Play className="w-4 h-4" />
              ساخت لابی جدید
            </button>
            <button
              type="button"
              onClick={() => setTab('JOIN')}
              className={`py-4 text-sm sm:text-base font-bold flex items-center justify-center gap-2 transition ${
                tab === 'JOIN'
                  ? 'bg-cyan-500/15 text-cyan-300 border-b-2 border-cyan-400'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <LogIn className="w-4 h-4" />
              ورود با کد لابی
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5 sm:p-7 space-y-5">
            {errorFa && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs sm:text-sm font-medium">
                {errorFa}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">نام یا لقب شما در بازی</label>
              <input
                type="text"
                required
                maxLength={24}
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="مثلاً: امیر، سردار، رئیس‌جمهور..."
                className="w-full px-4 py-3 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
              />
            </div>

            {tab === 'CREATE' ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">عنوان لابی</label>
                  <input
                    type="text"
                    maxLength={36}
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    placeholder="اتاق جنگ دوستان"
                    className="w-full px-4 py-3 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-white text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">حالت راوی و مجری بازی</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setGmMode('AUTO')}
                      className={`p-3.5 rounded-xl border text-right transition ${
                        gmMode === 'AUTO'
                          ? 'bg-emerald-500/15 border-emerald-400 text-white'
                          : 'bg-[#060b14] border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        🤖 راوی هوشمند خودکار
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        سایت خودش داوری و خبررسانی می‌کند تا تو هم کشور برداری و بازی کنی!
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setGmMode('HUMAN')}
                      className={`p-3.5 rounded-xl border text-right transition ${
                        gmMode === 'HUMAN'
                          ? 'bg-amber-500/15 border-amber-400 text-white'
                          : 'bg-[#060b14] border-slate-800 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        🎙️ راوی و مجری انسانی
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        پنل مخفی مدیریت جهان، خبر فوری و بحران‌ها در اختیار مجری است.
                      </p>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">طول رقابت</label>
                    <select
                      value={maxRounds}
                      onChange={(e) => setMaxRounds(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 text-white text-xs sm:text-sm focus:border-emerald-400 focus:outline-none"
                    >
                      <option value={8}>۸ راند (سریع ~ ۴۵ دقیقه)</option>
                      <option value={12}>۱۲ راند (استاندارد ۱ ساله)</option>
                      <option value={18}>۱۸ راند (بلندمدت)</option>
                      <option value={24}>۲۴ راند (کمپین کامل ۲ ساله)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1.5">تایمر هر ماه</label>
                    <select
                      value={planningTimerSec}
                      onChange={(e) => setPlanningTimerSec(Number(e.target.value))}
                      className="w-full px-3 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 text-white text-xs sm:text-sm focus:border-emerald-400 focus:outline-none"
                    >
                      <option value={0}>بدون تایمر (وقتی همه آماده شدند)</option>
                      <option value={180}>۳ دقیقه (هیجانی)</option>
                      <option value={300}>۵ دقیقه (متعادل)</option>
                      <option value={480}>۸ دقیقه (مذاکرات سنگین)</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-sm sm:text-base shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  {busy ? 'در حال ساخت اتاق جنگ...' : '🚀 ساخت لابی و دریافت لینک دعوت دوستان'}
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

      <footer className="text-center text-xs text-slate-500 mt-8">
        طراحی‌شده برای دسکتاپ، تبلت و موبایل • آمار واقعی ژئوپولیتیک و تسلیحات جهان • پشتیبانی از بازی ۳ تا ۱۶ نفره + هوش مصنوعی
      </footer>
    </div>
  );
};
