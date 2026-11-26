import React, { useMemo, useState } from 'react';
import { Tv, Trophy, FileWarning, Swords } from 'lucide-react';
import { CountryId, GameRoomState, NewsItem, RankingEntry } from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

interface NewsAndRankingsPanelProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
}

type LeaderboardMetric = 'TOTAL' | 'ECONOMY' | 'MILITARY' | 'TECH' | 'INFLUENCE';

export const NewsAndRankingsPanel: React.FC<NewsAndRankingsPanelProps> = ({ room, myCountryId }) => {
  const [tab, setTab] = useState<'NEWS' | 'BATTLES' | 'INTEL' | 'RANKINGS'>('NEWS');
  const [newsFilter, setNewsFilter] = useState<'ALL' | 'WAR' | 'COVERT' | 'ECONOMY' | 'DIPLOMACY'>('ALL');
  const [rankMetric, setRankMetric] = useState<LeaderboardMetric>('TOTAL');
  const me = myCountryId ? room.countries[myCountryId] : null;

  const filteredNews = room.news.filter((n: NewsItem) => {
    if (newsFilter === 'ALL') return true;
    if (newsFilter === 'WAR') return n.category === 'WAR' || n.category === 'GM';
    if (newsFilter === 'COVERT') return n.category === 'CYBER' || n.category === 'ESPIONAGE';
    if (newsFilter === 'ECONOMY') return n.category === 'ECONOMY' || n.category === 'WORLD_EVENT';
    return n.category === 'DIPLOMACY';
  });

  const sortedRankings = useMemo(() => {
    const copy = [...room.rankings];
    copy.sort((a: RankingEntry, b: RankingEntry) => {
      if (rankMetric === 'ECONOMY') return b.economicScore - a.economicScore;
      if (rankMetric === 'MILITARY') return b.militaryScore - a.militaryScore;
      if (rankMetric === 'TECH') return b.techScore - a.techScore;
      if (rankMetric === 'INFLUENCE') return b.influenceScore + b.stabilityScore - (a.influenceScore + a.stabilityScore);
      return b.score - a.score;
    });
    return copy;
  }, [room.rankings, rankMetric]);

  return (
    <div className="space-y-3.5 animate-panel-in">
      {/* Live Global Market & Tension Strip */}
      <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
        <div className="p-2 rounded-xl glass-card">
          <div className="text-slate-400 text-[10px]">نفت برنت</div>
          <div className="font-mono font-black text-amber-300">${room.market.oilPriceUsd}</div>
        </div>
        <div className="p-2 rounded-xl glass-card">
          <div className="text-slate-400 text-[10px]">شاخص گاز</div>
          <div className="font-mono font-black text-cyan-300">{room.market.gasPriceIndex}</div>
        </div>
        <div className="p-2 rounded-xl glass-card">
          <div className="text-slate-400 text-[10px]">غلات جهانی</div>
          <div className="font-mono font-black text-lime-300">{room.market.foodPriceIndex}</div>
        </div>
        <div className="p-2 rounded-xl glass-card">
          <div className="text-slate-400 text-[10px]">تنش جهانی</div>
          <div className="font-mono font-black text-rose-400">{room.market.globalTension}٪</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5 glass-panel p-1.5 rounded-2xl text-[11px] sm:text-xs font-bold">
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setTab('NEWS');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1 ${
            tab === 'NEWS' ? 'bg-rose-500 text-white font-black' : 'text-slate-300'
          }`}
        >
          <Tv className="w-3.5 h-3.5" />
          شبکه خبر
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setTab('RANKINGS');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1 ${
            tab === 'RANKINGS' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          لیدربرد جهان
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setTab('BATTLES');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1 ${
            tab === 'BATTLES' ? 'bg-orange-500 text-slate-950 font-black' : 'text-slate-300'
          }`}
        >
          <Swords className="w-3.5 h-3.5" />
          نبردها ({room.battles.length})
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setTab('INTEL');
          }}
          className={`py-2 rounded-xl flex items-center justify-center gap-1 ${
            tab === 'INTEL' ? 'bg-amber-400 text-slate-950 font-black' : 'text-slate-300'
          }`}
        >
          <FileWarning className="w-3.5 h-3.5" />
          بولتن ({me?.intelReports.length || 0})
        </button>
      </div>

      {tab === 'NEWS' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
            {(
              [
                ['ALL', 'همه اخبار'],
                ['WAR', '🔴 جنگ و کشورگشایی'],
                ['COVERT', '🕵️ سایبری و اطلاعات'],
                ['ECONOMY', '🛢️ انرژی و بازار'],
                ['DIPLOMACY', '⚖️ سازمان ملل و پیمان‌ها'],
              ] as const
            ).map(([k, lbl]) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setNewsFilter(k);
                }}
                className={`px-2.5 py-1 rounded-lg border ${
                  newsFilter === k
                    ? 'bg-rose-500/25 border-rose-400 text-white'
                    : 'bg-[#0b1324] border-slate-800 text-slate-400'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          {filteredNews.map((n) => (
            <div
              key={n.id}
              className={`p-3.5 rounded-2xl border ${
                n.breaking
                  ? 'bg-rose-950/25 border-rose-500/40'
                  : 'glass-card'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] mb-1 gap-2">
                <span className="font-bold text-amber-300 flex items-center gap-1.5">
                  {n.breaking && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">
                      فوری
                    </span>
                  )}
                  {n.agencyFa}
                </span>
                <span className="text-slate-500 shrink-0">ماه {n.round} • {n.monthLabelFa}</span>
              </div>
              <h4 className="font-black text-xs sm:text-sm text-white leading-relaxed">{n.headlineFa}</h4>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">{n.bodyFa}</p>
              {n.involvedCountries.length > 0 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {n.involvedCountries.map((cid) => (
                    <CountryFlag key={cid} countryId={cid} size="sm" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'BATTLES' && (
        <div className="space-y-2.5">
          {room.battles.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 glass-card rounded-2xl">
              هنوز نبرد زمینی تمام‌عیاری ثبت نشده است.
            </div>
          ) : (
            room.battles.map((b) => (
              <div key={b.id} className="p-3.5 rounded-2xl glass-card text-xs space-y-1">
                <div className="flex items-center justify-between font-bold text-white">
                  <span>{b.opTitleFa} (ماه {b.round})</span>
                  <span className="text-amber-300 font-mono">+${b.lootB}B غنیمت</span>
                </div>
                <p className="text-slate-300 leading-relaxed">{b.summaryFa}</p>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'INTEL' && (
        <div className="space-y-2.5">
          {!me || me.intelReports.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-400 glass-card rounded-2xl">
              هنوز بولتن فوق‌محرمانه‌ای از {me?.agencyCode || 'سرویس اطلاعات'} دریافت نشده است.
            </div>
          ) : (
            me.intelReports.map((rep) => (
              <div
                key={rep.id}
                className={`p-3.5 rounded-2xl border ${
                  rep.severity === 'CRITICAL'
                    ? 'bg-rose-950/35 border-rose-500/50'
                    : rep.severity === 'SUCCESS'
                    ? 'bg-emerald-950/25 border-emerald-500/40'
                    : 'glass-card'
                }`}
              >
                <div className="text-[11px] text-slate-400 mb-1">
                  طبقه‌بندی فوق‌محرمانه • ماه {rep.round}
                </div>
                <div className="font-bold text-sm text-white">{rep.titleFa}</div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">{rep.detailFa}</p>
              </div>
            ))
          )}
        </div>
      )}

      {/* MULTI-DIMENSIONAL GLOBAL SUPERPOWER LEADERBOARD (ITEM #15!) */}
      {tab === 'RANKINGS' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5 text-[11px] font-bold">
            {(
              [
                ['TOTAL', '🏆 شاخص کل ابرقدرتی'],
                ['ECONOMY', '💰 اقتصاد و GDP'],
                ['MILITARY', '⚔️ ارتش و بازدارندگی'],
                ['TECH', '🔬 علم و دکترین'],
                ['INFLUENCE', '🤝 نفوذ و ثبات'],
              ] as [LeaderboardMetric, string][]
            ).map(([m, lbl]) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  sound.playClick();
                  setRankMetric(m);
                }}
                className={`px-2.5 py-1 rounded-xl border transition ${
                  rankMetric === m
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-black'
                    : 'bg-[#0b1324] border-slate-800 text-slate-300'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="glass-panel rounded-2xl overflow-hidden">
            <div className="divide-y divide-slate-800/80">
              {sortedRankings.map((r, index) => {
                const c = room.countries[r.countryId];
                const tierColor =
                  r.tierFa === 'ابرقدرت جهانی'
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    : r.tierFa === 'قدرت بزرگ'
                    ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/35'
                    : r.tierFa === 'در بحران' || r.tierFa === 'سقوط‌کرده'
                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                    : 'bg-slate-800 text-slate-300 border-slate-700';

                const displayedMetric =
                  rankMetric === 'ECONOMY'
                    ? r.economicScore
                    : rankMetric === 'MILITARY'
                    ? r.militaryScore
                    : rankMetric === 'TECH'
                    ? r.techScore
                    : rankMetric === 'INFLUENCE'
                    ? r.influenceScore + r.stabilityScore
                    : r.score;

                return (
                  <div
                    key={r.countryId}
                    className={`px-3.5 py-3 flex items-center justify-between gap-2 text-xs sm:text-sm ${
                      c.isEliminated ? 'opacity-50' : r.countryId === myCountryId ? 'bg-emerald-500/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="w-6 text-center font-mono font-black text-amber-300">
                        #{index + 1}
                      </span>
                      <CountryFlag countryId={c.id} size="md" />
                      <div>
                        <div className="font-bold text-white flex items-center gap-1.5 flex-wrap">
                          <span>{c.nameFa}</span>
                          {c.playerName && (
                            <span className="text-emerald-300 text-xs">({c.playerName})</span>
                          )}
                          <span className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${tierColor}`}>
                            {r.tierFa}
                          </span>
                          {r.territoriesCount > 0 && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">
                              🏴 +{r.territoriesCount}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                          <span>اقتصاد: {r.economicScore}</span>
                          <span>• نظامی: {r.militaryScore} ({r.totalUnits} واحد)</span>
                          <span>• علم: {r.techScore}</span>
                          <span>• نفوذ/ثبات: {r.influenceScore + r.stabilityScore}</span>
                        </div>
                      </div>
                    </div>
                    <div className="font-mono font-black text-base text-cyan-300 shrink-0">
                      {displayedMetric}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
