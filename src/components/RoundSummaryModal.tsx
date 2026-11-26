import React from 'react';
import { CheckCircle2, XCircle, ShieldAlert, TrendingUp, Globe2, ArrowLeft, EyeOff } from 'lucide-react';
import { GameRoomState, RoundSummaryForCountry } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface RoundSummaryModalProps {
  room: GameRoomState;
  summary: RoundSummaryForCountry;
  onDismiss: () => void;
}

export const RoundSummaryModal: React.FC<RoundSummaryModalProps> = ({
  room,
  summary,
  onDismiss,
}) => {
  const totalCashEarned = summary.netIncomeB + summary.autoSoldOilB;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-2xl max-h-[90vh] bg-[#091224] border border-slate-700 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-l from-emerald-950/70 via-[#0a162c] to-[#081020] border-b border-slate-800 flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-emerald-400">
              گزارش رسمی پایان ماه {summary.roundResolved}
            </span>
            <h2 className="text-lg sm:text-xl font-black text-white mt-0.5">
              📊 خلاصه عملکرد و تحولات {summary.monthLabelFa}
            </h2>
          </div>
          <span className="px-3 py-1 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 font-mono text-xs font-bold">
            نفت جهانی: ${room.market.oilPriceUsd}
          </span>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* 1. National Economy & Stability Delta */}
          <div className="grid grid-cols-3 gap-2.5 text-center">
            <div className="p-3 rounded-2xl bg-[#0d1930] border border-slate-800">
              <div className="text-[11px] text-slate-400">درآمد خالص + فروش نفت</div>
              <div
                className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
                  totalCashEarned >= 0 ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {totalCashEarned >= 0 ? `+$${totalCashEarned}B` : `-$${Math.abs(totalCashEarned)}B`}
              </div>
              {summary.autoSoldOilB > 0 && (
                <div className="text-[10px] text-amber-300 mt-0.5">
                  (+${summary.autoSoldOilB}B فروش خودکار مازاد)
                </div>
              )}
            </div>

            <div className="p-3 rounded-2xl bg-[#0d1930] border border-slate-800">
              <div className="text-[11px] text-slate-400">تغییر رضایت مردم</div>
              <div
                className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
                  summary.approvalDelta >= 0 ? 'text-cyan-300' : 'text-rose-400'
                }`}
              >
                {summary.approvalDelta >= 0 ? `+${summary.approvalDelta}٪` : `${summary.approvalDelta}٪`}
              </div>
            </div>

            <div className="p-3 rounded-2xl bg-[#0d1930] border border-slate-800">
              <div className="text-[11px] text-slate-400">تغییر ویرانی کشور</div>
              <div
                className={`text-base sm:text-lg font-black font-mono mt-0.5 ${
                  summary.devastationDelta <= 0 ? 'text-emerald-300' : 'text-rose-400'
                }`}
              >
                {summary.devastationDelta > 0 ? `+${summary.devastationDelta}٪` : `${summary.devastationDelta}٪`}
              </div>
            </div>
          </div>

          {/* 2. Incoming Attacks on My Country (Strict Covert Anonymity When Untraced!) */}
          {summary.incomingAttacks.length > 0 && (
            <div className="bg-rose-950/25 border border-rose-500/40 rounded-2xl p-3.5 space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-rose-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4" />
                حملات و عملیات‌های انجام‌شده علیه کشور شما:
              </h3>
              {summary.incomingAttacks.map((atk, idx) => {
                const knownEnemy = atk.attackerId ? room.countries[atk.attackerId] : null;
                return (
                  <div
                    key={idx}
                    className="p-2.5 rounded-xl bg-[#090f1d] border border-slate-800 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                        {knownEnemy ? (
                          <CountryFlag countryId={knownEnemy.id} size="sm" />
                        ) : (
                          <span className="px-1.5 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-200 text-[10px] flex items-center gap-1">
                            <EyeOff className="w-3 h-3" /> منشا ناشناس
                          </span>
                        )}
                        <span>{atk.titleFa}</span>
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                          atk.repelled
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-rose-500/25 text-rose-300'
                        }`}
                      >
                        {atk.repelled ? '🛡️ دفع شد!' : '💥 اصابت کرد'}
                      </span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{atk.detailFa}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* 3. Results of My Queued Operations */}
          {summary.myOperations.length > 0 && (
            <div className="bg-[#0d182d] border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-cyan-300 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4" />
                نتیجه عملیات‌های ارتش و سرویس اطلاعاتی شما:
              </h3>
              {summary.myOperations.map((op, idx) => (
                <div
                  key={idx}
                  className="p-2.5 rounded-xl bg-[#070e1b] border border-slate-800 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      {op.targetId && <CountryFlag countryId={op.targetId} size="sm" />}
                      {op.titleFa}
                    </span>
                    {op.succeeded ? (
                      <span className="text-emerald-400 font-bold flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3.5 h-3.5" /> موفق
                      </span>
                    ) : (
                      <span className="text-rose-400 font-bold flex items-center gap-1 shrink-0">
                        <XCircle className="w-3.5 h-3.5" /> ناموفق / رهگیری
                      </span>
                    )}
                  </div>
                  <p className="text-slate-300 leading-relaxed">{op.detailFa}</p>
                </div>
              ))}
            </div>
          )}

          {/* 4. Global World Highlights */}
          {summary.worldHighlightsFa.length > 0 && (
            <div className="bg-[#0d182d] border border-slate-800 rounded-2xl p-3.5 space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-amber-300 flex items-center gap-1.5">
                <Globe2 className="w-4 h-4" />
                مهم‌ترین تیترهای خبری جهان در این ماه:
              </h3>
              <ul className="space-y-1.5 text-xs text-slate-200">
                {summary.worldHighlightsFa.map((hl, i) => (
                  <li key={i} className="p-2 rounded-lg bg-[#070e1b] border border-slate-800/80 leading-relaxed">
                    {hl}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Dismiss Footer */}
        <div className="p-4 bg-[#070e1b] border-t border-slate-800">
          <button
            type="button"
            onClick={onDismiss}
            className="w-full py-3 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg transition"
          >
            ادامه کارزار در ماه جدید ({room.calendarLabelFa})
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
