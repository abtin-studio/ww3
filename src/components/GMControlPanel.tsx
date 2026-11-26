import React, { useState } from 'react';
import { Mic, FastForward, Zap, Send, Eye } from 'lucide-react';
import { CountryId, GameRoomState } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface GMControlPanelProps {
  room: GameRoomState;
  onBroadcastNews: (payload: {
    agencyFa: string;
    headlineFa: string;
    bodyFa: string;
    breaking: boolean;
  }) => void;
  onTriggerEvent: (payload: {
    targetCountry?: CountryId;
    preset:
      | 'OIL_BOOM'
      | 'EARTHQUAKE'
      | 'MASS_PROTEST'
      | 'MILITARY_AID'
      | 'GLOBAL_OIL_SHOCK'
      | 'CALM_MARKETS';
  }) => void;
  onAdjustCountry: (payload: {
    countryId: CountryId;
    treasuryDelta?: number;
    approvalDelta?: number;
    oilDelta?: number;
    warheadsDelta?: number;
  }) => void;
  onForceAdvance: () => void;
}

export const GMControlPanel: React.FC<GMControlPanelProps> = ({
  room,
  onBroadcastNews,
  onTriggerEvent,
  onAdjustCountry,
  onForceAdvance,
}) => {
  const [agencyFa, setAgencyFa] = useState('خبرگزاری فوری جهان');
  const [headlineFa, setHeadlineFa] = useState('');
  const [bodyFa, setBodyFa] = useState('');
  const [breaking, setBreaking] = useState(true);
  const [targetCountry, setTargetCountry] = useState<CountryId>('IR');

  const submitNews = (e: React.FormEvent) => {
    e.preventDefault();
    if (!headlineFa.trim()) return;
    onBroadcastNews({ agencyFa, headlineFa, bodyFa, breaking });
    setHeadlineFa('');
    setBodyFa('');
  };

  return (
    <div className="space-y-4">
      <div className="bg-amber-500/15 border border-amber-400/50 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-base text-amber-300 flex items-center gap-2">
            <Mic className="w-5 h-5" />
            اتاق کارگردانی راوی کل جهان (دید کامل بدون مه جنگ)
          </h2>
          <p className="text-xs text-slate-300 mt-0.5">
            تمامی دستورات محرمانه بازیکنان را در پایین می‌بینید و می‌توانید رویدادهای ویژه یا ماه بعدی را اجرا کنید.
          </p>
        </div>
        <button
          type="button"
          onClick={onForceAdvance}
          className="px-5 py-3 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0 shadow-lg"
        >
          <FastForward className="w-4 h-4" />
          {room.phase === 'GM_REVIEW' ? 'تایید و پخش نتایج این ماه!' : 'اجرای فوری فاز بعدی'}
        </button>
      </div>

      <form
        onSubmit={submitNews}
        className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-3"
      >
        <div className="font-bold text-sm text-white">📺 مخابره تیتر خبری اختصاصی</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <input
            type="text"
            value={agencyFa}
            onChange={(e) => setAgencyFa(e.target.value)}
            placeholder="نام شبکه خبری..."
            className="px-3 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 text-amber-300"
          />
          <input
            type="text"
            value={headlineFa}
            onChange={(e) => setHeadlineFa(e.target.value)}
            placeholder="تیتر خبر فوری..."
            className="sm:col-span-2 px-3 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 text-white"
          />
        </div>
        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={bodyFa}
            onChange={(e) => setBodyFa(e.target.value)}
            placeholder="متن تکمیلی گزارش..."
            className="flex-1 px-3 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 text-xs text-slate-200"
          />
          <label className="flex items-center gap-1.5 text-xs text-rose-300 font-bold px-2">
            <input
              type="checkbox"
              checked={breaking}
              onChange={(e) => setBreaking(e.target.checked)}
            />
            زنگ فوری
          </label>
          <button
            type="submit"
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-black text-xs flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" />
            انتشار
          </button>
        </div>
      </form>

      <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="font-bold text-sm text-white flex items-center gap-1.5">
            <Zap className="w-4 h-4 text-amber-400" /> اعمال رویداد یا تنظیم کشور:
          </span>
          <select
            value={targetCountry}
            onChange={(e) => setTargetCountry(e.target.value as CountryId)}
            className="px-3 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-xs text-white font-bold"
          >
            {Object.values(room.countries).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameFa} {c.playerName ? `(${c.playerName})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <button
            type="button"
            onClick={() => onTriggerEvent({ targetCountry, preset: 'OIL_BOOM' })}
            className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-bold"
          >
            🛢️ کشف میدان نفتی
          </button>
          <button
            type="button"
            onClick={() => onTriggerEvent({ targetCountry, preset: 'EARTHQUAKE' })}
            className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 font-bold"
          >
            🌋 زلزله زیرساختی
          </button>
          <button
            type="button"
            onClick={() => onTriggerEvent({ targetCountry, preset: 'MASS_PROTEST' })}
            className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-200 font-bold"
          >
            📢 اعتراضات خیابانی
          </button>
          <button
            type="button"
            onClick={() => onTriggerEvent({ preset: 'GLOBAL_OIL_SHOCK' })}
            className="p-2.5 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-200 font-bold"
          >
            📈 شوک قیمت نفت
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1 text-xs">
          <button
            type="button"
            onClick={() => onAdjustCountry({ countryId: targetCountry, treasuryDelta: 50 })}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 font-mono"
          >
            +$50B بودجه
          </button>
          <button
            type="button"
            onClick={() => onAdjustCountry({ countryId: targetCountry, approvalDelta: 10 })}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300"
          >
            +۱۰٪ رضایت مردم
          </button>
          <button
            type="button"
            onClick={() => onAdjustCountry({ countryId: targetCountry, approvalDelta: -10 })}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-rose-300"
          >
            -۱۰٪ رضایت مردم
          </button>
          <button
            type="button"
            onClick={() => onAdjustCountry({ countryId: targetCountry, warheadsDelta: 1 })}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300"
          >
            +۱ کلاهک اتمی ☢️
          </button>
        </div>
      </div>

      <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-2.5">
        <h3 className="text-sm font-black text-cyan-300 flex items-center gap-1.5">
          <Eye className="w-4 h-4" />
          رصد لحظه‌ای دستورات مخفی همه کشورها در این ماه
        </h3>
        <div className="space-y-2">
          {Object.values(room.countries)
            .filter((c) => c.orders.length > 0)
            .map((c) => (
              <div key={c.id} className="p-3 rounded-xl bg-[#070d19] border border-slate-800 text-xs">
                <div className="font-bold text-white mb-1 flex items-center gap-1.5">
                  <CountryFlag countryId={c.id} size="sm" />
                  <span>
                    {c.nameFa} {c.playerName ? `(${c.playerName})` : '(AI)'}:
                  </span>
                </div>
                <ul className="list-disc list-inside text-slate-300 space-y-0.5">
                  {c.orders.map((o) => (
                    <li key={o.id}>{o.summaryFa}</li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
