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
  Wrench,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import {
  CabinetSuggestion,
  computeCountryMilitary,
  computeEconomyProjection,
  getEmergencyActionCost,
  getGlobalSpotPrices,
  getIndigenousOrAllyWeaponCost,
  getInfraNextCost,
  getMaxBuildsPerRound,
  getSmartCabinetAdvice,
  getUpgradeNextCost,
} from '../../shared/advisor';
import { INFRASTRUCTURE_CATALOG, UPGRADE_TRACKS, WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  ChokepointStatus,
  CountryId,
  EmergencyActionKind,
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
  onEmergencyAction: (kind: EmergencyActionKind) => void;
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
  onEmergencyAction,
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

  if (me.isEliminated) {
    return (
      <div className="bg-rose-950/30 border-2 border-rose-500/60 rounded-3xl p-6 text-center space-y-3">
        <div className="text-3xl">🥀</div>
        <h2 className="text-lg sm:text-xl font-black text-rose-300">
          سقوط دولت و حذف از فرماندهی فعال
        </h2>
        <p className="text-xs sm:text-sm text-slate-200 leading-relaxed">
          {me.eliminatedReasonFa || 'دولت کشور شما بر اثر شدت بحران یا فتح نظامی سقوط کرد.'}
        </p>
        <div className="text-xs text-slate-400 pt-2">
          شما اکنون در حالت «نظاره‌گر اتاق جنگ» هستید و می‌توانید ادامه نبردها، نقشه جهان و اخبار را به صورت زنده دنبال کنید.
        </div>
      </div>
    );
  }

  const econ = computeEconomyProjection(me, room.market, room.chokepoints, room.minorNations);
  const mil = computeCountryMilitary(me);
  const spot = getGlobalSpotPrices(room.market);
  const sellFactor = me.sanctionedBy.length > 0 ? 0.88 : 1;
  const oilSellCashB = Math.max(8, Math.round(spot.oilSell50B * sellFactor));
  const gasSellCashB = Math.max(8, Math.round(spot.gasSell50B * sellFactor));
  const foodSellCashB = Math.max(8, Math.round(spot.foodSell50B * sellFactor));
  const suggestions = getSmartCabinetAdvice(room, countryId);
  const myChokepoint = Object.values(room.chokepoints).find((cp) => cp.controller === countryId);
  const maxBuilds = getMaxBuildsPerRound(me);
  const totalRuins = Object.values(me.damagedInfra || {}).reduce((a, b) => a + b, 0);

  const gridEmergencyCost = getEmergencyActionCost(me, 'REPAIR_GRID');
  const radarEmergencyCost = getEmergencyActionCost(me, 'REPAIR_RADAR_CYBER');
  const reliefEmergencyCost = getEmergencyActionCost(me, 'NATIONAL_RELIEF');

  const executeSuggestion = (s: CabinetSuggestion) => {
    sound.playLevelUp();
    if (s.quickAction.type === 'INSTANT_INFRA') {
      onInstantInfra(s.quickAction.infraType);
    } else if (s.quickAction.type === 'INSTANT_UPGRADE') {
      onInstantUpgrade(s.quickAction.track);
    } else if (s.quickAction.type === 'EMERGENCY_ACTION') {
      onEmergencyAction(s.quickAction.emergencyKind);
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
      {/* Regime Crisis Warning Banner (When under heavy bombardment/devastation!) */}
      {(me.devastation >= 45 || me.approval <= 25 || me.regimeCrisisStreak > 0) && (
        <div className="bg-rose-950/50 border border-rose-500 rounded-2xl p-3.5 space-y-2 animate-pulse">
          <div className="flex items-center justify-between text-xs font-black text-rose-300">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              هشدار امنیتی: خطر سقوط کابینه! (ویرانی: {me.devastation}٪ | رضایت: {me.approval}٪)
            </span>
          </div>
          <p className="text-[11px] text-rose-100 leading-relaxed">
            اگر ویرانی به ۹۵٪ برسد یا رضایت مردم دو ماه پیاپی بحرانی بماند، دولت سقوط کرده و از بازی حذف می‌شوید! همین حالا از دکمه‌های «بازسازی اضطراری» استفاده کنید.
          </p>
        </div>
      )}

      {/* 4 Sub-Tabs */}
      <div className="grid grid-cols-4 gap-1.5 bg-[#08101f] p-1.5 rounded-2xl border border-slate-800 text-[11px] sm:text-xs font-black">
        <button
          type="button"
          onClick={() => setSubTab('COMMAND')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'COMMAND' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          فرمان و بورس
        </button>
        <button
          type="button"
          onClick={() => setSubTab('UPGRADES')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'UPGRADES' ? 'bg-purple-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          دکترین (۱۰ سطح)
        </button>
        <button
          type="button"
          onClick={() => setSubTab('INFRA')}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 relative transition ${
            subTab === 'INFRA' ? 'bg-cyan-400 text-slate-950' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          ساخت و بازسازی
          {totalRuins > 0 && (
            <span className="px-1.5 rounded-full bg-rose-600 text-white text-[10px]">{totalRuins}</span>
          )}
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
          {/* Empire & Regime Vitals Strip */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">تمامیت ارضی خاک</div>
              <div className="font-mono font-black text-emerald-300 text-sm mt-0.5">{me.integrityPct}٪</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">شاخص بحران و ویرانی</div>
              <div
                className={`font-mono font-black text-sm mt-0.5 ${
                  me.devastation >= 50 ? 'text-rose-400' : me.devastation >= 25 ? 'text-amber-300' : 'text-cyan-300'
                }`}
              >
                {me.devastation}٪
              </div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">کشورهای ضمیمه‌شده</div>
              <div className="font-mono font-black text-amber-300 text-sm mt-0.5">
                🏴 {econ.territoriesAnnexed} قلمرو
              </div>
            </div>
          </div>

          {/* ALWAYS-AVAILABLE EMERGENCY RECONSTRUCTION & CRISIS RECOVERY! */}
          {(me.devastation > 0 || me.powerGrid < 95 || me.radarIntegrity < 95 || me.approval < 80) && (
            <div className="bg-[#0d1629] border border-cyan-500/35 rounded-2xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs sm:text-sm font-black text-cyan-300 flex items-center gap-1.5">
                  <Wrench className="w-4 h-4" />
                  ستاد بازسازی اضطراری و مهار بحران (همیشه فعال، حتی در سقف زیرساخت!)
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    sound.playLevelUp();
                    onEmergencyAction('REPAIR_GRID');
                  }}
                  className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 font-bold text-right"
                >
                  <div>⚡ ترمیم فوری شبکه برق</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">+۲۴٪ برق و -۱۴٪ ویرانی (${gridEmergencyCost}B)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playLevelUp();
                    onEmergencyAction('REPAIR_RADAR_CYBER');
                  }}
                  className="p-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-bold text-right"
                >
                  <div>📡 بازسازی رادار و ضدجاسوسی</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">+۴۵٪ رادار و تقویت ردیابی (${radarEmergencyCost}B)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playLevelUp();
                    onEmergencyAction('NATIONAL_RELIEF');
                  }}
                  className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-right"
                >
                  <div>🏥 بسته امداد و نجات دولت</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">+۱۴٪ رضایت و -۲۰٪ بحران (${reliefEmergencyCost}B)</div>
                </button>
              </div>
            </div>
          )}

          {/* 1-Click Global Commodity Spot Market */}
          <div className="bg-[#0b1426] border border-amber-500/35 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-xs sm:text-sm font-black text-amber-300">
                  🛢️ بورس جهانی انرژی و غلات (معامله آنی ۱-کلیکی)
                </h3>
              </div>
              <button
                type="button"
                onClick={onToggleAutoSell}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition ${
                  me.autoSellSurplus
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {me.autoSellSurplus ? '✓ فروش خودکار مازاد: روشن' : 'فروش خودکار مازاد: خاموش'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'SELL');
                }}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ نفت
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${oilSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-amber-200 font-bold text-center"
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
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ گاز
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${gasSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('GAS', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-cyan-200 font-bold text-center"
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
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💰 فروش ۵۰ غذا
                <span className="block font-mono text-emerald-300 text-xs mt-0.5">+${foodSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('FOOD', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#070e1c] hover:bg-slate-800 border border-slate-700 text-lime-200 font-bold text-center"
              >
                🛒 خرید ۵۰ غذا
                <span className="block font-mono text-slate-300 text-xs mt-0.5">-${spot.foodBuy50B}B</span>
              </button>
            </div>
          </div>

          {/* Smart Cabinet Suggestions */}
          {suggestions.length > 0 && (
            <div className="bg-[#0b1324] border border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                پیشنهادهای هوشمند کابینه
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

          {/* Queued Strategic Operations */}
          <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-black text-white">
                🎯 عملیات‌های ثبت‌شده این ماه ({me.orders.length} / ۴)
              </h3>
              <span className="text-xs text-emerald-400 font-mono">
                تراز ماه بعد: {econ.netIncomeB >= 0 ? `+$${econ.netIncomeB}B` : `-$${Math.abs(econ.netIncomeB)}B`}
              </span>
            </div>

            {me.orders.length === 0 ? (
              <div className="py-3 px-3 text-center text-xs text-slate-400 bg-[#070d19] rounded-xl border border-slate-800/80">
                روی هر یک از ۱۹۵ کشور نقشه کلیک کنید تا عملیات هوایی، دریایی، زمینی، کشورگشایی یا جاسوسی ثبت شود!
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
                        <span className="text-emerald-300 font-mono">({ord.estimatedSuccessPct}٪ موفقیت)</span>
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

          {/* Domain Military Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">✈️ قدرت هوایی</div>
              <div className="text-sm font-black text-sky-300 font-mono">{mil.airPower}</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">⚓ قدرت دریایی</div>
              <div className="text-sm font-black text-cyan-300 font-mono">{mil.navalPower}</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">🚜 قدرت زرهی/زمینی</div>
              <div className="text-sm font-black text-amber-300 font-mono">{mil.groundPower}</div>
            </div>
            <div className="bg-[#0b1324] border border-slate-800 rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">🛡️ رهگیری پدافند</div>
              <div className="text-sm font-black text-emerald-300 font-mono">{mil.interceptRate}٪</div>
            </div>
          </div>
        </div>
      )}

      {/* 8 NATIONAL DOCTRINE PILLARS (Lv.1 -> Lv.10) */}
      {subTab === 'UPGRADES' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-between text-xs text-purple-200">
            <span>⭐ ۸ دکترین راهبردی تا سطح ۱۰ (مخصوص کمپین‌های بلندمدت)</span>
            <span className="font-mono font-bold text-white">
              ظرفیت پژوهش این ماه: {1 - me.upgradesUsedThisRound}/1
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {(Object.keys(UPGRADE_TRACKS) as UpgradeTrack[]).map((track) => {
              const spec = UPGRADE_TRACKS[track];
              const lv = me.upgrades[track] || 0;
              const maxed = lv >= spec.maxLevel;
              const cost = getUpgradeNextCost(me, track, room.settings.difficulty);
              const usedSlot = me.upgradesUsedThisRound >= 1;

              return (
                <div
                  key={track}
                  className="p-3.5 rounded-2xl bg-[#0b1324] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg">{spec.icon}</span>
                      <span className="font-black text-sm text-white">{spec.nameFa}</span>
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                        Lv.{lv}/{spec.maxLevel}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: spec.maxLevel }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${
                            i < lv ? 'text-amber-400 fill-amber-400' : 'text-slate-700'
                          }`}
                        />
                      ))}
                    </div>
                    <p className="text-xs text-slate-300">{spec.perLevelBonusFa}</p>
                    <p className="text-[10px] text-cyan-300/90">{spec.milestonesFa}</p>
                  </div>

                  <button
                    type="button"
                    disabled={maxed || usedSlot}
                    onClick={() => {
                      sound.playLevelUp();
                      onInstantUpgrade(track);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-gradient-to-l from-purple-500 to-indigo-500 hover:from-purple-400 hover:to-indigo-400 text-white font-black text-xs shrink-0 disabled:opacity-40"
                  >
                    {maxed
                      ? 'تکمیل (Lv.10)'
                      : usedSlot
                      ? `پژوهش ماه بعد ($${cost}B)`
                      : `ارتقا به سطح ${lv + 1} ($${cost}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INFRASTRUCTURES, WAR RUINS RECONSTRUCTION & CHOKEPOINTS */}
      {subTab === 'INFRA' && (
        <div className="space-y-3.5">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
            <span>🏗️ ظرفیت مهندسی و بازسازی در این ماه (ارتقا با ابرصنعت)</span>
            <span className="font-mono font-black text-white">
              باقی‌مانده این ماه: {maxBuilds - me.buildsUsedThisRound} / {maxBuilds}
            </span>
          </div>

          {myChokepoint && (
            <div className="bg-[#0d182e] border border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
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
              const ruins = me.damagedInfra?.[type] || 0;
              const costInfo = getInfraNextCost(me, type, room.settings.difficulty);
              const pct = Math.round((level / spec.maxLevel) * 100);
              const noSlotLeft = me.buildsUsedThisRound >= maxBuilds;

              return (
                <div
                  key={type}
                  className={`p-3.5 rounded-2xl border flex flex-col justify-between gap-2.5 ${
                    ruins > 0
                      ? 'bg-rose-950/20 border-rose-500/45'
                      : 'bg-[#0b1324] border-slate-800'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-bold text-xs sm:text-sm text-white">
                        {spec.icon} {spec.nameFa}
                      </span>
                      <span className="text-xs font-mono text-cyan-300">
                        Lv.{level}/{spec.maxLevel}
                      </span>
                    </div>
                    {ruins > 0 && (
                      <div className="mt-1 text-[11px] font-bold text-rose-300">
                        🔥 {ruins} سطح ویران‌شده در جنگ (بازسازی با ۴۵٪ تخفیف!)
                      </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-1">{spec.effectSummaryFa}</p>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={(!costInfo.isRebuild && level >= spec.maxLevel) || noSlotLeft}
                    onClick={() => {
                      sound.playLevelUp();
                      onInstantInfra(type);
                    }}
                    className={`w-full py-2 rounded-xl font-black text-xs disabled:opacity-40 ${
                      costInfo.isRebuild
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {noSlotLeft
                      ? 'تکمیل ظرفیت این ماه'
                      : costInfo.isRebuild
                      ? `🔧 بازسازی ویرانه جنگی ($${costInfo.costB}B)`
                      : level >= spec.maxLevel
                      ? 'در سقف ظرفیت (۲۰/۲۰)'
                      : `احداث سطح جدید ($${costInfo.costB}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INDIGENOUS & FOREIGN ARMS */}
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
                ['ARMOR', '🚜 زرهی/زمینی'],
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
              const access = getIndigenousOrAllyWeaponCost(me, w.id, room.settings.difficulty);
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
                      {access.isAllyLicensed && (
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 text-[10px] font-bold">
                          تحت لیسانس متحد
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{w.shortDescFa}</p>
                    <div className="text-[11px] font-mono text-slate-300">
                      سازنده: {origin.nameFa} • حمله {w.attackPower} • دفاع {w.defensePower}
                      {w.interceptBonus > 0 ? ` • رهگیری +${w.interceptBonus}٪` : ''}
                    </div>
                    {access.canBuildDirectly && access.lockedReasonFa && (
                      <div className="text-[11px] text-amber-300 flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3" /> {access.lockedReasonFa}
                      </div>
                    )}
                  </div>

                  {access.canBuildDirectly ? (
                    <button
                      type="button"
                      disabled={Boolean(access.lockedReasonFa)}
                      onClick={() => {
                        sound.playLevelUp();
                        onInstantWeapon(w.id, 1);
                      }}
                      className="px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-40"
                    >
                      <Factory className="w-4 h-4" />
                      تولید (${access.finalCostB}B)
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
