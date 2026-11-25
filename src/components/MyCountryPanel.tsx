import React, { useState } from 'react';
import {
  Sparkles,
  Building2,
  Shield,
  Trash2,
  Factory,
  ShoppingCart,
  Anchor,
  Plane,
  Lock,
} from 'lucide-react';
import {
  CabinetSuggestion,
  computeCountryMilitary,
  computeEconomyProjection,
  getIndigenousOrAllyWeaponCost,
  getSmartCabinetAdvice,
} from '../../shared/advisor';
import { INFRASTRUCTURE_CATALOG, WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  ChokepointStatus,
  CountryId,
  GameOrder,
  GameRoomState,
  InfrastructureType,
  TradeResourceKind,
  WeaponCategory,
} from '../../shared/types';
import { DrawerTab } from './TargetCountryDrawer';
import { sound } from '../utils/sound';

interface MyCountryPanelProps {
  room: GameRoomState;
  countryId: CountryId;
  onQueueOrder: (draft: Partial<GameOrder>) => void;
  onCancelOrder: (orderId: string) => void;
  onProposeTrade: (payload: {
    to: CountryId;
    offerType: TradeResourceKind;
    amount: number;
    weaponId?: string;
    priceB: number;
    direction: 'SELL' | 'BUY' | 'PACT';
  }) => void;
  onOpenCountryDrawer: (targetId: CountryId, tab: DrawerTab) => void;
}

export const MyCountryPanel: React.FC<MyCountryPanelProps> = ({
  room,
  countryId,
  onQueueOrder,
  onCancelOrder,
  onProposeTrade,
  onOpenCountryDrawer,
}) => {
  const [subTab, setSubTab] = useState<'OVERVIEW' | 'INFRA' | 'WEAPONS'>('OVERVIEW');
  const [weaponFilter, setWeaponFilter] = useState<'ALL' | WeaponCategory>('ALL');

  const me = room.countries[countryId];
  if (!me) return null;

  const econ = computeEconomyProjection(me, room.market, room.chokepoints);
  const mil = computeCountryMilitary(me);
  const suggestions = getSmartCabinetAdvice(room, countryId);
  const myChokepoint = Object.values(room.chokepoints).find((cp) => cp.controller === countryId);

  const executeSuggestion = (s: CabinetSuggestion) => {
    sound.playOrderConfirm();
    if (s.quickAction.type === 'BUILD_INFRA') {
      onQueueOrder({ kind: 'BUILD_INFRA', infraType: s.quickAction.infraType });
    } else if (s.quickAction.type === 'DOMESTIC_POLICY') {
      onQueueOrder({ kind: 'DOMESTIC_POLICY', policyType: s.quickAction.policyType });
    } else if (s.quickAction.type === 'QUICK_FLIGHT_CAP') {
      onQueueOrder({ kind: 'FLIGHT_MISSION', flightType: 'CAP_PATROL', targetCountry: countryId });
    } else if (s.quickAction.type === 'OPEN_COUNTRY_DRAWER') {
      onOpenCountryDrawer(s.quickAction.targetCountry, s.quickAction.tab);
    }
  };

  const filteredWeapons = Object.values(WEAPONS_CATALOG).filter(
    (w) => weaponFilter === 'ALL' || w.category === weaponFilter
  );

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-2 bg-[#08101f] p-1.5 rounded-2xl border border-slate-800 text-xs sm:text-sm font-bold">
        <button
          type="button"
          onClick={() => setSubTab('OVERVIEW')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
            subTab === 'OVERVIEW' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          اتاق فرمان و کابینه
        </button>
        <button
          type="button"
          onClick={() => setSubTab('INFRA')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
            subTab === 'INFRA' ? 'bg-cyan-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Building2 className="w-4 h-4" />
          ساخت‌وساز و سیاست
        </button>
        <button
          type="button"
          onClick={() => setSubTab('WEAPONS')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
            subTab === 'WEAPONS' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Shield className="w-4 h-4" />
          تسلیحات واقعی ({mil.totalUnits})
        </button>
      </div>

      {subTab === 'OVERVIEW' && (
        <div className="space-y-4">
          {/* Smart Cabinet Suggestions (Zero-Reading Helper!) */}
          <div className="bg-[#0b1324] border border-emerald-500/30 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-emerald-300 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                پیشنهادهای هوشمند مشاوران کابینه (اجرای ۱-کلیکی)
              </h3>
              <span className="text-[11px] text-slate-400">مخصوص تصمیم‌گیری سریع</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {suggestions.map((s) => (
                <div
                  key={s.id}
                  className={`p-3.5 rounded-xl border flex flex-col justify-between gap-2.5 ${
                    s.urgency === 'HIGH'
                      ? 'bg-rose-500/10 border-rose-500/35'
                      : s.urgency === 'OPPORTUNITY'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-[#070d19] border-slate-800'
                  }`}
                >
                  <div>
                    <span className="text-[10px] font-bold text-amber-300">{s.ministerFa}</span>
                    <div className="font-bold text-xs sm:text-sm text-white mt-0.5">{s.titleFa}</div>
                    <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{s.subtitleFa}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => executeSuggestion(s)}
                    className="w-full py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs transition"
                  >
                    {s.buttonLabelFa}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Pending Orders This Month */}
          <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-white">
                📋 دستورات ثبت‌شده شما برای این ماه ({me.orders.length} / ۶)
              </h3>
              <span className="text-xs text-emerald-400 font-mono">
                درآمد خالص ماه بعد: {econ.netIncomeB >= 0 ? `+$${econ.netIncomeB}B` : `-$${Math.abs(econ.netIncomeB)}B`}
              </span>
            </div>

            {me.orders.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400 bg-[#070d19] rounded-xl border border-slate-800/80">
                هنوز دستوری برای این ماه ثبت نکرده‌اید؛ از پیشنهادهای بالا استفاده کنید یا روی نقشه جهان کلیک کنید!
              </div>
            ) : (
              <div className="space-y-2">
                {me.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="px-3.5 py-2.5 rounded-xl bg-[#070d19] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-slate-100">{ord.summaryFa}</span>
                      <span className="text-amber-300 font-mono mr-2">(${ord.costB}B)</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCancelOrder(ord.id)}
                      className="px-2.5 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      لغو و بازگشت پول
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* National Military & Strategic Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400">قدرت تهاجمی</div>
              <div className="text-lg font-black text-rose-400 font-mono mt-0.5">{mil.attackScore}</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400">نرخ رهگیری پدافند</div>
              <div className="text-lg font-black text-cyan-300 font-mono mt-0.5">{mil.interceptRate}٪</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400">سپر سایبری و رادار</div>
              <div className="text-lg font-black text-purple-300 font-mono mt-0.5">
                {me.cyberShield}٪ / {me.radarIntegrity}٪
              </div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-3">
              <div className="text-slate-400">برنامه هسته‌ای</div>
              <div className="text-lg font-black text-amber-300 font-mono mt-0.5">
                {me.warheads > 0 ? `☢️ ${me.warheads} کلاهک` : `${me.nuclearProgress}٪`}
              </div>
            </div>
          </div>

          {/* Current Arsenal Inventory */}
          <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-2.5">
            <h3 className="text-sm font-black text-white">🎖️ موجودی تسلیحات عملیاتی ارتش شما</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {Object.entries(me.weapons)
                .filter(([, cnt]) => cnt > 0)
                .map(([wId, cnt]) => {
                  const spec = WEAPONS_CATALOG[wId];
                  if (!spec) return null;
                  return (
                    <div
                      key={wId}
                      className="px-3 py-2 rounded-xl bg-[#070d19] border border-slate-800 flex items-center justify-between text-xs"
                    >
                      <span className="font-bold text-slate-200 truncate">{spec.nameFa}</span>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 font-mono font-bold shrink-0">
                        ×{cnt}
                      </span>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {subTab === 'INFRA' && (
        <div className="space-y-4">
          {/* Strategic Chokepoint Control if Owned */}
          {myChokepoint && (
            <div className="bg-[#0d182e] border border-amber-500/40 rounded-2xl p-4 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Anchor className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-black text-sm text-white">
                      کنترل آبراه استراتژیک: {myChokepoint.nameFa}
                    </h3>
                    <p className="text-[11px] text-slate-400">{myChokepoint.descriptionFa}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 text-xs">
                  {(
                    [
                      ['OPEN', '🟢 تردد آزاد'],
                      ['RESTRICTED', '🟡 بازرسی امنیتی'],
                      ['BLOCKADED', '🔴 انسداد کامل نظامی!'],
                    ] as [ChokepointStatus, string][]
                  ).map(([st, lbl]) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({
                          kind: 'DOMESTIC_POLICY',
                          policyType: 'TOGGLE_CHOKEPOINT',
                          chokepointStatus: st,
                        });
                      }}
                      className={`px-3 py-1.5 rounded-xl font-bold border ${
                        myChokepoint.status === st
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-[#070d19] text-slate-300 border-slate-700'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Quick National Defense & Domestic Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => {
                sound.playOrderConfirm();
                onQueueOrder({ kind: 'FLIGHT_MISSION', flightType: 'CAP_PATROL', targetCountry: countryId });
              }}
              className="p-3.5 rounded-2xl bg-[#0b1324] hover:bg-[#101c33] border border-cyan-500/30 text-right space-y-1"
            >
              <div className="font-bold text-xs text-cyan-300 flex items-center gap-1.5">
                <Plane className="w-4 h-4" /> گشت هوایی پدافندی ($6B)
              </div>
              <p className="text-[11px] text-slate-400">حفاظت جنگنده‌ها از آسمان کشور در این ماه</p>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playOrderConfirm();
                onQueueOrder({ kind: 'ESPIONAGE_OP', espionageType: 'COUNTER_INTEL_SWEEP' });
              }}
              className="p-3.5 rounded-2xl bg-[#0b1324] hover:bg-[#101c33] border border-amber-500/30 text-right space-y-1"
            >
              <div className="font-bold text-xs text-amber-300 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> شکار جاسوسان داخلی ($10B)
              </div>
              <p className="text-[11px] text-slate-400">حفاظت شدید از دانشمندان و فرماندهان در برابر ترور</p>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playOrderConfirm();
                onQueueOrder({ kind: 'DOMESTIC_POLICY', policyType: 'WELFARE_PACKAGE' });
              }}
              className="p-3.5 rounded-2xl bg-[#0b1324] hover:bg-[#101c33] border border-emerald-500/30 text-right space-y-1"
            >
              <div className="font-bold text-xs text-emerald-300">🏥 بسته رفاه عمومی ($18B)</div>
              <p className="text-[11px] text-slate-400">+۱۰٪ افزایش فوری رضایت مردم کشور</p>
            </button>

            <button
              type="button"
              onClick={() => {
                sound.playOrderConfirm();
                onQueueOrder({ kind: 'DOMESTIC_POLICY', policyType: 'NUCLEAR_PROGRAM_PUSH' });
              }}
              className="p-3.5 rounded-2xl bg-[#0b1324] hover:bg-[#101c33] border border-rose-500/30 text-right space-y-1"
            >
              <div className="font-bold text-xs text-rose-300">☢️ جهش برنامه هسته‌ای ($36B)</div>
              <p className="text-[11px] text-slate-400">+۲۲٪ پیشرفت چرخه سوخت یا تولید کلاهک جدید</p>
            </button>
          </div>

          {/* 8 Real Infrastructures */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]).map((type) => {
              const spec = INFRASTRUCTURE_CATALOG[type];
              const level = me.infrastructure[type];
              const pct = Math.round((level / spec.maxLevel) * 100);
              return (
                <div
                  key={type}
                  className="p-4 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">
                        {spec.icon} {spec.nameFa}
                      </span>
                      <span className="text-xs font-mono text-cyan-300">
                        سطح {level} / {spec.maxLevel}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{spec.effectSummaryFa}</p>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={level >= spec.maxLevel}
                    onClick={() => {
                      sound.playOrderConfirm();
                      onQueueOrder({ kind: 'BUILD_INFRA', infraType: type });
                    }}
                    className="w-full py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 font-bold text-xs disabled:opacity-40"
                  >
                    {level >= spec.maxLevel ? 'حداکثر سطح تکمیل شده' : `احداث و ارتقا ($${spec.costB}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'WEAPONS' && (
        <div className="space-y-3.5">
          {/* Category Filter */}
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['ALL', 'همه تسلیحات'],
                ['FIGHTER', '✈️ جنگنده‌ها'],
                ['BOMBER', '💣 بمب‌افکن‌ها'],
                ['DRONE', '🛸 پهپادها'],
                ['MISSILE', '🚀 موشک‌ها'],
                ['AIR_DEFENSE', '🛡️ پدافند هوایی'],
                ['NAVAL', '⚓ ناوگان دریایی'],
                ['ARMOR', '🚜 زرهی زمینی'],
              ] as const
            ).map(([cat, lbl]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setWeaponFilter(cat as 'ALL' | WeaponCategory)}
                className={`px-3 py-1.5 rounded-xl font-bold border ${
                  weaponFilter === cat
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-[#0b1324] text-slate-300 border-slate-800'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredWeapons.map((w) => {
              const access = getIndigenousOrAllyWeaponCost(me, w.id);
              const origin = room.countries[w.originCountry];
              const owned = me.weapons[w.id] || 0;

              return (
                <div
                  key={w.id}
                  className="p-4 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-black text-sm text-white">{w.nameFa}</div>
                        <div className="text-[11px] text-slate-400">
                          سازنده واقعی: {origin.flag} {origin.nameFa} • {w.batchLabelFa}
                        </div>
                      </div>
                      {owned > 0 && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold">
                          موجودی: {owned}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">{w.shortDescFa}</p>
                    <div className="flex flex-wrap gap-2 text-[11px] pt-1 font-mono text-slate-400">
                      <span>تهاجم: {w.attackPower}</span>
                      <span>•</span>
                      <span>دفاع: {w.defensePower}</span>
                      {w.interceptBonus > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-cyan-300">رهگیری: +{w.interceptBonus}٪</span>
                        </>
                      )}
                      {w.stealth >= 70 && (
                        <>
                          <span>•</span>
                          <span className="text-purple-300">رادارگریز ({w.stealth}٪)</span>
                        </>
                      )}
                    </div>
                  </div>

                  {access.canBuildDirectly ? (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({ kind: 'PRODUCE_WEAPON', weaponId: w.id, quantity: 1 });
                      }}
                      className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5"
                    >
                      <Factory className="w-4 h-4" />
                      {access.isAllyLicensed
                        ? `تولید تحت لیسانس متحد ($${access.finalCostB}B)`
                        : `تولید در صنایع دفاعی بومی ($${access.finalCostB}B)`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onProposeTrade({
                          to: w.originCountry,
                          offerType: 'WEAPON',
                          weaponId: w.id,
                          amount: 1,
                          priceB: access.finalCostB,
                          direction: 'BUY',
                        });
                      }}
                      className="w-full py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-1.5"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      سفارش خرید از {origin.flag} {origin.nameFa} (${access.finalCostB}B)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
