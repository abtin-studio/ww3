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
  DollarSign,
  Target,
  Orbit,
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
  getMaxCovertOrdersPerRound,
  getMaxMilitaryOrdersPerRound,
  getMaxUpgradesPerRound,
  getSatelliteLaunchCost,
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
  onLaunchSatellite: () => void;
  onInstantWeapon: (weaponId: string, quantity: number) => void;
  onSellWeapon: (weaponId: string, quantity: number) => void;
  onSpotTrade: (resource: 'OIL' | 'GAS' | 'FOOD' | 'WATER' | 'URANIUM', mode: 'BUY' | 'SELL') => void;
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
  onLaunchSatellite,
  onInstantWeapon,
  onSellWeapon,
  onSpotTrade,
  onToggleAutoSell,
  onSetChokepoint,
  onCancelOrder,
  onProposeTrade,
  onOpenCountryDrawer,
}) => {
  const [subTab, setSubTab] = useState<'COMMAND' | 'UPGRADES' | 'INFRA' | 'WEAPONS'>('COMMAND');
  const [weaponFilter, setWeaponFilter] = useState<'ALL' | 'OWNED' | WeaponCategory>('ALL');

  const me = room.countries[countryId];
  if (!me) return null;

  if (me.isEliminated) {
    return (
      <div className="bg-rose-950/30 border-2 border-rose-500/60 rounded-3xl p-6 text-center space-y-3 animate-panel-in">
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
  const waterSellCashB = Math.max(7, Math.round(spot.waterSell50B * sellFactor));

  const suggestions = getSmartCabinetAdvice(room, countryId);
  const myChokepoint = Object.values(room.chokepoints).find((cp) => cp.controller === countryId);
  const maxBuilds = getMaxBuildsPerRound(me);
  const maxUps = getMaxUpgradesPerRound(me);
  const maxMilOps = getMaxMilitaryOrdersPerRound(me);
  const maxCovOps = getMaxCovertOrdersPerRound(me);
  const satCostB = getSatelliteLaunchCost(me, room.settings.difficulty);
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

  const filteredWeapons = Object.values(WEAPONS_CATALOG).filter((w) => {
    if (weaponFilter === 'ALL') return true;
    if (weaponFilter === 'OWNED') return (me.weapons[w.id] || 0) > 0;
    return w.category === weaponFilter;
  });

  return (
    <div className="space-y-3.5 animate-panel-in">
      {/* Regime Crisis Warning Banner */}
      {(me.devastation >= 45 || me.approval <= 25 || me.regimeCrisisStreak > 0) && (
        <div className="bg-rose-950/50 border border-rose-500 rounded-2xl p-3.5 space-y-1.5 animate-pulse">
          <div className="flex items-center justify-between text-xs font-black text-rose-300">
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              هشدار امنیتی: خطر سقوط کابینه! (ویرانی: {me.devastation}٪ | رضایت: {me.approval}٪)
            </span>
          </div>
          <p className="text-[11px] text-rose-100 leading-relaxed">
            اگر بحران دو ماه پیاپی مهار نشود دولت سقوط می‌کند! همین حالا از «بسته امداد و نجات دولت» استفاده کنید.
          </p>
        </div>
      )}

      {/* Partial Occupation Alert on Homeland */}
      {me.integrityPct < 100 && me.occupierId && (
        <div className="bg-amber-950/40 border border-amber-500/50 rounded-2xl p-3 flex items-center justify-between gap-2 text-xs">
          <div className="text-amber-200 font-bold">
            ⚔️ {100 - me.integrityPct}٪ از مرزهای کشور در اشغال {room.countries[me.occupierId]?.nameFa} است!
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onOpenCountryDrawer(me.occupierId!, 'WAR');
            }}
            className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black shrink-0"
          >
            پاتک آزادسازی خاک
          </button>
        </div>
      )}

      {/* 4 Sub-Tabs */}
      <div className="grid grid-cols-4 gap-1.5 glass-panel p-1.5 rounded-2xl text-[11px] sm:text-xs font-black">
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setSubTab('COMMAND');
          }}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'COMMAND' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          فرمان و بورس
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setSubTab('UPGRADES');
          }}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'UPGRADES' ? 'bg-purple-400 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <ArrowUpCircle className="w-3.5 h-3.5" />
          دکترین ({me.upgradesUsedThisRound}/{maxUps})
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setSubTab('INFRA');
          }}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 relative transition ${
            subTab === 'INFRA' ? 'bg-cyan-400 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Building2 className="w-3.5 h-3.5" />
          ساخت و علم
          {totalRuins > 0 && (
            <span className="px-1.5 rounded-full bg-rose-600 text-white text-[10px]">{totalRuins}</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setSubTab('WEAPONS');
          }}
          className={`py-2.5 rounded-xl flex items-center justify-center gap-1 transition ${
            subTab === 'WEAPONS' ? 'bg-amber-400 text-slate-950 shadow' : 'text-slate-300 hover:bg-slate-800/70'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          ارتش ({mil.totalUnits})
        </button>
      </div>

      {subTab === 'COMMAND' && (
        <div className="space-y-3.5">
          {/* Empire & Monthly Operational Quotas Strip */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">تمامیت ارضی و قلمرو</div>
              <div className="font-mono font-black text-emerald-300 text-xs sm:text-sm mt-0.5">
                {me.integrityPct}٪ • 🏴 {econ.territoriesAnnexed} فتح
              </div>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">سهمیه حمله نظامی ماه</div>
              <div className="font-mono font-black text-rose-300 text-xs sm:text-sm mt-0.5">
                ⚔️ {me.militaryOrdersUsedThisRound} / {maxMilOps}
              </div>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">سهمیه سایبری و نیابتی</div>
              <div className="font-mono font-black text-purple-300 text-xs sm:text-sm mt-0.5">
                🕵️ {me.covertOrdersUsedThisRound} / {maxCovOps}
              </div>
            </div>
          </div>

          {/* Space Command Satellite Bar (Idea #5 — 1-Click Effortless Control!) */}
          <div className="glass-card border-sky-500/35 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div>
              <div className="font-black text-sky-300 flex items-center gap-1.5">
                <Orbit className="w-4 h-4" />
                🛰️ فرماندهی فضایی کشور: {me.orbitalSatellites || 0} از ۳ ماهواره فعال در مدار زمین
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                هر ماهواره فعال: +۶٪ دقت حملات، +۱۰ رهگیری پدافند و +$10B درآمد ماهانه (نیازمند هوافضا سطح ۲)
              </p>
            </div>
            <button
              type="button"
              disabled={(me.orbitalSatellites || 0) >= 3 || me.upgrades.AEROSPACE < 2}
              onClick={() => {
                sound.playLevelUp();
                onLaunchSatellite();
              }}
              className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-black shrink-0 disabled:opacity-40"
            >
              {(me.orbitalSatellites || 0) >= 3
                ? 'مدار تکمیل (۳/۳) ✓'
                : me.upgrades.AEROSPACE < 2
                ? 'نیازمند هوافضا Lv.2'
                : `پرتاب ماهواره ($${satCostB}B)`}
            </button>
          </div>

          {/* Personal Secret Missions Card (Idea #3 — Auto-rewarded, zero clutter!) */}
          {me.secretMissions && me.secretMissions.length > 0 && (
            <div className="glass-card border-indigo-500/30 rounded-2xl p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black text-indigo-300 flex items-center gap-1.5">
                  <Target className="w-4 h-4" />
                  ماموریت‌های مخفی شخصی شما (جایزه خودکار و امتیاز پیروزی)
                </span>
                {me.secretAllies && me.secretAllies.length > 0 && (
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                    🕵️ {me.secretAllies.length} متحد مخفی
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {me.secretMissions.map((m) => {
                  const pct = Math.min(100, Math.round((m.currentValue / Math.max(1, m.targetValue)) * 100));
                  return (
                    <div
                      key={m.id}
                      className={`p-2.5 rounded-xl border space-y-1 ${
                        m.completed
                          ? 'bg-emerald-500/15 border-emerald-400/50'
                          : 'bg-[#060c18] border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-white text-[11px]">{m.titleFa}</span>
                        {m.completed ? (
                          <span className="text-[10px] font-black text-emerald-300 shrink-0">✓ انجام شد!</span>
                        ) : (
                          <span className="text-[10px] font-mono text-amber-300 shrink-0">
                            +${m.rewardCashB}B
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-snug">{m.descFa}</p>
                      <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all ${m.completed ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Emergency Reconstruction */}
          {(me.devastation > 0 || me.powerGrid < 95 || me.radarIntegrity < 95 || me.approval < 80) && (
            <div className="glass-card border-cyan-500/35 rounded-2xl p-3.5 space-y-2.5">
              <h3 className="text-xs sm:text-sm font-black text-cyan-300 flex items-center gap-1.5">
                <Wrench className="w-4 h-4" />
                ستاد بازسازی اضطراری و مهار بحران (بدون مصرف سهمیه ساخت)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    sound.playLevelUp();
                    onEmergencyAction('REPAIR_GRID');
                  }}
                  className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-200 font-bold text-right"
                >
                  <div>⚡ ترمیم فوری برق</div>
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
                  <div>📡 بازسازی رادار و امنیت</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">+۴۵٪ رادار و ضدجاسوسی (${radarEmergencyCost}B)</div>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playLevelUp();
                    onEmergencyAction('NATIONAL_RELIEF');
                  }}
                  className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-right"
                >
                  <div>🏥 بسته امداد ملی</div>
                  <div className="text-[10px] text-slate-300 mt-0.5">+۱۴٪ رضایت، آب/غذا و -۲۰٪ ویرانی (${reliefEmergencyCost}B)</div>
                </button>
              </div>
            </div>
          )}

          {/* 1-Click Global Spot Market (Oil, Gas, Food & Water — Items #23 & #24!) */}
          <div className="glass-card border-amber-500/35 rounded-2xl p-3.5 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-xs sm:text-sm font-black text-amber-300">
                🛢️ بورس جهانی سوخت، گاز، غذا و آب (معامله آنی ۱-کلیکی)
              </h3>
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onToggleAutoSell();
                }}
                className={`px-2.5 py-1 rounded-xl text-[11px] font-black border transition ${
                  me.autoSellSurplus
                    ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {me.autoSellSurplus ? '✓ فروش خودکار مازاد: روشن' : 'فروش خودکار مازاد: خاموش'}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'SELL');
                }}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                🛢️ فروش ۵۰ نفت
                <span className="block font-mono text-emerald-300 mt-0.5">+${oilSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('OIL', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#060c18] hover:bg-slate-800 border border-slate-700 text-amber-200 font-bold text-center"
              >
                🛒 خرید ۵۰ نفت
                <span className="block font-mono text-slate-300 mt-0.5">-${spot.oilBuy50B}B</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('GAS', 'SELL');
                }}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                🔥 فروش ۵۰ گاز
                <span className="block font-mono text-emerald-300 mt-0.5">+${gasSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('GAS', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#060c18] hover:bg-slate-800 border border-slate-700 text-cyan-200 font-bold text-center"
              >
                🛒 خرید ۵۰ گاز
                <span className="block font-mono text-slate-300 mt-0.5">-${spot.gasBuy50B}B</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('FOOD', 'SELL');
                }}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                🌾 فروش ۵۰ غذا
                <span className="block font-mono text-emerald-300 mt-0.5">+${foodSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('FOOD', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#060c18] hover:bg-slate-800 border border-slate-700 text-lime-200 font-bold text-center"
              >
                🛒 خرید ۵۰ غذا
                <span className="block font-mono text-slate-300 mt-0.5">-${spot.foodBuy50B}B</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('WATER', 'SELL');
                }}
                className="p-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-center"
              >
                💧 فروش ۵۰ آب
                <span className="block font-mono text-emerald-300 mt-0.5">+${waterSellCashB}B</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  onSpotTrade('WATER', 'BUY');
                }}
                className="p-2 rounded-xl bg-[#060c18] hover:bg-slate-800 border border-slate-700 text-sky-200 font-bold text-center"
              >
                🛒 تامین ۵۰ آب
                <span className="block font-mono text-slate-300 mt-0.5">-${spot.waterBuy50B}B</span>
              </button>
            </div>
          </div>

          {/* Smart Cabinet Suggestions */}
          {suggestions.length > 0 && (
            <div className="glass-card border-emerald-500/30 rounded-2xl p-3.5 space-y-2">
              <h3 className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4" />
                پیشنهادهای هوشمند مشاوران کابینه
              </h3>
              <div className="grid grid-cols-1 gap-2">
                {suggestions.map((s) => (
                  <div
                    key={s.id}
                    className="p-3 rounded-xl bg-[#060c18] border border-slate-800 flex items-center justify-between gap-3"
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
          <div className="glass-card rounded-2xl p-3.5 space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-1">
              <h3 className="text-xs sm:text-sm font-black text-white">
                🎯 فرامین عملیاتی این ماه ({me.orders.length} عملیات فعال)
              </h3>
              <span className="text-xs text-emerald-400 font-mono">
                تراز ماه بعد: {econ.netIncomeB >= 0 ? `+$${econ.netIncomeB}B` : `-$${Math.abs(econ.netIncomeB)}B`}
                {econ.overextensionPenaltyB > 0 ? ` (هزینه نگهداری امپراتوری: -$${econ.overextensionPenaltyB}B)` : ''}
              </span>
            </div>

            {me.orders.length === 0 ? (
              <div className="py-3 px-3 text-center text-xs text-slate-400 bg-[#060c18] rounded-xl border border-slate-800/80">
                روی هر کشوری در نقشه کلیک کنید تا عملیات نظامی، دیپلماسی (صلح/اولتیماتوم/بذر نفرت) یا جاسوسی اجرا شود!
              </div>
            ) : (
              <div className="space-y-2">
                {me.orders.map((ord) => (
                  <div
                    key={ord.id}
                    className="px-3 py-2.5 rounded-xl bg-[#060c18] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <div className="font-bold text-white">
                        {ord.summaryFa}{' '}
                        <span className="text-emerald-300 font-mono">({ord.estimatedSuccessPct}٪ شانس)</span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {ord.expectedImpactFa} {ord.fuelCost > 0 ? `• سوخت مصرفی: ${ord.fuelCost}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playClick();
                        onCancelOrder(ord.id);
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-bold flex items-center gap-1 shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      لغو و بازگشت وجه
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Domain Military Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">✈️ هوایی ({mil.fighterCount} واحد)</div>
              <div className="text-sm font-black text-sky-300 font-mono">{mil.airPower}</div>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">⚓ دریایی ({mil.navalCount} واحد)</div>
              <div className="text-sm font-black text-cyan-300 font-mono">{mil.navalPower}</div>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">🚜 زرهی ({mil.armorCount} واحد)</div>
              <div className="text-sm font-black text-amber-300 font-mono">{mil.groundPower}</div>
            </div>
            <div className="glass-card rounded-xl p-2.5">
              <div className="text-slate-400 text-[10px]">🛡️ رهگیری پدافند</div>
              <div className="text-sm font-black text-emerald-300 font-mono">{mil.interceptRate}٪</div>
            </div>
          </div>
        </div>
      )}

      {/* 8 NATIONAL DOCTRINE PILLARS (UPGRADABLE MONTHLY LIMIT VIA SCIENCE ACADEMY — ITEM #16!) */}
      {subTab === 'UPGRADES' && (
        <div className="space-y-3">
          <div className="p-3 rounded-2xl bg-purple-500/10 border border-purple-500/30 space-y-1 text-xs text-purple-200">
            <div className="flex items-center justify-between font-bold">
              <span>⭐ ۸ دکترین راهبردی ملی (Lv.1 تا Lv.10)</span>
              <span className="font-mono text-white">
                ظرفیت باقی‌مانده این ماه: {maxUps - me.upgradesUsedThisRound} از {maxUps}
              </span>
            </div>
            <p className="text-[11px] text-purple-300/90">
              💡 با ساخت و ارتقای «🔬 قطب علم و دانشگاه ملی» در تب ساخت‌وساز به سطح ۵ و ۱۱، ظرفیت پژوهش ماهانه به <strong>۲ و ۳ جهش در هر ماه</strong> افزایش می‌یابد!
            </p>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {(Object.keys(UPGRADE_TRACKS) as UpgradeTrack[]).map((track) => {
              const spec = UPGRADE_TRACKS[track];
              const lv = me.upgrades[track] || 0;
              const maxed = lv >= spec.maxLevel;
              const cost = getUpgradeNextCost(me, track, room.settings.difficulty);
              const usedSlot = me.upgradesUsedThisRound >= maxUps;

              return (
                <div
                  key={track}
                  className="p-3.5 rounded-2xl glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                      ? `تکمیل سهمیه ماه ($${cost}B)`
                      : `ارتقا به سطح ${lv + 1} ($${cost}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INFRASTRUCTURES, SCIENCE ACADEMY, RECONSTRUCTION & CHOKEPOINTS */}
      {subTab === 'INFRA' && (
        <div className="space-y-3.5">
          <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between text-xs text-cyan-200">
            <span>🏗️ ظرفیت عمرانی و ساخت‌وساز این ماه</span>
            <span className="font-mono font-black text-white">
              باقی‌مانده: {maxBuilds - me.buildsUsedThisRound} / {maxBuilds}
            </span>
          </div>

          {myChokepoint && (
            <div className="glass-card border-amber-500/40 rounded-2xl p-3.5 space-y-2.5">
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
                          : 'bg-[#060c18] text-slate-300 border-slate-700'
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
              const level = me.infrastructure[type] || 0;
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
                      : type === 'SCIENCE_ACADEMY'
                      ? 'glass-card border-purple-500/40'
                      : 'glass-card'
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
                        : type === 'SCIENCE_ACADEMY'
                        ? 'bg-purple-400 hover:bg-purple-300 text-slate-950'
                        : 'bg-cyan-500 hover:bg-cyan-400 text-slate-950'
                    }`}
                  >
                    {noSlotLeft
                      ? 'تکمیل ظرفیت این ماه'
                      : costInfo.isRebuild
                      ? `🔧 بازسازی ویرانه جنگی ($${costInfo.costB}B)`
                      : level >= spec.maxLevel
                      ? `در سقف ظرفیت (${spec.maxLevel}/${spec.maxLevel})`
                      : `احداث سطح جدید ($${costInfo.costB}B)`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* DISTINCT WEAPONS + BUY & SELL SURPLUS ARMS (ITEM #22!) */}
      {subTab === 'WEAPONS' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['ALL', 'همه'],
                ['OWNED', '🎖️ موجودی ارتش من'],
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
                onClick={() => {
                  sound.playClick();
                  setWeaponFilter(cat as 'ALL' | 'OWNED' | WeaponCategory);
                }}
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
                  className="p-3.5 rounded-2xl glass-card flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-sm text-white">{w.nameFa}</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/35 text-indigo-200 text-[10px] font-bold">
                        {w.roleTagFa}
                      </span>
                      {owned > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 font-mono text-xs font-bold">
                          موجودی: ×{owned}
                        </span>
                      )}
                      {access.isAllyLicensed && (
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 text-[10px] font-bold">
                          لیسانس متحد
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400">{w.shortDescFa}</p>
                    <div className="text-[11px] font-mono text-slate-300 flex flex-wrap gap-x-2">
                      <span>سازنده: {origin.nameFa}</span>
                      <span>• حمله {w.attackPower}</span>
                      <span>• دفاع {w.defensePower}</span>
                      {w.interceptBonus > 0 && <span>• رهگیری +{w.interceptBonus}٪</span>}
                      {w.stealth >= 70 && <span className="text-sky-300">• رادارگریزی {w.stealth}٪</span>}
                      <span className="text-amber-300/90">• مصرف سوخت: {w.oilUsePerRound}</span>
                    </div>
                    {access.canBuildDirectly && access.lockedReasonFa && (
                      <div className="text-[11px] text-amber-300 flex items-center gap-1 font-bold">
                        <Lock className="w-3 h-3" /> {access.lockedReasonFa}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap sm:flex-col gap-1.5 shrink-0">
                    {access.canBuildDirectly ? (
                      <button
                        type="button"
                        disabled={Boolean(access.lockedReasonFa)}
                        onClick={() => {
                          sound.playLevelUp();
                          onInstantWeapon(w.id, 1);
                        }}
                        className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        <Factory className="w-3.5 h-3.5" />
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
                        className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-bold text-xs flex items-center justify-center gap-1.5"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        خرید از {origin.nameFa} (${access.finalCostB}B)
                      </button>
                    )}

                    {owned > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          sound.playOrderConfirm();
                          onSellWeapon(w.id, 1);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500/20 border border-slate-700 hover:border-emerald-400/50 text-emerald-300 font-bold text-[11px] flex items-center justify-center gap-1"
                      >
                        <DollarSign className="w-3 h-3" />
                        فروش ۱ واحد (+${access.sellRefundB}B)
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
