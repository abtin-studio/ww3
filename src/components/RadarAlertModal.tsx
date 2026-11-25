import React from 'react';
import { ShieldAlert, Plane, Rocket } from 'lucide-react';
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
  if (!me.incomingAlertActive) return null;

  return (
    <div className="fixed inset-0 z-50 bg-rose-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-[#0c0810] border-2 border-rose-500 rounded-3xl p-5 sm:p-6 shadow-2xl shadow-rose-600/40 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 text-rose-400">
            <ShieldAlert className="w-7 h-7 animate-bounce" />
            <h2 className="text-lg sm:text-xl font-black text-white">
              🚨 آژیر رادار هشدار سریع کشور!
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
          فرمانده! کمتر از ۳۰ ثانیه تا اصابت باقی مانده است؛ واکنش اضطراری ستاد پدافند را انتخاب کنید:
        </p>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={() => onSelectPosture('MAX_INTERCEPT')}
            className={`w-full p-3.5 rounded-2xl border text-right flex items-center justify-between transition ${
              me.alertPosture === 'MAX_INTERCEPT'
                ? 'bg-emerald-500/25 border-emerald-400 text-white'
                : 'bg-[#14101c] border-slate-700 hover:border-emerald-400 text-slate-200'
            }`}
          >
            <div>
              <div className="font-black text-sm">🛡️ شلیک حداکثری تمام آتشبارهای پدافندی (+۲۲٪ رهگیری)</div>
              <div className="text-[11px] text-slate-400">تخلیه موشک‌های رهگیر ذخیره برای شکار پرتابه‌ها در آسمان</div>
            </div>
            <span className="font-mono text-xs text-amber-300 font-bold shrink-0">$10B</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPosture('SCRAMBLE_FIGHTERS')}
            className={`w-full p-3.5 rounded-2xl border text-right flex items-center justify-between transition ${
              me.alertPosture === 'SCRAMBLE_FIGHTERS'
                ? 'bg-cyan-500/25 border-cyan-400 text-white'
                : 'bg-[#14101c] border-slate-700 hover:border-cyan-400 text-slate-200'
            }`}
          >
            <div>
              <div className="font-black text-sm flex items-center gap-1.5">
                <Plane className="w-4 h-4 text-cyan-400" /> بلند کردن فوری جنگنده‌های رهگیر (Scramble)
              </div>
              <div className="text-[11px] text-slate-400">+۱۶٪ دفاع هوایی با مصرف ۸ واحد ذخیره سوخت جت</div>
            </div>
            <span className="font-mono text-xs text-cyan-300 font-bold shrink-0">8 نفت</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectPosture('COUNTER_SALVO')}
            className={`w-full p-3.5 rounded-2xl border text-right flex items-center justify-between transition ${
              me.alertPosture === 'COUNTER_SALVO'
                ? 'bg-rose-500/30 border-rose-400 text-white'
                : 'bg-[#14101c] border-slate-700 hover:border-rose-400 text-slate-200'
            }`}
          >
            <div>
              <div className="font-black text-sm flex items-center gap-1.5">
                <Rocket className="w-4 h-4 text-rose-400" /> فرمان شلیک متقابل فوری به پایگاه مهاجم!
              </div>
              <div className="text-[11px] text-slate-400">شلیک همزمان موشک‌های بالستیک تلافی‌جویانه پیش از اصابت</div>
            </div>
            <span className="font-mono text-xs text-rose-300 font-bold shrink-0">$14B</span>
          </button>
        </div>
      </div>
    </div>
  );
};
