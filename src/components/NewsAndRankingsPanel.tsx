import React, { useState } from 'react';
import { Tv, Trophy, FileWarning } from 'lucide-react';
import { CountryId, GameRoomState } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface NewsAndRankingsPanelProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
}

export const NewsAndRankingsPanel: React.FC<NewsAndRankingsPanelProps> = ({ room, myCountryId }) => {
  const [tab, setTab] = useState<'NEWS' | 'INTEL' | 'RANKINGS'>('NEWS');
  const me = myCountryId ? room.countries[myCountryId] : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 bg-[#08101f] p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm font-bold">
        <button
          type="button"
          onClick={() => setTab('NEWS')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 ${
            tab === 'NEWS' ? 'bg-rose-500 text-white' : 'text-slate-300'
          }`}
        >
          <Tv className="w-4 h-4" />
          شبکه خبر جهان
        </button>
        <button
          type="button"
          onClick={() => setTab('INTEL')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 ${
            tab === 'INTEL' ? 'bg-amber-400 text-slate-950' : 'text-slate-300'
          }`}
        >
          <FileWarning className="w-4 h-4" />
          گزارش محرمانه ({me?.intelReports.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setTab('RANKINGS')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 ${
            tab === 'RANKINGS' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
          }`}
        >
          <Trophy className="w-4 h-4" />
          رتبه‌بندی قدرت‌ها
        </button>
      </div>

      {tab === 'NEWS' && (
        <div className="space-y-2.5">
          {room.news.map((n) => (
            <div
              key={n.id}
              className={`p-4 rounded-2xl border ${
                n.breaking
                  ? 'bg-rose-950/25 border-rose-500/40'
                  : 'bg-[#0b1324] border-slate-800'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  {n.breaking && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                      فوری
                    </span>
                  )}
                  {n.agencyFa}
                </span>
                <span className="text-slate-500">{n.monthLabelFa}</span>
              </div>
              <h4 className="font-black text-sm sm:text-base text-white leading-snug">{n.headlineFa}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.bodyFa}</p>
            </div>
          ))}
        </div>
      )}

      {tab === 'INTEL' && (
        <div className="space-y-2.5">
          {!me || me.intelReports.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 bg-[#0b1324] rounded-2xl border border-slate-800">
              هنوز بولتن محرمانه‌ای از سرویس اطلاعاتی شما دریافت نشده است.
            </div>
          ) : (
            me.intelReports.map((rep) => (
              <div
                key={rep.id}
                className={`p-3.5 rounded-2xl border ${
                  rep.severity === 'CRITICAL'
                    ? 'bg-rose-950/30 border-rose-500/50'
                    : rep.severity === 'SUCCESS'
                    ? 'bg-emerald-950/25 border-emerald-500/40'
                    : rep.severity === 'WARNING'
                    ? 'bg-amber-950/25 border-amber-500/40'
                    : 'bg-[#0b1324] border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                  <span>طبقه‌بندی فوق‌محرمانه • ماه {rep.round}</span>
                </div>
                <div className="font-bold text-sm text-white">{rep.titleFa}</div>
                <p className="text-xs text-slate-300 mt-1">{rep.detailFa}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'RANKINGS' && (
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-800/80">
            {room.rankings.map((r, index) => {
              const c = room.countries[r.countryId];
              return (
                <div
                  key={r.countryId}
                  className={`px-4 py-3 flex items-center justify-between gap-3 text-xs sm:text-sm ${
                    r.countryId === myCountryId ? 'bg-emerald-500/10' : ''
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-center font-mono font-black text-amber-300">
                      #{index + 1}
                    </span>
                    <CountryFlag countryId={c.id} size="md" />
                    <div>
                      <div className="font-bold text-white">
                        {c.nameFa}{' '}
                        {c.playerName && (
                          <span className="text-emerald-300 text-xs">({c.playerName})</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        اقتصاد: {r.economicScore} • ارتش: {r.militaryScore} • ثبات: {r.stabilityScore}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono font-black text-base text-cyan-300">{r.score}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
