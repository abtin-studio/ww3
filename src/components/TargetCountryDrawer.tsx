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
  Flame,
  AlertOctagon,
  HeartHandshake,
  Fuel,
} from 'lucide-react';
import {
  computeCountryMilitary,
  evaluateCovertOpDetails,
  evaluateMilitaryOpDetails,
  getMaxCovertOrdersPerRound,
  getMaxMilitaryOrdersPerRound,
} from '../../shared/advisor';
import { ALL_COUNTRY_IDS, WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  CountryId,
  CovertOpType,
  DiplomaticActionKind,
  GameRoomState,
  MilitaryOpType,
  ResolutionKind,
  StrikeTargetSector,
  TradeResourceKind,
  UltimatumDemand,
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
  onDiplomaticAction: (
    targetCountry: CountryId,
    kind: DiplomaticActionKind,
    opts?: { ultimatum?: UltimatumDemand; thirdCountry?: CountryId }
  ) => void;
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
  onDiplomaticAction,
  onToggleSanction,
  onProposeResolution,
  onOpenDirectChat,
}) => {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [sector, setSector] = useState<StrikeTargetSector>('MILITARY_BASES');
  const [covertFilter, setCovertFilter] = useState<'ALL' | 'SPY' | 'CYBER' | 'ASSASSINATE'>('ALL');
  const [ultimatumDemand, setUltimatumDemand] = useState<UltimatumDemand>('STOP_ATTACKS');
  const [discordThirdId, setDiscordThirdId] = useState<CountryId>(() => {
    const fallback = ALL_COUNTRY_IDS.find((id) => id !== myCountryId && id !== targetId) || 'US';
    return fallback;
  });

  const target = room.countries[targetId];
  const me = myCountryId ? room.countries[myCountryId] : null;
  if (!target) return null;

  const myMil = me ? computeCountryMilitary(me) : null;
  const targetMil = computeCountryMilitary(target);
  const isAlly = Boolean(me?.allies.includes(target.id));
  const isSecretAlly = Boolean(me?.secretAllies?.includes(target.id));
  const iSanctionThem = Boolean(me && target.sanctionedBy.includes(me.id));
  const intelSnapshot = me?.knownIntel[target.id];
  const rel = me ? me.relations[target.id] ?? 0 : 0;
  const truceUntil = me ? me.nonAggressionPacts[target.id] || 0 : 0;
  const hasActiveTruce = truceUntil >= room.round;

  const maxMilOps = me ? getMaxMilitaryOrdersPerRound(me) : 2;
  const maxCovOps = me ? getMaxCovertOrdersPerRound(me) : 2;

  const targetIndigenousWeapons = Object.values(WEAPONS_CATALOG).filter(
    (w) => w.originCountry === target.id
  );
  const myOwnedWeaponsToSell = me
    ? Object.entries(me.weapons)
        .filter(([, cnt]) => cnt > 0)
        .map(([wId, cnt]) => ({ spec: WEAPONS_CATALOG[wId], cnt }))
        .filter((x) => Boolean(x.spec))
    : [];

  const fairOil60Price = Math.round(28 * (room.market.oilPriceUsd / 82));
  const peaceOfferCost = rel >= 0 || target.devastation >= 35 ? 0 : 20;

  const covertCatalog: Array<{
    type: CovertOpType;
    group: 'SPY' | 'CYBER' | 'ASSASSINATE';
    title: string;
    effect: string;
    costB: number;
  }> = [
    {
      type: 'PROXY_INSURGENCY',
      group: 'SPY',
      title: '🎭 ۱. جنگ نیابتی و تسلیح مخفی شورشیان مرزی',
      effect:
        'ارسال سلاح و بودجه به گروه‌های مسلح در مرز هدف: -$18B خسارت، -۱۰٪ رضایت و -۶٪ کنترل مرزی دشمن با کمترین ریسک لو رفتن نام شما!',
      costB: 20,
    },
    {
      type: 'SAT_RECON',
      group: 'SPY',
      title: '📡 ۲. اشراف اطلاعاتی و ماهواره‌ای',
      effect: 'افشای کامل خزانه، کلاهک‌ها، غذا/آب و ویرانی + ۱۴٪ افزایش دقت حملات نظامی شما.',
      costB: 9,
    },
    {
      type: 'INSURGENCY_PSYOPS',
      group: 'SPY',
      title: '🔥 ۳. جنگ روانی و تحریک ناآرامی داخلی',
      effect: 'کاهش ۱۴٪ رضایت مردم و افزایش ۱۱٪ شاخص بحران دولت هدف.',
      costB: 16,
    },
    {
      type: 'BLACKOUT_VIRUS',
      group: 'CYBER',
      title: '⚡ ۳. ویروس سایبری Blackout علیه رادار و برق',
      effect: 'رادار هشدار سریع دشمن را کور می‌کند (آژیر دفاعی فعال نمی‌شود!) + قطع ۲۶٪ برق سراسری.',
      costB: 16,
    },
    {
      type: 'TREASURY_HEIST',
      group: 'CYBER',
      title: '🏦 ۴. هک و سرقت سایبری بانک مرکزی',
      effect: 'انتقال مستقیم $22B تا $40B از خزانه ارزی دشمن به خزانه کشور شما.',
      costB: 18,
    },
    {
      type: 'STUXNET_SABOTAGE',
      group: 'CYBER',
      title: '🧬 ۵. بدافزار صنعتی استاکس‌نت ۲',
      effect: '-۲۵٪ برنامه هسته‌ای هدف و تخریب ۱ سطح کارخانه دفاعی یا راکتور.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_COMMANDER',
      group: 'ASSASSINATE',
      title: '🎖️ ۶. ترور فرمانده ارشد نیروهای مسلح',
      effect: 'فلج کردن اتاق جنگ دشمن: -۲۵٪ توان فرماندهی و رهگیری هدف در این ماه!',
      costB: 24,
    },
    {
      type: 'ASSASSINATE_SCIENTIST',
      group: 'ASSASSINATE',
      title: '🔬 ۷. ترور دانشمندان هسته‌ای و هوافضا',
      effect: 'عقب انداختن ۲۸٪ پروژه کلاهک هسته‌ای و کاهش سطح فناوری هدف.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_MINISTER',
      group: 'ASSASSINATE',
      title: '🏛️ ۸. ترور مقامات ارشد سیاسی در پایتخت',
      effect: 'شوک سنگین به کابینه هدف: -۱۶٪ رضایت مردم و +۱۴٪ بحران دولت!',
      costB: 26,
    },
  ];

  const visibleCovertOps = covertCatalog.filter(
    (c) => covertFilter === 'ALL' || c.group === covertFilter
  );

  const militaryOpsList: Array<{
    type: MilitaryOpType;
    title: string;
    effect: string;
    costB: number;
    nuclear?: boolean;
  }> = [
    ...(me && me.integrityPct < 100
      ? [
          {
            type: 'LIBERATION_COUNTEROFFENSIVE' as MilitaryOpType,
            title: `🛡️ پاتک بزرگ آزادسازی خاک میهن (${100 - me.integrityPct}٪ در اشغال)`,
            effect: 'بازپس‌گیری تا ۲۶٪ از مناطق اشغالی کشور شما و افزایش ۱۰٪ روحیه ملی!',
            costB: 24,
          },
        ]
      : []),
    {
      type: 'AIR_SORTIE',
      title: `✈️ ۱. عملیات جنگنده‌ها و بمباران هوایی (اسکادران شما: ${myMil?.fighterCount || 0})`,
      effect: 'درگیری هوایی (رادارگریزی در برابر پدافند)، سرکوب ۳۲٪ رادار دشمن و بمباران زیرساخت انتخابی.',
      costB: 18,
    },
    {
      type: 'MISSILE_DRONE_STRIKE',
      title: `🚀 ۲. حمله ترکیبی موشکی و امواج پهپادی (موشک/پهپاد شما: ${(myMil?.missileCount || 0) + (myMil?.droneCount || 0)})`,
      effect: 'عبور موشک‌های هایپرسونیک و پهپادها از پدافند و انهدام مستقیم ۱ سطح زیرساخت هدف.',
      costB: 20,
    },
    {
      type: 'NAVAL_BLOCKADE_STRIKE',
      title: `⚓ ۳. عملیات ناوگان دریایی و محاصره بنادر (ناوگان شما: ${myMil?.navalCount || 0})`,
      effect: 'شکار ناوگان دریایی دشمن، توقیف نفتکش‌ها و کاهش ۴۰٪ درآمد دریابرد هدف.',
      costB: 22,
    },
    {
      type: 'GROUND_CONQUEST',
      title: `🚜 ۴. تهاجم زرهی و پیشروی مرزی (خاک باقی‌مانده هدف: ${target.integrityPct}٪)`,
      effect: 'تصرف مرحله‌ای خاک دشمن (حداکثر ۲۴٪ در ماه) + غنیمت خزانه و نفت تا تسخیر کامل کشور در طول چند ماه!',
      costB: 34,
    },
    ...((target.orbitalSatellites || 0) > 0
      ? [
          {
            type: 'ASAT_STRIKE' as MilitaryOpType,
            title: `☄️ ۵. شلیک موشک ضدماهواره ASAT به مدار فضا (ماهواره‌های هدف: ${target.orbitalSatellites})`,
            effect: 'انهدام ماهواره نظامی دشمن در مدار زمین + کور کردن ۳۸٪ شبکه رادار و دقت هدف‌گیری دشمن!',
            costB: 24,
          },
        ]
      : []),
    {
      type: 'NUCLEAR_STRIKE',
      title: `☢️ ۵. شلیک کلاهک استراتژیک هسته‌ای (موجودی: ${me?.warheads || 0})`,
      effect: 'انهدام سنگین زیرساخت‌ها و وضعیت DEFCON 1، همراه با تحریم جهانی مهاجم!',
      costB: 45,
      nuclear: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] glass-panel rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-panel-in">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#060c18]/90 border-b border-slate-800 flex items-start justify-between gap-3">
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
                    🤖 هوش مصنوعی ({target.archetypeTagFa})
                  </span>
                )}
                {isAlly && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[11px] font-bold">
                    🤝 متحد رسمی
                  </span>
                )}
                {hasActiveTruce && (
                  <span className="px-2 py-0.5 rounded-md bg-cyan-500/20 border border-cyan-500/40 text-cyan-200 text-[11px] font-bold">
                    🕊️ آتش‌بس تا ماه {truceUntil}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-2">
                <span>{target.capitalFa}</span>
                <span>• خاک: {target.integrityPct}٪</span>
                <span>• ویرانی: {target.devastation}٪</span>
                {me && (
                  <span
                    className={`font-bold ${
                      rel >= 25 ? 'text-emerald-300' : rel <= -25 ? 'text-rose-400' : 'text-amber-300'
                    }`}
                  >
                    • رابطه سیاسی: {rel > 0 ? `+${rel}` : rel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {me && !target.isEliminated && (
              <button
                type="button"
                onClick={() => {
                  sound.playClick();
                  onOpenDirectChat(target.id);
                  onClose();
                }}
                className="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5"
              >
                <MessageSquare className="w-4 h-4" />
                مذاکره در چت
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
          <div className="grid grid-cols-3 border-b border-slate-800 bg-[#060c18] text-xs sm:text-sm font-black">
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('DIPLOMACY');
              }}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'DIPLOMACY'
                  ? 'text-emerald-300 border-b-2 border-emerald-400 bg-emerald-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Handshake className="w-4 h-4" />
              صلح، تهدید و تجارت
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('WAR');
              }}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'WAR'
                  ? 'text-rose-400 border-b-2 border-rose-400 bg-rose-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Swords className="w-4 h-4" />
              جنگ ({me.militaryOrdersUsedThisRound}/{maxMilOps})
            </button>
            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setTab('COVERT');
              }}
              className={`py-3 flex items-center justify-center gap-1.5 transition ${
                tab === 'COVERT'
                  ? 'text-purple-300 border-b-2 border-purple-400 bg-purple-500/10'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye className="w-4 h-4" />
              هک و ترور ({me.covertOrdersUsedThisRound}/{maxCovOps})
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
              {/* Quota & Truce Status */}
              <div className="p-3 rounded-2xl glass-card flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-slate-200">
                  ⚔️ سهمیه عملیات نظامی این ماه: <span className="text-rose-300 font-mono">{me.militaryOrdersUsedThisRound} از {maxMilOps}</span>
                </span>
                <span className="text-amber-300 font-mono">🛢️ ذخیره سوخت شما: {me.oilReserve} واحد</span>
              </div>

              {hasActiveTruce && (
                <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 text-xs text-cyan-200 font-bold">
                  🕊️ پیمان صلح و آتش‌بس رسمی میان کشور شما و {target.nameFa} تا پایان ماه {truceUntil} برقرار است.
                </div>
              )}

              {/* Target Sector Picker */}
              <div className="p-3 rounded-2xl glass-card space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  🎯 هدف بمباران هوایی / موشکی را مشخص کنید:
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
                      onClick={() => {
                        sound.playClick();
                        setSector(sec);
                      }}
                      className={`py-2 px-2 rounded-xl border font-bold transition ${
                        sector === sec
                          ? 'bg-rose-500/25 border-rose-400 text-white'
                          : 'bg-[#060c18] border-slate-800 text-slate-400'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Domain Military Operations */}
              {militaryOpsList.map((op) => {
                const details = evaluateMilitaryOpDetails(me, target, op.type, room.round, room.minorNations);
                const quotaFull = me.militaryOrdersUsedThisRound >= maxMilOps;
                const blockedByTruce = hasActiveTruce && op.type !== 'LIBERATION_COUNTEROFFENSIVE';
                const disabled = !details.canExecute || quotaFull || blockedByTruce;

                return (
                  <div
                    key={op.type}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      op.nuclear
                        ? 'bg-rose-950/35 border-rose-500/50'
                        : op.type === 'LIBERATION_COUNTEROFFENSIVE'
                        ? 'bg-emerald-950/30 border-emerald-500/50'
                        : 'glass-card'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs sm:text-sm text-white">{op.title}</span>
                        {details.canExecute && (
                          <span
                            className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                              details.winPct >= 65
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : details.winPct >= 42
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-rose-500/20 text-rose-300'
                            }`}
                          >
                            شانس موفقیت: {details.winPct}٪
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 font-mono text-[10px] flex items-center gap-1">
                          <Fuel className="w-3 h-3" /> {details.fuelCost} سوخت
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{op.effect}</p>
                      {details.requirementErrorFa ? (
                        <div className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-2.5 py-1 rounded-lg">
                          ⚠️ {details.requirementErrorFa}
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {details.factorsFa.map((f, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-0.5 rounded bg-[#060c18] border border-slate-800 text-[10px] text-cyan-300"
                            >
                              {f}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({
                          kind: 'MILITARY_OPERATION',
                          targetCountry: target.id,
                          militaryType: op.type,
                          targetSector: sector,
                        });
                      }}
                      className={`px-4 py-2.5 rounded-xl font-black text-xs shrink-0 disabled:opacity-40 ${
                        op.nuclear
                          ? 'bg-rose-600 hover:bg-rose-500 text-white'
                          : op.type === 'LIBERATION_COUNTEROFFENSIVE'
                          ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                          : 'bg-rose-500 hover:bg-rose-400 text-slate-950'
                      }`}
                    >
                      {quotaFull ? 'تکمیل سهمیه ماه' : `ثبت فرمان ($${op.costB}B)`}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : tab === 'COVERT' ? (
            <div className="space-y-3">
              {/* Intel Status & Quota Banner */}
              <div className="p-3 rounded-2xl glass-card flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-purple-200">
                  🕵️ سهمیه عملیات مخفی این ماه: <span className="font-mono text-white">{me.covertOrdersUsedThisRound} از {maxCovOps}</span> (حداکثر ۱ ترور در ماه)
                </span>
                {intelSnapshot && (
                  <span className="text-emerald-300 font-bold">
                    🔓 خزانه هدف: ${intelSnapshot.treasuryB}B • کلاهک: {intelSnapshot.warheads} • غذا: {intelSnapshot.foodReserve}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                {(
                  [
                    ['ALL', 'همه (۸)'],
                    ['SPY', '📡 جاسوسی'],
                    ['CYBER', '💻 هک سایبری'],
                    ['ASSASSINATE', '🎯 ترور هدفمند'],
                  ] as const
                ).map(([flt, lbl]) => (
                  <button
                    key={flt}
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setCovertFilter(flt);
                    }}
                    className={`py-2 rounded-xl border ${
                      covertFilter === flt
                        ? 'bg-purple-500 text-slate-950 border-purple-400 font-black'
                        : 'bg-[#060c18] text-slate-300 border-slate-800'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              {visibleCovertOps.map((cov) => {
                const details = evaluateCovertOpDetails(me, target, cov.type);
                const quotaFull =
                  me.covertOrdersUsedThisRound >= maxCovOps ||
                  (cov.group === 'ASSASSINATE' && me.assassinationsUsedThisRound >= 1);

                return (
                  <div
                    key={cov.type}
                    className="p-3.5 rounded-2xl glass-card border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
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
                            ریسک لو رفتن هویت: {details.tracePct}٪
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{cov.effect}</p>
                    </div>
                    <button
                      type="button"
                      disabled={quotaFull}
                      onClick={() => {
                        sound.playOrderConfirm();
                        onQueueOrder({
                          kind: 'COVERT_OPERATION',
                          targetCountry: target.id,
                          covertType: cov.type,
                        });
                      }}
                      className="px-4 py-2.5 rounded-xl bg-purple-500 hover:bg-purple-400 text-slate-950 font-black text-xs shrink-0 disabled:opacity-40"
                    >
                      {quotaFull ? 'تکمیل سهمیه' : `اجرا ($${cov.costB}B)`}
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            /* DIPLOMACY, PEACE TREATY, THREATEN, SOW DISCORD & ARMS BUY/SELL (ITEMS #7, #17, #22!) */
            <div className="space-y-4">
              {/* 1. PEACE TREATY & ALLIANCE & FRIENDSHIP */}
              <div className="glass-card border-emerald-500/35 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs sm:text-sm font-black text-emerald-300 flex items-center gap-1.5">
                    <HeartHandshake className="w-4 h-4" />
                    معاهده صلح، دوستی و اتحاد رسمی (رابطه فعلی: {rel > 0 ? `+${rel}` : rel})
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    disabled={hasActiveTruce}
                    onClick={() => {
                      sound.playDiplomacy();
                      onProposeTrade({
                        to: target.id,
                        offerType: 'PEACE_TREATY',
                        amount: 1,
                        priceB: peaceOfferCost,
                        direction: 'PACT',
                      });
                    }}
                    className="p-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-emerald-200 font-black text-right disabled:opacity-45"
                  >
                    <div>🕊️ امضای پیمان صلح و آتش‌بس</div>
                    <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                      {hasActiveTruce
                        ? `آتش‌بس تا ماه ${truceUntil} فعال است ✓`
                        : `پایان جنگ، لغو تحریم و ۳ ماه عدم تعرض (${peaceOfferCost === 0 ? 'رایگان' : `$${peaceOfferCost}B`})`}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playDiplomacy();
                      onDiplomaticAction(target.id, 'IMPROVE_RELATIONS');
                    }}
                    className="p-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-black text-right"
                  >
                    <div>🤝 اعزام هیئت دوستی ($14B)</div>
                    <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                      افزایش فوری +۲۰ واحد رابطه سیاسی برای آماده‌سازی اتحاد
                    </div>
                  </button>

                  {!isSecretAlly && !isAlly ? (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playDiplomacy();
                        onProposeTrade({
                          to: target.id,
                          offerType: 'SECRET_DEFENSE_PACT',
                          amount: 1,
                          priceB: rel >= 45 ? 14 : 24,
                          direction: 'PACT',
                        });
                      }}
                      className="p-3 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-400/50 text-purple-200 font-black text-right"
                    >
                      <div>🕵️ پیمان دفاعی محرمانه پشت‌پرده (${rel >= 45 ? 14 : 24}B)</div>
                      <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                        بدون اعلام در اخبار! غافلگیری و کمین خودکار به محض حمله دشمن
                      </div>
                    </button>
                  ) : isSecretAlly ? (
                    <div className="p-3 rounded-xl bg-purple-500/20 border border-purple-400/50 text-purple-200 font-black flex items-center justify-center">
                      🕵️ پیمان دفاعی محرمانه برقرار است ✓
                    </div>
                  ) : null}

                  {!isAlly ? (
                    <button
                      type="button"
                      onClick={() => {
                        sound.playDiplomacy();
                        onProposeTrade({
                          to: target.id,
                          offerType: 'ALLIANCE',
                          amount: 1,
                          priceB: rel >= 55 ? 12 : 26,
                          direction: 'PACT',
                        });
                      }}
                      className="p-3 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-indigo-200 font-black text-right"
                    >
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> اتحاد رسمی علنی (${rel >= 55 ? 12 : 26}B)
                      </div>
                      <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                        نیازمند رابطه بالای +۲۰؛ باز شدن ساخت تسلیحات متحد!
                      </div>
                    </button>
                  ) : (
                    <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-black flex items-center justify-center">
                      🤝 متحد نظامی رسمی ✓
                    </div>
                  )}
                </div>
              </div>

              {/* 2. THREATEN / ULTIMATUM & SOW DISCORD (ITEM #17!) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="glass-card border-amber-500/35 rounded-2xl p-3.5 space-y-2.5">
                  <div className="font-black text-amber-300 flex items-center gap-1.5">
                    <AlertOctagon className="w-4 h-4" />
                    تهدید رسمی و صدور اولتیماتوم ($8B)
                  </div>
                  <select
                    value={ultimatumDemand}
                    onChange={(e) => setUltimatumDemand(e.target.value as UltimatumDemand)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#050a14] border border-slate-700 text-white text-xs"
                  >
                    <option value="STOP_ATTACKS">شرط: توقف فوری حملات و عقب‌نشینی</option>
                    <option value="LIFT_SANCTION">شرط: لغو فوری تحریم‌ها علیه کشور ما</option>
                    <option value="OPEN_CHOKEPOINT">شرط: بازگشایی تنگه دریایی مسدودشده</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playOrderConfirm();
                      onDiplomaticAction(target.id, 'THREATEN_ULTIMATUM', { ultimatum: ultimatumDemand });
                    }}
                    className="w-full py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black"
                  >
                    ⚠️ ارسال اولتیماتوم نظامی ($8B)
                  </button>
                </div>

                <div className="glass-card border-rose-500/35 rounded-2xl p-3.5 space-y-2.5">
                  <div className="font-black text-rose-300 flex items-center gap-1.5">
                    <Flame className="w-4 h-4" />
                    کاشتن بذر نفرت علیه کشور سوم ($18B)
                  </div>
                  <select
                    value={discordThirdId}
                    onChange={(e) => setDiscordThirdId(e.target.value as CountryId)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#050a14] border border-slate-700 text-white text-xs"
                  >
                    {ALL_COUNTRY_IDS.filter(
                      (cid) => cid !== me.id && cid !== target.id && !room.countries[cid]?.isEliminated
                    ).map((cid) => (
                      <option key={cid} value={cid}>
                        تخریب رابطه با: {room.countries[cid].nameFa}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      sound.playOrderConfirm();
                      onDiplomaticAction(target.id, 'SOW_DISCORD', { thirdCountry: discordThirdId });
                    }}
                    className="w-full py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 font-black"
                  >
                    🐍 اجرای عملیات تفرقه‌افکنی ($18B)
                  </button>
                </div>
              </div>

              {/* 3. Resource & Sanction Deals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    sound.playOrderConfirm();
                    onProposeTrade({
                      to: target.id,
                      offerType: 'OIL',
                      amount: 60,
                      priceB: fairOil60Price,
                      direction: 'SELL',
                    });
                  }}
                  className="p-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-200 font-bold text-right"
                >
                  🛢️ صادرات ۶۰ نفت (+${fairOil60Price}B)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playOrderConfirm();
                    onProposeTrade({
                      to: target.id,
                      offerType: 'FOOD',
                      amount: 60,
                      priceB: 19,
                      direction: 'BUY',
                    });
                  }}
                  className="p-3 rounded-xl bg-lime-500/15 hover:bg-lime-500/25 border border-lime-500/40 text-lime-200 font-bold text-right"
                >
                  🌾 واردات ۶۰ غلات ($19B)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onToggleSanction(target.id);
                  }}
                  className={`p-3 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                    iSanctionThem
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  {iSanctionThem ? 'لغو تحریم اقتصادی' : 'وضع تحریم اقتصادی'}
                </button>
              </div>

              {/* 4. Buy Target's Indigenous Weapons OR Sell Your Surplus Weapons */}
              {targetIndigenousWeapons.length > 0 && (
                <div className="glass-card rounded-2xl p-3.5 space-y-2">
                  <div className="font-black text-xs sm:text-sm text-amber-300 flex items-center gap-1.5">
                    <ShoppingCart className="w-4 h-4" />
                    خرید مستقیم تسلیحات ساخت {target.nameFa}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {targetIndigenousWeapons.map((w) => {
                      const exportPrice = Math.round(w.unitCostB * (isAlly ? 1.0 : 1.12));
                      return (
                        <div
                          key={w.id}
                          className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">{w.nameFa}</div>
                            <div className="text-[10px] text-indigo-300">{w.roleTagFa}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playOrderConfirm();
                              onProposeTrade({
                                to: target.id,
                                offerType: 'WEAPON',
                                weaponId: w.id,
                                amount: 1,
                                priceB: exportPrice,
                                direction: 'BUY',
                              });
                            }}
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

              {myOwnedWeaponsToSell.length > 0 && (
                <div className="glass-card rounded-2xl p-3.5 space-y-2">
                  <div className="font-black text-xs text-emerald-300">
                    💰 پیشنهاد صادرات و فروش تسلیحات از زرادخانه شما به {target.nameFa}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {myOwnedWeaponsToSell.slice(0, 4).map(({ spec, cnt }) => {
                      const askPrice = Math.round(spec.unitCostB * 0.82);
                      return (
                        <div
                          key={spec.id}
                          className="p-2.5 rounded-xl bg-[#060c18] border border-slate-800 flex items-center justify-between gap-2"
                        >
                          <div>
                            <div className="text-xs font-bold text-white">
                              {spec.nameFa} (×{cnt})
                            </div>
                            <div className="text-[10px] text-slate-400">فروش ۱ واحد به {target.nameFa}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              sound.playOrderConfirm();
                              onProposeTrade({
                                to: target.id,
                                offerType: 'WEAPON',
                                weaponId: spec.id,
                                amount: 1,
                                priceB: askPrice,
                                direction: 'SELL',
                              });
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shrink-0"
                          >
                            فروش (+${askPrice}B)
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 5. Convene UN / IAEA / Aid Special Committee Votes */}
              <div className="glass-card border-amber-500/30 rounded-2xl p-3.5 space-y-2.5">
                <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Scale className="w-4 h-4" />
                  تشکیل پرونده در سازمان ملل و آژانس درباره {target.nameFa}:
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
                    ☢️ پرونده بازرسی هسته‌ای آژانس (IAEA)
                  </button>
                  <button
                    type="button"
                    onClick={() => onProposeResolution(target.id, 'EMERGENCY_AID_PACKAGE')}
                    className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 font-bold text-right"
                  >
                    🏥 تصویب بسته کمک بازسازی $45B
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
