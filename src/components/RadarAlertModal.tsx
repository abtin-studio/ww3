import React from 'react';
import { ShieldAlert, Plane, Rocket, Shield } from 'lucide-react';
import { AlertPosture, CountryState } from '../../shared/types';

interface RadarAlertModalProps {
  me: CountryState;
  secondsLeft: number;
  onSelectPosture: (posture: AlertPosture) => void;
}

export const RadarAlertModal: React.FC<RadarAlertModalProps> = ({
  me,
  secondsLeft,
  onSelectPosture,
}) => {
  if (!me.incomingAlertActive || me.alertPostureConfirmed) return null;

  return (
    <div className="fixed inset-0 z-50 bg-rose-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-[#0d0812] border-2 border-rose-500 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-rose-600/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-400">
            <ShieldAlert className="w-7 h-7 animate-bounce" />
            <h2 className="text-lg sm:text-xl font-black text-white">
              🚨 هشدار رادار پدافند کشور شما!
            </h2>
          </div>
          <span className="px-3 py-1 rounded-xl bg-rose-600 text-white font-mono font-black text-lg">
            {secondsLeft}s
          </span>
        </div>

        <div className="space-y-1.5 bg-rose-500/10 border border-rose-500/30 rounded-2xl p-3.5 text-xs sm:text-sm text-rose-100">
          {me.incomingThreatsSummaryFa.map((msg, i) => (
            <div key={i} className="font-bold">
              {msg}
            </div>
          ))}
        </div>

        <p className="text-xs text-slate-300">
          به‌محض کلیک روی یکی از گزینه‌های زیر، فرمان دفاعی درجا اجرا می‌شود و بازی بدون معطلی ادامه می‌یابد:
        </p>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onSelectPosture('MAX_INTERCEPT')}
            className="w-full p-3 rounded-2xl border bg-[#14101c] border-emerald-500/40 hover:bg-emerald-500/20 text-right flex items-center justify-between transition"
          >
            <div>
              <div className="font-black text-xs sm:text-sm text-white">
                🛡️ شلیک حداکثری پدافند هوایی (+۲۴٪ شانس رهگیری)
              </div>
              <div className="text-[11px] text-slate-400">بهترین گزینه برای نابود کردن موشک‌های دشمن در آسمان</div>
            </div>
            <span className="font-mono text-xs text-amber-300 font-bold shrink-0">$10B</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPosture('SCRAMBLE_FIGHTERS')}
            className="w-full p-3 rounded-2xl border bg-[#14101c] border-cyan-500/40 hover:bg-cyan-500/20 text-right flex items-center justify-between transition"
          >
            <div>
              <div className="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                <Plane className="w-4 h-4 text-cyan-400" /> بلند کردن فوری جنگنده‌های رهگیر (+۱۸٪ دفاع)
              </div>
              <div className="text-[11px] text-slate-400">رهگیری هوایی سریع با هزینه کمتر</div>
            </div>
            <span className="font-mono text-xs text-cyan-300 font-bold shrink-0">$8B</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPosture('COUNTER_SALVO')}
            className="w-full p-3 rounded-2xl border bg-[#14101c] border-rose-500/50 hover:bg-rose-500/25 text-right flex items-center justify-between transition"
          >
            <div>
              <div className="font-black text-xs sm:text-sm text-white flex items-center gap-1.5">
                <Rocket className="w-4 h-4 text-rose-400" /> شلیک موشکی متقابل فوری به پایگاه مهاجم!
              </div>
              <div className="text-[11px] text-slate-400">ضربه تلافی‌جویانه آنی در همین ماه به خاک کشور حمله‌کننده</div>
            </div>
            <span className="font-mono text-xs text-rose-300 font-bold shrink-0">$14B</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPosture('NORMAL')}
            className="w-full p-2.5 rounded-2xl border bg-slate-900 border-slate-700 hover:bg-slate-800 text-center text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5 transition"
          >
            <Shield className="w-4 h-4 text-slate-400" />
            اتکا به پدافند فعلی کشور بدون هزینه اضافی (رایگان)
          </button>
        </div>
      </div>
    </div>
  );
};
