import React, { useState } from 'react';
import {
  Sparkles,
  Building2,
  Shield,
  Trash2,
  Factory,
  ShoppingCart,
  Anchor,
  Star,
  ArrowUpCircle,
  Coins,
} from 'lucide-react';
import {
  CabinetSuggestion,
  computeCountryMilitary,
  computeEconomyProjection,
  getGlobalSpotPrices,
  getIndigenousOrAllyWeaponCost,
  getInfraNextCost,
  getSmartCabinetAdvice,
  getUpgradeNextCost,
} from '../../shared/advisor';
import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS, WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  ChokepointStatus,
  CountryId,
  GameRoomState,
  InfrastructureType,
  TradeResourceKind,
  UpgradeTrack,
  WeaponCategory,
} from '../../shared/types';
import { DrawerTab } from './TargetCountryDrawer';
import { sound } from '../utils/sound';

interface MyCountryPanelProps {
  room: GameRoomState;
  countryId: CountryId;
  onInstantUpgrade: (track: UpgradeTrack) => void;
  onInstantInfra: (infraType: InfrastructureType) => void;
  onInstantWeapon: (weaponId: string, quantity: number) => void;
  onSpotTrade: (resource: 'OIL' | 'GAS' | 'FOOD' | 'URANIUM', mode: 'BUY' | 'SELL') => void;
  onToggleAutoSell: () => void;
  onSetChokepoint: (status: ChokepointStatus) => void;
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
  onInstantUpgrade,
  onInstantInfra,
  onInstantWeapon,
  onSpotTrade,
  onToggleAutoSell,
  onSetChokepoint,
  onCancelOrder,
  onProposeTrade,
  onOpenCountryDrawer,
}) => {
  const [subTab, setSubTab] = useState<'COMMAND' | 'UPGRADES' | 'INFRA' | 'WEAPONS'>('COMMAND');
  const [weaponFilter, setWeaponFilter] = useState<'ALL' | WeaponCategory>('ALL');

  const me = room.countries[countryId];
  if (!me) return null;

  const econ = computeEconomyProjection(me, room.market, room.chokepoints);
  const mil = computeCountryMilitary(me);
  const spot = getGlobalSpotPrices(room.market);
  const sellFactor = me.sanctionedBy.length > 0 ? 0.88 : 1;
  const oilSellCashB = Math.max(8, Math.round(spot.oilSell50B * sellFactor));
  const gasSellCashB = Math.max(8, Math.round(spot.gasSell50B * sellFactor));
  const foodSellCashB = Math.max(8, Math.round(spot.foodSell50B * sellFactor));
  const suggestions = getSmartCabinetAdvice(room, countryId);
  const myChokepoint = Object.values(room.chokepoints).find((cp) => cp.controller === countryId);

  const executeSuggestion = (s: CabinetSuggestion) => {
    sound.playLevelUp();
    if (s.quickAction.type === 'INSTANT_INFRA') {
      onInstantInfra(s.quickAction.infraType);
    } else if (s.quickAction.type === 'INSTANT_UPGRADE') {
      onInstantUpgrade(s.quickAction.track);
    } else if (s.quickAction.type === 'SPOT_TRADE') {
      onSpotTrade(s.quickAction.resource, s.quickAction.mode);
    } else if (s.quickAction.type === 'OPEN_COUNTRY_DRAWER') {
      onOpenCountryDrawer(s.quickAction.targetCountry, 'DIPLOMACY');
    }
  };

  const filteredWeapons = Object.values(WEAPONS_CATALOG).filter(
    (w) => weaponFilter === 'ALL' || w.category === weaponFilter
  );

  return (
    <div className="space-y-3.5">
      {/* 4 Clean Sub-Tabs */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#08101f] p-1.5 rounded-2xl border border-slate-800 text-[11px] sm:text-xs font-black">
        <button
          type="button"
          onClick={() => setSubTab('COMMAND')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'COMMAND' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          بورس و فرمان
        </button>
        <button
          type="button"
          onClick={() => setSubTab('UPGRADES')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'UPGRADES' ? 'bg-purple-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          لول‌آپ ملی
        </button>
        <button
          type="button"
          onClick={() => setSubTab('INFRA')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'INFRA' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          ساخت‌وساز
        </button>
        <button
          type="button"
          onClick={() => setSubTab('WEAPONS')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'WEAPONS' ? 'bg-amber-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          ارتش ({mil.totalUnits})
        </button>
      </div>

      {subTab === 'COMMAND' && (
        <div className="space-y-3.5">
          {/* 1-CLICK GLOBAL COMMODITY EXCHANGE + AUTO-SELL SWITCH! */}
          <div className="bg-[#0b1426] border border-amber-500/35 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-black text-amber-300 flex items-center gap-1.5">
                  🛢️ بورس جهانی انرژی و کالا (خرید و فروش آنی ۱-کلیکی!)
                </h3>
                <p className="text-[11px] text-slate-400">
                  بدون نیاز به مذاکره؛ همین لحظه نفت و گاز مازاد را نقد کنید یا کسری انبار را بخرید!
                </p>
              </div>
              <button
                type="button"
                onClick={onToggleAutoSell}
                className={`px-3 py-1.5 rounded-xl text-[11px] font-black border transition ${
                  me.autoSellSurplus
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {me.autoSellSurplus ? '✓ فروش خودکار مازاد نفت: روشن' : 'فروش خودکار مازاد نفت: خاموش'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'SELL');
                }}
                className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ نفت
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${oilSellCashB}B نقد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'BUY');
                }}
                className="p-2.5 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-amber-200 font-bold text-center"
              >
                🛒 خرید ۵۰ نفت
                <span className="block font-mono text-slate-300 text-xs mt-0.5">-${spot.oilBuy50B}B</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('GAS', 'SELL');
                }}
                className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ گاز
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${gasSellCashB}B نقد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('GAS', 'BUY');
                }}
                className="p-2.5 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-cyan-200 font-bold text-center"
              >
                🛒 خرید ۵۰ گاز
                <span className="block font-mono text-slate-300 text-xs mt-0.5">-${spot.gasBuy50B}B</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('FOOD', 'SELL');
                }}
                className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ غذا
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${foodSellCashB}B نقد</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('FOOD', 'BUY');
                }}
                className="p-2.5 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-lime-200 font-bold text-center"
              >
                🛒 خرید ۵۰ غذا
                <span className="block font-mono text-slate-300 text-xs mt-0.5">-${spot.foodBuy50B}B</span>
              </button>
            </div>
          </div>

          {/* Smart Cabinet Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-[#0b1324] border border-emerald-500/30 rounded-2xl p-3.5 space-y-2.5">
              <h3 className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                پیشنهادهای فوری کابینه شما
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-[#070d19] border border-slate-800 flex items-center justify-between gap-3"
                  >
                    <div>
                      <span className="text-[10px] font-bold text-amber-300">{s.ministerFa}</span>
                      <div className="font-bold text-xs text-white">{s.titleFa}</div>
                      <p className="text-[11px] text-slate-400">{s.subtitleFa}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => executeSuggestion(s)}
                      className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0"
                    >
                      {s.buttonLabelFa}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Queued Strategic Military & Covert Ops */}
          <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black text-white">
                🎯 عملیات‌های جنگی و مخفی ثبت‌شده این ماه ({me.orders.length} / ۴)
              </h3>
              <span className="text-xs text-emerald-400 font-mono">
                درآمد ماه بعد: +${econ.netIncomeB}B
              </span>
            </div>

            {me.orders.length === 0 ? (
              <div className="py-3.5 px-3 text-center text-xs text-slate-400 bg-[#070d19] rounded-xl border border-slate-800/80">
                برای حمله نظامی، هک بانک یا جاسوسی، روی هر کشوری در نقشه کلیک کنید!
              </div>
            ) : (
              <div className="space-y-2">
                {me.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="px-3 py-2.5 rounded-xl bg-[#070d19] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {ord.summaryFa}{' '}
                        <span className="text-emerald-300 font-mono">({ord.estimatedSuccessPct}٪ شانس)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">{ord.expectedImpactFa}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onCancelOrder(ord.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      لغو
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Combat Power & Veteran Rank */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[11px]">قدرت تهاجمی</div>
              <div className="text-base font-black text-rose-400 font-mono">{mil.attackScore}</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[11px]">رهگیری پدافند</div>
              <div className="text-base font-black text-cyan-300 font-mono">{mil.interceptRate}٪</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[11px]">درجه تجربه ارتش</div>
              <div className="text-sm font-black text-amber-300">
                {mil.veteranStars > 0 ? '★'.repeat(mil.veteranStars) : 'تازه‌نفس'}
              </div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[11px]">کلاهک هسته‌ای</div>
              <div className="text-base font-black text-amber-400 font-mono">
                {me.warheads > 0 ? `☢️ ${me.warheads}` : `${me.nuclearProgress}٪`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6 STAR-RATED NATIONAL LEVEL-UP PILLARS (Instant Gratification!) */}
      {subTab === 'UPGRADES' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 text-xs text-purple-200">
            ⭐ با لول‌آپ هر شاخه، قدرت کشور شما <strong className="text-white">در همان لحظه</strong> برای کل بازی افزایش می‌یابد!
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {(Object.keys(UPGRADE_TRACKS) as UpgradeTrack[]).map((track) => {
              const spec = UPGRADE_TRACKS[track];
              const lv = me.upgrades[track] || 0;
              const maxed = lv >= spec.maxLevel;
              const cost = getUpgradeNextCost(me, track);

              return (
                <div
                  key={track}
                  className="p-3.5 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{spec.icon}</span>
                      <span className="font-black text-sm text-white">{spec.nameFa}</span>
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: spec.maxLevel }).map((_, i) => (
                          <Star
                            key={i}
                            className={`w-3.5 h-3.5 ${
                              i < lv ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-xs text-slate-400">{spec.perLevelBonusFa}</p>
                  </div>

                  <button
                    type="button"
                    disabled={maxed}
                    onClick={() => {
                      sound.playLevelUp();
                      onInstantUpgrade(track);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-l from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs shrink-0 disabled:opacity-40"
                  >
                    {maxed ? 'حداکثر سطح (MAX)' : `لول‌آپ به سطح ${lv + 1} ($${cost}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INSTANT INFRASTRUCTURES & STRATEGIC CHOKEPOINTS */}
      {subTab === 'INFRA' && (
        <div className="space-y-3.5">
          {myChokepoint && (
            <div className="bg-[#0d182e] border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Anchor className="w-5 h-5 text-amber-400" />
                  <div>
                    <h3 className="font-black text-sm text-white">
                      کنترل فوری {myChokepoint.nameFa}
                    </h3>
                    <p className="text-[11px] text-slate-400">{myChokepoint.descriptionFa}</p>
                  </div>
                </div>
                <div className="flex gap-1.5 text-xs">
                  {(
                    [
                      ['OPEN', '🟢 آزاد'],
                      ['RESTRICTED', '🟡 بازرسی'],
                      ['BLOCKADED', '🔴 بستن نظامی تنگه!'],
                    ] as [ChokepointStatus, string][]
                  ).map(([st, lbl]) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onSetChokepoint(st);
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(Object.keys(INFRASTRUCTURE_CATALOG) as InfrastructureType[]).map((type) => {
              const spec = INFRASTRUCTURE_CATALOG[type];
              const level = me.infrastructure[type];
              const cost = getInfraNextCost(me, type);
              const pct = Math.round((level / spec.maxLevel) * 100);
              return (
                <div
                  key={type}
                  className="p-3.5 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col justify-between gap-2.5"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm text-white">
                        {spec.icon} {spec.nameFa}
                      </span>
                      <span className="text-xs font-mono text-cyan-300">
                        Lv.{level}/{spec.maxLevel}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">{spec.effectSummaryFa}</p>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={level >= spec.maxLevel}
                    onClick={() => {
                      sound.playLevelUp();
                      onInstantInfra(type);
                    }}
                    className="w-full py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs disabled:opacity-40"
                  >
                    {level >= spec.maxLevel ? 'تکمیل شده (MAX)' : `ساخت فوری ($${cost}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INSTANT INDIGENOUS ARMS PRODUCTION & IMPORTS */}
      {subTab === 'WEAPONS' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['ALL', 'همه'],
                ['FIGHTER', '✈️ جنگنده'],
                ['BOMBER', '💣 بمب‌افکن'],
                ['DRONE', '🛸 پهپاد'],
                ['MISSILE', '🚀 موشک'],
                ['AIR_DEFENSE', '🛡️ پدافند'],
                ['NAVAL', '⚓ دریایی'],
                ['ARMOR', '🚜 تانک'],
              ] as const
            ).map(([cat, lbl]) => (
              <button
                key={cat}
                type="button"
                onClick={() => setWeaponFilter(cat as 'ALL' | WeaponCategory)}
                className={`px-2.5 py-1.5 rounded-xl font-bold border ${
                  weaponFilter === cat
                    ? 'bg-amber-400 text-slate-950 border-amber-300'
                    : 'bg-[#0b1324] text-slate-300 border-slate-800'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {filteredWeapons.map((w) => {
              const access = getIndigenousOrAllyWeaponCost(me, w.id);
              const origin = room.countries[w.originCountry];
              const owned = me.weapons[w.id] || 0;

              return (
                <div
                  key={w.id}
                  className="p-3.5 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-white">{w.nameFa}</span>
                      {owned > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                          موجودی: ×{owned}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{w.shortDescFa}</p>
                    <div className="text-[11px] font-mono text-slate-300">
                      سازنده: {origin.nameFa} • تهاجم {w.attackPower} • دفاع {w.defensePower}
                      {w.interceptBonus > 0 ? ` • رهگیری +${w.interceptBonus}٪` : ''}
                    </div>
                  </div>

                  {access.canBuildDirectly ? (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playLevelUp();
                        onInstantWeapon(w.id, 1);
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0"
                    >
                      <Factory className="w-4 h-4" />
                      ساخت فوری (${access.finalCostB}B)
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
                      className="px-3.5 py-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center gap-1.5 shrink-0"
                    >
                      <ShoppingCart className="w-4 h-4" />
                      خرید از {origin.nameFa} (${access.finalCostB}B)
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
