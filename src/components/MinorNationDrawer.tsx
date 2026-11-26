import React from 'react';
import { X, Flag, Swords, Eye, Handshake, Shield } from 'lucide-react';
import { evaluateMinorOpDetails } from '../../shared/advisor';
import { CountryId, GameRoomState, MinorNationOpType } from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

interface MinorNationDrawerProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  minorId: string;
  onClose: () => void;
  onQueueMinorOrder: (minorId: string, minorOpType: MinorNationOpType) => void;
  onInstantMinorPact: (minorId: string) => void;
}

export const MinorNationDrawer: React.FC<MinorNationDrawerProps> = ({
  room,
  myCountryId,
  minorId,
  onClose,
  onQueueMinorOrder,
  onInstantMinorPact,
}) => {
  const minor = room.minorNations[minorId];
  const me = myCountryId ? room.countries[myCountryId] : null;
  if (!minor) return null;

  const conqueror = minor.conqueredBy ? room.countries[minor.conqueredBy] : null;
  const occupier =
    !conqueror && minor.occupierId && minor.occupationPct > 0
      ? room.countries[minor.occupierId]
      : null;
  const protector = minor.alignedWith ? room.countries[minor.alignedWith] : null;

  const annexEval = me
    ? evaluateMinorOpDetails(me, minor, 'CONQUER_ANNEX', room.countries, room.minorNations)
    : { winPct: 0, canExecute: false, errorFa: null, expectedProgressPct: 50 };
  const coupEval = me
    ? evaluateMinorOpDetails(me, minor, 'COVERT_COUP', room.countries, room.minorNations)
    : { winPct: 0, canExecute: false, errorFa: null, expectedProgressPct: 0 };

  const pactCostB = Math.max(18, Math.round(minor.gdpB * 0.095));
  const monthlyGdpGainB = Math.round(minor.gdpB * 0.048);

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-xl glass-panel rounded-t-3xl sm:rounded-3xl overflow-hidden animate-panel-in">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#060c18] border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 border border-indigo-500/35 flex items-center justify-center text-indigo-300 font-mono font-black text-sm">
              {minor.code}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">{minor.nameFa}</h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 text-[11px] font-bold">
                  {minor.regionFa}
                </span>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                {conqueror ? (
                  <span className="text-rose-300 font-bold flex items-center gap-1">
                    🏴 ضمیمه‌شده کامل به: <CountryFlag countryId={conqueror.id} size="sm" /> {conqueror.nameFa}
                  </span>
                ) : occupier ? (
                  <span className="text-amber-300 font-bold flex items-center gap-1">
                    ⚔️ در جریان نبرد ({minor.occupationPct}٪ در اشغال <CountryFlag countryId={occupier.id} size="sm" /> {occupier.nameFa})
                  </span>
                ) : protector ? (
                  <span className="text-cyan-300 font-bold flex items-center gap-1">
                    🤝 هم‌پیمان راهبردی: <CountryFlag countryId={protector.id} size="sm" /> {protector.nameFa}
                  </span>
                ) : (
                  <span className="text-emerald-300 font-semibold">کشور مستقل</span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {/* Occupation Progress Bar */}
          {(minor.occupationPct > 0 || minor.conqueredBy) && (
            <div className="p-3 rounded-2xl bg-[#060c18] border border-slate-800 space-y-1.5 text-xs">
              <div className="flex justify-between font-bold">
                <span className="text-slate-300">پیشرفت تصرف نظامی خاک:</span>
                <span className="font-mono text-amber-300">{minor.conqueredBy ? 100 : minor.occupationPct}٪ / ۱۰۰٪</span>
              </div>
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-l from-rose-500 to-amber-400 transition-all"
                  style={{ width: `${minor.conqueredBy ? 100 : minor.occupationPct}%` }}
                />
              </div>
            </div>
          )}

          {/* Real Economic & Strategic Value */}
          <div className="grid grid-cols-4 gap-2 text-center text-xs">
            <div className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800">
              <div className="text-slate-400 text-[10px]">اقتصاد (GDP)</div>
              <div className="font-mono font-black text-emerald-300 mt-0.5">${minor.gdpB}B</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800">
              <div className="text-slate-400 text-[10px]">نفت ماهانه</div>
              <div className="font-mono font-black text-amber-300 mt-0.5">+{minor.oilBonus}</div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800">
              <div className="text-slate-400 text-[10px]">غذا و آب</div>
              <div className="font-mono font-black text-cyan-300 mt-0.5">
                +{minor.foodBonus + (minor.waterBonus || 4)}
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800">
              <div className="text-slate-400 text-[10px]">ارتش مدافع</div>
              <div className="font-mono font-black text-rose-300 mt-0.5 flex items-center justify-center gap-1">
                <Shield className="w-3.5 h-3.5" /> {minor.garrisonPower}
              </div>
            </div>
          </div>

          {me && !me.isEliminated && (
            <div className="space-y-2.5">
              {/* 1. Progressive Military Conquest */}
              <div className="p-3.5 rounded-2xl bg-rose-950/25 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-white flex items-center gap-1.5">
                      <Swords className="w-4 h-4 text-rose-400" />
                      ۱. لشکرکشی مرحله‌ای به «{minor.nameFa}»
                    </span>
                    {annexEval.canExecute && (
                      <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-200 font-mono text-[11px] font-bold">
                        شانس: {annexEval.winPct}٪ (+{annexEval.expectedProgressPct}٪ پیشروی)
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    هر عملیات موفق حدود {annexEval.expectedProgressPct}٪ خاک را اشغال می‌کند (در ۱۰۰٪ الحاق کامل: +${monthlyGdpGainB}B درآمد ماهانه و منابع نفت/آب/غذا). نیازمند ۱۲ سوخت نفت.
                  </p>
                  {annexEval.errorFa && (
                    <div className="text-[11px] text-amber-300 font-bold">⚠️ {annexEval.errorFa}</div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={minor.conqueredBy === me.id || !annexEval.canExecute}
                  onClick={() => {
                    sound.playOrderConfirm();
                    onQueueMinorOrder(minor.id, 'CONQUER_ANNEX');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-black text-xs shrink-0 disabled:opacity-40"
                >
                  {minor.conqueredBy === me.id ? 'در قلمرو شماست ✓' : 'ثبت پیشروی ($28B)'}
                </button>
              </div>

              {/* 2. Covert Coup d'État */}
              <div className="p-3.5 rounded-2xl glass-card border-purple-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-black text-sm text-white flex items-center gap-1.5">
                      <Eye className="w-4 h-4 text-purple-400" />
                      ۲. کودتای اطلاعاتی و روی کار آوردن دولت هم‌سو
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                      شانس موفقیت: {coupEval.winPct}٪
                    </span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    خارج کردن کشور از نفوذ رقبا و تبدیل آن به پایگاه مقدم لجستیکی برای عبور ارتش شما.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    sound.playOrderConfirm();
                    onQueueMinorOrder(minor.id, 'COVERT_COUP');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs shrink-0"
                >
                  ثبت کودتا ($18B)
                </button>
              </div>

              {/* 3. Instant Diplomatic Base & Economic Pact */}
              <div className="p-3.5 rounded-2xl glass-card border-emerald-500/35 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="font-black text-sm text-white flex items-center gap-1.5">
                    <Handshake className="w-4 h-4 text-emerald-400" />
                    ۳. پیمان سرمایه‌گذاری و پایگاه برون‌مرزی (فوری)
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed">
                    احداث پایگاه لجستیکی برای دسترسی زمینی به کشورهای همسایه + سهم اقتصادی ماهانه.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(minor.conqueredBy) || minor.alignedWith === me.id}
                  onClick={() => {
                    sound.playLevelUp();
                    onInstantMinorPact(minor.id);
                  }}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0 disabled:opacity-40"
                >
                  {minor.alignedWith === me.id
                    ? 'هم‌پیمان شماست ✓'
                    : minor.conqueredBy
                    ? 'در اشغال نظامی'
                    : `امضای پیمان ($${pactCostB}B)`}
                </button>
              </div>
            </div>
          )}

          {me?.isEliminated && (
            <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/30 text-xs text-rose-200 text-center flex items-center justify-center gap-2">
              <Flag className="w-4 h-4" /> دولت شما سقوط کرده است (حالت نظاره‌گر فعال).
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
