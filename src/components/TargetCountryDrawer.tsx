import React, { useState } from 'react';
import {
  X,
  Handshake,
  Plane,
  Crosshair,
  Cpu,
  Eye,
  MessageSquare,
  Ban,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  CountryId,
  CyberAttackType,
  EspionageOpType,
  FlightMissionType,
  GameOrder,
  GameRoomState,
  StrikeSubType,
  StrikeTargetSector,
  TradeResourceKind,
  UNResolution,
} from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

export type DrawerTab = 'DIPLOMACY' | 'FLIGHTS' | 'STRIKE' | 'CYBER' | 'ESPIONAGE';

interface TargetCountryDrawerProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  targetId: CountryId;
  initialTab?: DrawerTab;
  onClose: () => void;
  onQueueOrder: (draft: Partial<GameOrder>) => void;
  onProposeTrade: (payload: {
    to: CountryId;
    offerType: TradeResourceKind;
    amount: number;
    weaponId?: string;
    priceB: number;
    direction: 'SELL' | 'BUY' | 'PACT';
    noteFa?: string;
  }) => void;
  onToggleSanction: (targetId: CountryId) => void;
  onToggleAirspace: (targetId: CountryId, mode: 'OPEN' | 'CLOSED') => void;
  onProposeResolution: (target: CountryId, kind: UNResolution['kind']) => void;
  onOpenDirectChat: (targetId: CountryId) => void;
}

export const TargetCountryDrawer: React.FC<TargetCountryDrawerProps> = ({
  room,
  myCountryId,
  targetId,
  initialTab = 'DIPLOMACY',
  onClose,
  onQueueOrder,
  onProposeTrade,
  onToggleSanction,
  onToggleAirspace,
  onProposeResolution,
  onOpenDirectChat,
}) => {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [targetSector, setTargetSector] = useState<StrikeTargetSector>('MILITARY_BASES');
  const [tradeResource, setTradeResource] = useState<'OIL' | 'GAS' | 'FOOD' | 'URANIUM'>('OIL');
  const [tradeDir, setTradeDir] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeAmount, setTradeAmount] = useState<number>(50);
  const [tradePriceB, setTradePriceB] = useState<number>(24);

  const target = room.countries[targetId];
  const me = myCountryId ? room.countries[myCountryId] : null;
  if (!target) return null;

  const isAlly = Boolean(me?.allies.includes(target.id));
  const iSanctionThem = Boolean(me && target.sanctionedBy.includes(me.id));
  const airspaceClosedByMe = Boolean(me?.airspaceClosedTo.includes(target.id));
  const intelSnapshot = me?.knownIntel[target.id];

  // Indigenous weapons produced by this target country that I can order!
  const targetIndigenousWeapons = Object.values(WEAPONS_CATALOG).filter(
    (w) => w.originCountry === target.id
  );

  const fireOrder = (draft: Partial<GameOrder>) => {
    sound.playOrderConfirm();
    onQueueOrder({ ...draft, targetCountry: target.id });
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[90vh] bg-[#0a1222] border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#070d19] border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CountryFlag countryId={target.id} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">{target.nameFa}</h2>
                {target.playerName ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                    بازیکن: {target.playerName}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold">
                    🤖 هوش مصنوعی استراتژیک
                  </span>
                )}
                {isAlly && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                    🤝 متحد رسمی
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                پایتخت: {target.capitalFa} • سرویس اطلاعاتی: {target.agencyNameFa} ({target.agencyCode})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {me && (
              <button
                type="button"
                onClick={() => {
                  onOpenDirectChat(target.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                چت محرمانه
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Public & Classified Intel Snapshot Bar */}
        <div className="px-4 py-3 bg-[#080f1d] border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <div className="bg-[#0d172a] rounded-xl p-2 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">رضایت مردم</span>
            <span className="font-bold text-white">{target.approval}٪</span>
          </div>
          <div className="bg-[#0d172a] rounded-xl p-2 border border-slate-800">
            <span className="text-slate-400 block text-[10px]">شبکه برق</span>
            <span className="font-bold text-amber-300">{target.powerGrid}٪</span>
          </div>
          <div className="bg-[#0d172a] rounded-xl p-2 border border-slate-800 col-span-2">
            {intelSnapshot || isAlly ? (
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-emerald-400 block text-[10px] font-bold">🔓 اشراف اطلاعاتی فعال</span>
                  <span className="text-slate-200 font-mono text-[11px]">
                    خزانه: ${intelSnapshot?.treasuryB ?? target.treasuryB}B | نفت:{' '}
                    {intelSnapshot?.oilReserve ?? target.oilReserve} | کلاهک:{' '}
                    {intelSnapshot?.warheads ?? target.warheads}
                  </span>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-400 text-[11px]">🔒 آمار دقیق ارتش و ذخایر محرمانه است</span>
                {me && (
                  <button
                    type="button"
                    onClick={() => fireOrder({ kind: 'ESPIONAGE_OP', espionageType: 'DEEP_RECON' })}
                    className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-300 font-bold text-[10px] shrink-0 hover:bg-amber-500/30"
                  >
                    اعزام جاسوس ($10B)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* 5 Clean Action Tabs */}
        {me && (
          <div className="grid grid-cols-5 border-b border-slate-800 bg-[#070d19] text-[11px] sm:text-xs font-bold">
            {[
              { id: 'DIPLOMACY', label: 'دیپلماسی', icon: Handshake, color: 'text-emerald-400 border-emerald-400' },
              { id: 'FLIGHTS', label: 'پروازها', icon: Plane, color: 'text-cyan-400 border-cyan-400' },
              { id: 'STRIKE', label: 'حمله نظامی', icon: Crosshair, color: 'text-rose-400 border-rose-400' },
              { id: 'CYBER', label: 'ویروس', icon: Cpu, color: 'text-purple-400 border-purple-400' },
              { id: 'ESPIONAGE', label: 'جاسوسی/ترور', icon: Eye, color: 'text-amber-400 border-amber-400' },
            ].map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id as DrawerTab)}
                  className={`py-3 flex flex-col sm:flex-row items-center justify-center gap-1 transition ${
                    active ? `${item.color} border-b-2 bg-slate-900/80` : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Tab Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {!me ? (
            <div className="text-sm text-slate-300">در حال مشاهده به عنوان راوی / ناظر</div>
          ) : tab === 'DIPLOMACY' ? (
            <div className="space-y-4">
              {/* Quick Resource Trade Builder */}
              <div className="bg-[#0d172a] border border-slate-800 rounded-2xl p-3.5 space-y-3">
                <div className="font-bold text-sm text-white">🛢️ قرارداد سریع خرید یا فروش منابع استراتژیک</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <select
                    value={tradeDir}
                    onChange={(e) => setTradeDir(e.target.value as 'BUY' | 'SELL')}
                    className="px-2.5 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-white"
                  >
                    <option value="BUY">خرید از {target.nameFa}</option>
                    <option value="SELL">فروش به {target.nameFa}</option>
                  </select>
                  <select
                    value={tradeResource}
                    onChange={(e) => setTradeResource(e.target.value as 'OIL' | 'GAS' | 'FOOD' | 'URANIUM')}
                    className="px-2.5 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-white"
                  >
                    <option value="OIL">نفت خام</option>
                    <option value="GAS">گاز طبیعی</option>
                    <option value="FOOD">غلات و غذا</option>
                    <option value="URANIUM">اورانیوم</option>
                  </select>
                  <div>
                    <input
                      type="number"
                      min={10}
                      max={300}
                      step={10}
                      value={tradeAmount}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTradeAmount(val);
                        setTradePriceB(Math.max(5, Math.round(val * 0.45)));
                      }}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-white font-mono"
                      placeholder="مقدار"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      min={5}
                      max={500}
                      value={tradePriceB}
                      onChange={(e) => setTradePriceB(Number(e.target.value))}
                      className="w-full px-2.5 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-emerald-300 font-mono"
                      placeholder="مبلغ ($B)"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onProposeTrade({
                      to: target.id,
                      offerType: tradeResource,
                      amount: tradeAmount,
                      priceB: tradePriceB,
                      direction: tradeDir,
                    })
                  }
                  className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm transition"
                >
                  ارسال قرارداد رسمی ({tradeAmount} واحد در قبال ${tradePriceB}B)
                </button>
              </div>

              {/* Buy Indigenous Weapons from this Country! */}
              {targetIndigenousWeapons.length > 0 && (
                <div className="bg-[#0d172a] border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  <div className="font-bold text-sm text-amber-300">
                    🎖️ سفارش خرید تسلیحات ساخت {target.nameFa}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetIndigenousWeapons.map((w) => {
                      const exportPrice = Math.round(w.unitCostB * (isAlly ? 1.0 : 1.15));
                      return (
                        <div
                          key={w.id}
                          className="p-2.5 rounded-xl bg-[#070d18] border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{w.nameFa}</div>
                            <div className="text-[10px] text-slate-400">{w.batchLabelFa}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              onProposeTrade({
                                to: target.id,
                                offerType: 'WEAPON',
                                weaponId: w.id,
                                amount: 1,
                                priceB: exportPrice,
                                direction: 'BUY',
                              })
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold text-xs shrink-0"
                          >
                            خرید (${exportPrice}B)
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Diplomatic Pacts, Sanctions & UN */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {!isAlly && (
                  <button
                    type="button"
                    onClick={() =>
                      onProposeTrade({
                        to: target.id,
                        offerType: 'ALLIANCE',
                        amount: 1,
                        priceB: 25,
                        direction: 'PACT',
                      })
                    }
                    className="p-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    پیشنهاد پیمان دفاعی ($25B)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => onToggleSanction(target.id)}
                  className={`p-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                    iSanctionThem
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  {iSanctionThem ? 'لغو تحریم اقتصادی من' : 'تحریم اقتصادی این کشور'}
                </button>

                <button
                  type="button"
                  onClick={() => onProposeResolution(target.id, 'GLOBAL_SANCTION')}
                  className="p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 font-bold col-span-2 flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" />
                  ارائه قطعنامه تحریم بین‌المللی در شورای امنیت سازمان ملل
                </button>
              </div>
            </div>
          ) : tab === 'FLIGHTS' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-[#0d172a] border border-slate-800 text-xs">
                <span className="text-slate-300">
                  وضعیت حریم هوایی شما به روی هواپیماهای {target.nameFa}:
                </span>
                <button
                  type="button"
                  onClick={() => onToggleAirspace(target.id, airspaceClosedByMe ? 'OPEN' : 'CLOSED')}
                  className={`px-3 py-1.5 rounded-lg font-bold ${
                    airspaceClosedByMe
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  }`}
                >
                  {airspaceClosedByMe ? '⛔ حریم هوایی بسته (کلیک برای باز کردن)' : '✈️ حریم هوایی باز (کلیک برای بستن)'}
                </button>
              </div>

              {(
                [
                  {
                    type: 'RECON_FLIGHT' as FlightMissionType,
                    title: '✈️ پرواز شناسایی و عکس‌برداری راداری',
                    desc: 'عبور پهپاد یا هواپیمای شناسایی بر فراز مرزها و کشف کامل آمار تسلیحات، ذخایر و کلاهک‌های هدف.',
                    cost: '$9B',
                  },
                  {
                    type: 'AIRSTRIKE' as FlightMissionType,
                    title: '💥 عملیات بمباران هوایی اسکادران جنگنده/بمب‌افکن',
                    desc: 'اعزام مستقیم جنگنده‌ها و بمب‌افکن‌های شما برای انهدام زیرساخت‌های کشور هدف (استفاده از توان رادارگریزی).',
                    cost: '$15B',
                  },
                  {
                    type: 'AIRLIFT' as FlightMissionType,
                    title: '📦 پل هوایی ترابری و پشتیبانی اضطراری (مخصوص متحدین)',
                    desc: 'ارسال فوری سوخت، قطعات راداری و تقویت فرماندهی پدافند کشور مقصد.',
                    cost: '$16B',
                  },
                ] as const
              ).map((fl) => (
                <div
                  key={fl.type}
                  className="p-3.5 rounded-2xl bg-[#0d172a] border border-slate-800 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{fl.title}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{fl.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      fireOrder({
                        kind: 'FLIGHT_MISSION',
                        flightType: fl.type,
                        targetSector,
                      })
                    }
                    className="px-3.5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shrink-0"
                  >
                    ثبت پرواز ({fl.cost})
                  </button>
                </div>
              ))}
            </div>
          ) : tab === 'STRIKE' ? (
            <div className="space-y-3.5">
              {/* Sector Picker */}
              <div className="p-3 rounded-2xl bg-[#0d172a] border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  🎯 بخش هدف را روی خاک {target.nameFa} انتخاب کنید:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                  {(
                    [
                      ['MILITARY_BASES', '🎖️ پایگاه ارتش'],
                      ['REFINERY', '🛢️ پالایشگاه نفت'],
                      ['POWER_PLANT', '⚡ نیروگاه برق'],
                      ['RADAR_NETWORK', '📡 سایت رادار'],
                      ['NUCLEAR_FACILITY', '☢️ سایت هسته‌ای'],
                    ] as const
                  ).map(([sec, lbl]) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setTargetSector(sec)}
                      className={`py-2 px-2 rounded-xl border font-bold transition ${
                        targetSector === sec
                          ? 'bg-rose-500/25 border-rose-400 text-white'
                          : 'bg-[#070d18] border-slate-800 text-slate-400'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {(
                [
                  {
                    type: 'DRONE_SWARM' as StrikeSubType,
                    title: '🛸 موج انبوه پهپادهای انتحاری',
                    desc: 'ارزان و پرتعداد؛ خشاب پدافند دشمن را برای حملات موشکی بعدی اشباع و خالی می‌کند!',
                    cost: '$10B',
                    danger: false,
                  },
                  {
                    type: 'CRUISE_MISSILE' as StrikeSubType,
                    title: '🚀 شلیک موشک‌های کروز نقطه‌زن',
                    desc: 'پرواز در ارتفاع پست با دقت بالا علیه نیروگاه‌ها، پالایشگاه‌ها و سایت‌های رادار.',
                    cost: '$16B',
                    danger: false,
                  },
                  {
                    type: 'BALLISTIC_MISSILE' as StrikeSubType,
                    title: '☄️ حمله موشکی بالستیک و هایپرسونیک',
                    desc: 'ضربه سنگین و پرسرعت با قدرت تخریب بالا علیه اهداف استراتژیک.',
                    cost: '$22B',
                    danger: false,
                  },
                  {
                    type: 'NAVAL_STRIKE' as StrikeSubType,
                    title: '⚓ عملیات ناوگان دریایی و زیردریایی',
                    desc: 'حمله از دریا و محاصره پایانه‌های صادراتی کشور هدف.',
                    cost: '$18B',
                    danger: false,
                  },
                  {
                    type: 'GROUND_OFFENSIVE' as StrikeSubType,
                    title: '🛡️ تهاجم زمینی و زرهی سنگین',
                    desc: 'ورود لشکرهای زرهی و درگیری مستقیم با ارتش دشمن.',
                    cost: '$26B',
                    danger: false,
                  },
                  {
                    type: 'NUCLEAR_STRIKE' as StrikeSubType,
                    title: `☢️ فرمان ضربه هسته‌ای استراتژیک (موجودی شما: ${me.warheads} کلاهک)`,
                    desc: 'آخرین گزینه بازدارندگی؛ ویرانی شدید اقتصاد و زیرساخت هدف، اما اعلام وضعیت DEFCON 1 و تحریم جهانی!',
                    cost: '$35B',
                    danger: true,
                  },
                ] as const
              ).map((st) => (
                <div
                  key={st.type}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
                    st.danger
                      ? 'bg-rose-950/35 border-rose-500/50'
                      : 'bg-[#0d172a] border-slate-800'
                  }`}
                >
                  <div>
                    <div className="font-bold text-sm text-white">{st.title}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{st.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      fireOrder({
                        kind: 'MILITARY_STRIKE',
                        strikeType: st.type,
                        targetSector,
                      })
                    }
                    className={`px-3.5 py-2.5 rounded-xl font-black text-xs shrink-0 ${
                      st.danger
                        ? 'bg-rose-600 hover:bg-rose-500 text-white'
                        : 'bg-rose-500 hover:bg-rose-400 text-slate-950'
                    }`}
                  >
                    شلیک ({st.cost})
                  </button>
                </div>
              ))}
            </div>
          ) : tab === 'CYBER' ? (
            <div className="space-y-3">
              {(
                [
                  {
                    type: 'RADAR_BLIND' as CyberAttackType,
                    title: '📡 ویروس جنگ الکترونیک و کور کردن رادار',
                    desc: 'فوق‌هوشمندانه: شبکه هشدار سریع هدف را از کار می‌اندازد تا آژیر ۳۰ ثانیه‌ای رادار برایش روشن نشود!',
                    cost: '$14B',
                  },
                  {
                    type: 'STUXNET_SABOTAGE' as CyberAttackType,
                    title: '🦠 ارسال ویروس صنعتی (مدل استاکس‌نت)',
                    desc: 'تخریب خاموش سانتریفیوژهای هسته‌ای و کنترلرهای پالایشگاهی دشمن از درون.',
                    cost: '$18B',
                  },
                  {
                    type: 'GRID_BLACKOUT' as CyberAttackType,
                    title: '⚡ بدافزار Blackout (قطع سراسری برق شهرها)',
                    desc: 'فلج کردن شبکه توزیع برق شهرهای دشمن و کاهش شدید رضایت مردم.',
                    cost: '$15B',
                  },
                  {
                    type: 'CENTRAL_BANK_HACK' as CyberAttackType,
                    title: '🏦 نفوذ سایبری به بانک مرکزی و سرقت ارز',
                    desc: 'ایجاد اختلال مالی و انتقال بخشی از ذخایر ارزی هدف به خزانه عملیاتی شما.',
                    cost: '$16B',
                  },
                ] as const
              ).map((cy) => (
                <div
                  key={cy.type}
                  className="p-3.5 rounded-2xl bg-[#0d172a] border border-purple-500/25 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{cy.title}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{cy.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fireOrder({ kind: 'CYBER_ATTACK', cyberType: cy.type })}
                    className="px-3.5 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs shrink-0"
                  >
                    ارسال ویروس ({cy.cost})
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {(
                [
                  {
                    type: 'DEEP_RECON' as EspionageOpType,
                    title: '👁️ نفوذ اطلاعاتی و سرقت پرونده سرّی ارتش',
                    desc: `ماموران ${me.agencyCode} موجودی دقیق خزانه، کلاهک‌ها و لیست کامل تسلیحات هدف را کشف می‌کنند.`,
                    cost: '$10B',
                  },
                  {
                    type: 'ASSASSINATE_SCIENTIST' as EspionageOpType,
                    title: '🎯 عملیات ترور دانشمند ارشد هسته‌ای/تسلیحاتی',
                    desc: 'ضربه سنگین به برنامه هسته‌ای و تحقیقاتی هدف (-۱۸٪ پیشرفت)؛ در صورت دستگیری تیم، رسوایی خبری دارد!',
                    cost: '$22B',
                  },
                  {
                    type: 'ASSASSINATE_COMMANDER' as EspionageOpType,
                    title: '🎖️ عملیات ترور فرمانده کلیدی ستاد ارتش',
                    desc: 'فلج کردن زنجیره فرماندهی دشمن و کاهش ۲۲٪ توان رزمی و دفاعی آن کشور.',
                    cost: '$24B',
                  },
                  {
                    type: 'COVERT_SABOTAGE' as EspionageOpType,
                    title: '🔥 خرابکاری مخفی و تحریک آشوب خیابانی',
                    desc: 'انفجار در انبارهای سوخت و کاهش ۱۲٪ رضایت عمومی کشور هدف بدون اعلان جنگ رسمی.',
                    cost: '$16B',
                  },
                ] as const
              ).map((esp) => (
                <div
                  key={esp.type}
                  className="p-3.5 rounded-2xl bg-[#0d172a] border border-amber-500/25 flex items-center justify-between gap-3"
                >
                  <div>
                    <div className="font-bold text-sm text-white">{esp.title}</div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{esp.desc}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => fireOrder({ kind: 'ESPIONAGE_OP', espionageType: esp.type })}
                    className="px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shrink-0"
                  >
                    اجرای عملیات ({esp.cost})
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
