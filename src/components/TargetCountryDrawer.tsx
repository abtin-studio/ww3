import React, { useState } from 'react';
import {
  X,
  Handshake,
  Swords,
  Eye,
  MessageSquare,
  Ban,
  ShieldCheck,
  Scale,
  ShoppingCart,
} from 'lucide-react';
import {
  computeCountryMilitary,
  evaluateCovertOpDetails,
  evaluateMilitaryOpDetails,
} from '../../shared/advisor';
import { WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  CountryId,
  CovertOpType,
  GameRoomState,
  MilitaryOpType,
  ResolutionKind,
  StrikeTargetSector,
  TradeResourceKind,
} from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

export type DrawerTab = 'DIPLOMACY' | 'WAR' | 'COVERT';

interface TargetCountryDrawerProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  targetId: CountryId;
  initialTab?: DrawerTab;
  onClose: () => void;
  onQueueOrder: (draft: {
    kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION';
    targetCountry: CountryId;
    militaryType?: MilitaryOpType;
    targetSector?: StrikeTargetSector;
    covertType?: CovertOpType;
  }) => void;
  onProposeTrade: (payload: {
    to: CountryId;
    offerType: TradeResourceKind;
    amount: number;
    weaponId?: string;
    priceB: number;
    direction: 'SELL' | 'BUY' | 'PACT';
  }) => void;
  onToggleSanction: (targetId: CountryId) => void;
  onProposeResolution: (target: CountryId, kind: ResolutionKind) => void;
  onOpenDirectChat: (targetId: CountryId) => void;
}

export const TargetCountryDrawer: React.FC<TargetCountryDrawerProps> = ({
  room,
  myCountryId,
  targetId,
  initialTab = 'WAR',
  onClose,
  onQueueOrder,
  onProposeTrade,
  onToggleSanction,
  onProposeResolution,
  onOpenDirectChat,
}) => {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [sector, setSector] = useState<StrikeTargetSector>('MILITARY_BASES');
  const [covertFilter, setCovertFilter] = useState<'ALL' | 'SPY' | 'CYBER' | 'ASSASSINATE'>('ALL');

  const target = room.countries[targetId];
  const me = myCountryId ? room.countries[myCountryId] : null;
  if (!target) return null;

  const myMil = me ? computeCountryMilitary(me) : null;
  const targetMil = computeCountryMilitary(target);
  const isAlly = Boolean(me?.allies.includes(target.id));
  const iSanctionThem = Boolean(me && target.sanctionedBy.includes(me.id));
  const intelSnapshot = me?.knownIntel[target.id];

  const targetIndigenousWeapons = Object.values(WEAPONS_CATALOG).filter(
    (w) => w.originCountry === target.id
  );
  const fairOil60Price = Math.round(28 * (room.market.oilPriceUsd / 82));

  const covertCatalog: Array<{
    type: CovertOpType;
    group: 'SPY' | 'CYBER' | 'ASSASSINATE';
    title: string;
    effect: string;
    costB: number;
  }> = [
    {
      type: 'SAT_RECON',
      group: 'SPY',
      title: '📡 ۱. اشراف اطلاعاتی و ماهواره‌ای',
      effect: 'افشای کامل خزانه، کلاهک‌ها و ویرانی + ۱۵٪ افزایش دقت حملات نظامی شما تا ۳ ماه آینده.',
      costB: 9,
    },
    {
      type: 'INSURGENCY_PSYOPS',
      group: 'SPY',
      title: '🔥 ۲. جنگ روانی و تحریک ناآرامی داخلی',
      effect: 'کاهش ۱۴٪ رضایت مردم و افزایش ۱۲٪ شاخص بحران دولت هدف (سوق دادن رژیم دشمن به سقوط!).',
      costB: 16,
    },
    {
      type: 'BLACKOUT_VIRUS',
      group: 'CYBER',
      title: '⚡ ۳. ویروس سایبری Blackout علیه رادار و برق',
      effect: 'رادار هشدار سریع دشمن را کور می‌کند (آژیر دفاعی برایش فعال نمی‌شود!) + قطع ۲۶٪ برق سراسری.',
      costB: 16,
    },
    {
      type: 'TREASURY_HEIST',
      group: 'CYBER',
      title: '🏦 ۴. هک و سرقت سایبری بانک مرکزی',
      effect: 'انتقال مستقیم $22B تا $42B از خزانه ارزی دشمن به خزانه کشور شما.',
      costB: 18,
    },
    {
      type: 'STUXNET_SABOTAGE',
      group: 'CYBER',
      title: '🧬 ۵. بدافزار صنعتی استاکس‌نت ۲',
      effect: 'انفجار سایبری در سانتریفیوژها و کارخانه‌ها: -۲۵٪ برنامه هسته‌ای و تخریب ۱ زیرساخت صنعتی.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_COMMANDER',
      group: 'ASSASSINATE',
      title: '🎖️ ۶. ترور فرمانده ارشد نیروهای مسلح',
      effect: 'فلج کردن اتاق جنگ دشمن: -۲۵٪ توان فرماندهی، رهگیری و دفاع ارتش هدف در این ماه!',
      costB: 24,
    },
    {
      type: 'ASSASSINATE_SCIENTIST',
      group: 'ASSASSINATE',
      title: '🔬 ۷. ترور دانشمندان هسته‌ای و هوافضا',
      effect: 'عقب انداختن ۲۸٪ پروژه کلاهک هسته‌ای و کاهش سطح فناوری نظامی هدف.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_MINISTER',
      group: 'ASSASSINATE',
      title: '🏛️ ۸. ترور مقامات ارشد سیاسی و امنیتی در پایتخت',
      effect: 'شوک سنگین سیاسی به دولت هدف: -۱۶٪ رضایت مردم و +۱۶٪ بحران فروپاشی کابینه!',
      costB: 26,
    },
  ];

  const visibleCovertOps = covertCatalog.filter(
    (c) => covertFilter === 'ALL' || c.group === covertFilter
  );

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-[#0a1222] border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#070d19] border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CountryFlag countryId={target.id} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">{target.nameFa}</h2>
                {target.isEliminated ? (
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-black">
                    🥀 دولت سقوط‌کرده
                  </span>
                ) : target.playerName ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                    👤 بازیکن: {target.playerName}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold">
                    🤖 هوش مصنوعی فعال
                  </span>
                )}
                {isAlly && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                    🤝 متحد رسمی
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {target.capitalFa} • اطلاعات: {target.agencyCode} • خاک: {target.integrityPct}٪ • ویرانی: {target.devastation}٪ • رهگیری: {targetMil.interceptRate}٪
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {me && !target.isEliminated && (
              <button
                type="button"
                onClick={() => {
                  onOpenDirectChat(target.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                چت مستقیم
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

        {/* 3 Action Tabs */}
        {me && !me.isEliminated && !target.isEliminated && (
          <div className="grid grid-cols-3 border-b border-slate-800 bg-[#070d19] text-xs sm:text-sm font-black">
            <button
              type="button"
              onClick={() => setTab('WAR')}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'WAR'
                  ? 'text-rose-400 border-b-2 border-rose-400 bg-rose-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Swords className="w-4 h-4" />
              هوایی، دریایی و زمینی
            </button>
            <button
              type="button"
              onClick={() => setTab('COVERT')}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'COVERT'
                  ? 'text-purple-300 border-b-2 border-purple-400 bg-purple-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              جاسوسی، هک و ترور
            </button>
            <button
              type="button"
              onClick={() => setTab('DIPLOMACY')}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'DIPLOMACY'
                  ? 'text-emerald-300 border-b-2 border-emerald-400 bg-emerald-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Handshake className="w-4 h-4" />
              تجارت، اتحاد و کمیته
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {target.isEliminated ? (
            <div className="p-5 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-center space-y-2">
              <div className="font-black text-rose-300 text-base">این دولت سقوط کرده و از بازی حذف شده است</div>
              <p className="text-xs text-slate-300">{target.eliminatedReasonFa}</p>
            </div>
          ) : !me || !myMil || me.isEliminated ? (
            <div className="text-sm text-slate-300 text-center py-6">نمای نظارتی اتاق جنگ</div>
          ) : tab === 'WAR' ? (
            <div className="space-y-3.5">
              {/* Domain Force Comparison */}
              <div className="p-3.5 rounded-2xl bg-[#0d172a] border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-bold text-emerald-300">
                    شما — ✈️ {myMil.airPower} • ⚓ {myMil.navalPower} • 🚜 {myMil.groundPower}
                  </span>
                  <span className="font-bold text-rose-300">
                    {target.nameFa} — 🛡️ دفاع {targetMil.defenseScore} (رهگیری {targetMil.interceptRate}٪)
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-rose-500/30 overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-400 transition-all"
                    style={{
                      width: `${Math.round(
                        (myMil.attackScore / Math.max(1, myMil.attackScore + targetMil.defenseScore)) * 100
                      )}%`,
                    }}
                  />
                </div>
              </div>

              {/* Target Sector Picker */}
              <div className="p-3 rounded-2xl bg-[#0d172a] border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  🎯 هدف بمباران هوایی / موشکی را انتخاب کنید:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 text-[11px]">
                  {(
                    [
                      ['MILITARY_BASES', '🎖️ پایگاه ارتش'],
                      ['REFINERY', '🛢️ پالایشگاه نفت'],
                      ['POWER_PLANT', '⚡ نیروگاه برق'],
                      ['ARMS_FACTORY', '🏭 کارخانه سلاح'],
                      ['AIR_DEFENSE_NET', '📡 شبکه رادار'],
                    ] as const
                  ).map(([sec, lbl]) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => setSector(sec)}
                      className={`py-2 px-2 rounded-xl border font-bold transition ${
                        sector === sec
                          ? 'bg-rose-500/25 border-rose-400 text-white'
                          : 'bg-[#070d18] border-slate-800 text-slate-400'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5 Domain Military Operations (Air, Missile/Drone, Naval, Land Conquest, Nuclear) */}
              {(
                [
                  {
                    type: 'AIR_SORTIE' as MilitaryOpType,
                    title: `✈️ ۱. عملیات جنگنده‌ها و بمباران هوایی (اسکادران شما: ${myMil.fighterCount})`,
                    effect:
                      'اعزام جنگنده‌ها و بمب‌افکن‌ها برای درگیری هوایی، سرکوب ۳۲٪ پدافند دشمن و بمباران زیرساخت انتخابی.',
                    costB: 18,
                    nuclear: false,
                  },
                  {
                    type: 'MISSILE_DRONE_STRIKE' as MilitaryOpType,
                    title: '🚀 ۲. حمله ترکیبی موشکی و امواج پهپادی',
                    effect: 'اشباع رادار دشمن و تخریب مستقیم ۱ سطح از زیرساخت هدف انتخاب‌شده (قابل بازسازی توسط مدافع).',
                    costB: 20,
                    nuclear: false,
                  },
                  {
                    type: 'NAVAL_BLOCKADE_STRIKE' as MilitaryOpType,
                    title: `⚓ ۳. عملیات دریایی و محاصره بنادر (ناوگان شما: ${myMil.navalCount})`,
                    effect: 'انهدام ناوگان دریایی دشمن، توقیف نفتکش‌ها و کاهش ۳۸٪ درآمد صادرات دریابرد هدف در این ماه.',
                    costB: 22,
                    nuclear: false,
                  },
                  {
                    type: 'GROUND_CONQUEST' as MilitaryOpType,
                    title: `🚜 ۴. تهاجم زمینی و کشورگشایی (باقی‌مانده خاک هدف: ${target.integrityPct}٪)`,
                    effect:
                      'پیشروی لشکرهای زرهی برای تصرف ۲۸٪ تا ۳۸٪ خاک دشمن + غنیمت خزانه و نفت! (رسیدن خاک به ۰٪ = فتح کامل کشور!)',
                    costB: 34,
                    nuclear: false,
                  },
                  {
                    type: 'NUCLEAR_STRIKE' as MilitaryOpType,
                    title: `☢️ ۵. شلیک کلاهک استراتژیک هسته‌ای (موجودی: ${me.warheads})`,
                    effect: 'تخریب ۳ مجتمع زیرساختی و +۴۲٪ بحران ویرانی در هدف، اما وضعیت DEFCON 1 و تحریم جهانی!',
                    costB: 45,
                    nuclear: true,
                  },
                ] as const
              ).map((op) => {
                const details = evaluateMilitaryOpDetails(me, target, op.type, room.round);
                return (
                  <div
                    key={op.type}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      op.nuclear
                        ? 'bg-rose-950/35 border-rose-500/50'
                        : 'bg-[#0d172a] border-slate-800'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs sm:text-sm text-white">{op.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                            details.winPct >= 65
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : details.winPct >= 42
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          شانس موفقیت این دور: {details.winPct}٪
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{op.effect}</p>
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {details.factorsFa.map((f, idx) => (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded bg-[#070d19] border border-slate-800 text-[10px] text-cyan-300"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({
                          kind: 'MILITARY_OPERATION',
                          targetCountry: target.id,
                          militaryType: op.type,
                          targetSector: sector,
                        });
                      }}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs shrink-0 ${
                        op.nuclear
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : 'bg-rose-500 hover:bg-rose-400 text-slate-950'
                      }`}
                    >
                      ثبت حمله (${op.costB}B)
                    </button>
                  </div>
                );
              })}
            </div>
          ) : tab === 'COVERT' ? (
            <div className="space-y-3">
              {/* Intel Status Banner */}
              <div className="p-3 rounded-2xl bg-[#0d172a] border border-slate-800 text-xs">
                {intelSnapshot ? (
                  <span className="text-emerald-300 font-bold">
                    🔓 پرونده سرّی باز است (ماه {intelSnapshot.round}): خزانه ${intelSnapshot.treasuryB}B • کلاهک{' '}
                    {intelSnapshot.warheads} • ویرانی {intelSnapshot.devastation}٪ (+دقت حمله فعال!)
                  </span>
                ) : (
                  <span className="text-slate-300">
                    🕵️ اگر کشور هدف سامانه ردیابی سایبری/ضدجاسوسی قوی نداشته باشد، نام کشور شما در حملات مخفی و ترورها کاملاً ناشناس می‌ماند!
                  </span>
                )}
              </div>

              {/* Sub-filter Pills */}
              <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                {(
                  [
                    ['ALL', 'همه (۸)'],
                    ['SPY', '📡 جاسوسی و شورش'],
                    ['CYBER', '💻 هک و سایبری'],
                    ['ASSASSINATE', '🎯 ترورهای هدفمند'],
                  ] as const
                ).map(([flt, lbl]) => (
                  <button
                    key={flt}
                    type="button"
                    onClick={() => setCovertFilter(flt)}
                    className={`py-2 rounded-xl border ${
                      covertFilter === flt
                        ? 'bg-purple-500 text-slate-950 border-purple-400 font-black'
                        : 'bg-[#070d18] text-slate-300 border-slate-800'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {visibleCovertOps.map((cov) => {
                const details = evaluateCovertOpDetails(me, target, cov.type);
                return (
                  <div
                    key={cov.type}
                    className="p-3.5 rounded-2xl bg-[#0d172a] border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs sm:text-sm text-white">{cov.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                          شانس موفقیت: {details.winPct}٪
                        </span>
                        {cov.type !== 'SAT_RECON' && (
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                              details.tracePct <= 30
                                ? 'bg-emerald-500/15 text-emerald-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            ریسک ردیابی هویت: {details.tracePct}٪
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{cov.effect}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({
                          kind: 'COVERT_OPERATION',
                          targetCountry: target.id,
                          covertType: cov.type,
                        });
                      }}
                      className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs shrink-0"
                    >
                      اجرا (${cov.costB}B)
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {/* 1-Click Fast Oil Deals */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    onProposeTrade({
                      to: target.id,
                      offerType: 'OIL',
                      amount: 60,
                      priceB: fairOil60Price,
                      direction: 'SELL',
                    })
                  }
                  className="p-3.5 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-black text-right"
                >
                  <div>🛢️ فروش فوری ۶۰ نفت به {target.nameFa}</div>
                  <div className="text-[11px] font-normal text-slate-300 mt-0.5">
                    دریافت نقدی +${fairOil60Price}B
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    onProposeTrade({
                      to: target.id,
                      offerType: 'OIL',
                      amount: 60,
                      priceB: fairOil60Price,
                      direction: 'BUY',
                    })
                  }
                  className="p-3.5 rounded-2xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-black text-right"
                >
                  <div>🛒 خرید فوری ۶۰ نفت از {target.nameFa}</div>
                  <div className="text-[11px] font-normal text-slate-300 mt-0.5">
                    پرداخت ${fairOil60Price}B
                  </div>
                </button>
              </div>

              {/* Buy Indigenous Weapons */}
              {targetIndigenousWeapons.length > 0 && (
                <div className="bg-[#0d172a] border border-slate-800 rounded-2xl p-3.5 space-y-2.5">
                  <div className="font-black text-sm text-amber-300 flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4" />
                    خرید مستقیم تسلیحات ساخت {target.nameFa}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetIndigenousWeapons.map((w) => {
                      const exportPrice = Math.round(w.unitCostB * (isAlly ? 1.0 : 1.12));
                      return (
                        <div
                          key={w.id}
                          className="p-2.5 rounded-xl bg-[#070d18] border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{w.nameFa}</div>
                            <div className="text-[10px] text-slate-400">
                              حمله {w.attackPower} • دفاع {w.defensePower}
                            </div>
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
                            className="px-2.5 py-1.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shrink-0"
                          >
                            خرید (${exportPrice}B)
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Bilateral Alliance & Sanctions */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {!isAlly && (
                  <button
                    type="button"
                    onClick={() =>
                      onProposeTrade({
                        to: target.id,
                        offerType: 'ALLIANCE',
                        amount: 1,
                        priceB: 28,
                        direction: 'PACT',
                      })
                    }
                    className="p-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    پیمان دفاعی مشترک ($28B)
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
                  {iSanctionThem ? 'لغو تحریم اقتصادی' : 'تحریم اقتصادی این کشور'}
                </button>
              </div>

              {/* Convene UN / IAEA / Aid Special Committee Votes */}
              <div className="bg-[#0d172a] border border-amber-500/30 rounded-2xl p-3.5 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  تشکیل جلسه و رای‌گیری رسمی در سازمان ملل و کمیته‌های بین‌المللی درباره {target.nameFa}:
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => onProposeResolution(target.id, 'GLOBAL_SANCTION')}
                    className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 font-bold text-right"
                  >
                    ⚖️ قطعنامه تحریم فراگیر شورای امنیت
                  </button>
                  <button
                    type="button"
                    onClick={() => onProposeResolution(target.id, 'IAEA_INSPECTION')}
                    className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-200 font-bold text-right"
                  >
                    ☢️ کمیته بازرسی هسته‌ای آژانس (IAEA)
                  </button>
                  <button
                    type="button"
                    onClick={() => onProposeResolution(target.id, 'EMERGENCY_AID_PACKAGE')}
                    className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 font-bold text-right"
                  >
                    🏥 تصویب بسته کمک بازسازی $45B سازمان ملل
                  </button>
                  <button
                    type="button"
                    onClick={() => onProposeResolution(target.id, 'CEASEFIRE_DEMAND')}
                    className="p-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-200 font-bold text-right"
                  >
                    🕊️ نشست فوری آتش‌بس و کاهش تنش جهانی
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
