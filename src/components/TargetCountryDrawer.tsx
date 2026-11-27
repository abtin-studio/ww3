import React, { useMemo, useState } from 'react';
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
  HeartHandshake,
  Fuel,
  Send,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import {
  computeCountryMilitary,
  evaluateCovertOpDetails,
  evaluateFalseFlagSabotageChance,
  evaluateMilitaryOpDetails,
  evaluateStrategicRequestChance,
  getMaxCovertOrdersPerRound,
  getMaxMilitaryOrdersPerRound,
} from '../../shared/advisor';
import { ALL_COUNTRY_IDS, WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  ChokepointId,
  CountryId,
  CovertOpType,
  DiplomaticActionKind,
  GameRoomState,
  MilitaryOpType,
  RequestLeverageMode,
  ResolutionKind,
  StrategicRequestKind,
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
  onProposeRequest: (payload: {
    targetCountry: CountryId;
    kind: StrategicRequestKind;
    leverage: RequestLeverageMode;
    offeredCashB?: number;
    thirdCountry?: CountryId;
    chokepointId?: ChokepointId;
  }) => void;
  onFalseFlagSabotage: (targetCountry: CountryId, thirdCountry: CountryId) => void;
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
  onProposeRequest,
  onFalseFlagSabotage,
  onDiplomaticAction,
  onToggleSanction,
  onProposeResolution,
  onOpenDirectChat,
}) => {
  const [tab, setTab] = useState<DrawerTab>(initialTab);
  const [sector, setSector] = useState<StrikeTargetSector>('MILITARY_BASES');
  const [covertFilter, setCovertFilter] = useState<'ALL' | 'SPY' | 'CYBER' | 'ASSASSINATE'>('ALL');
  const [showArmsDeals, setShowArmsDeals] = useState(false);

  const target = room.countries[targetId];
  const me = myCountryId ? room.countries[myCountryId] : null;

  const targetChokepoint = useMemo(
    () => Object.values(room.chokepoints).find((cp) => cp.controller === targetId),
    [room.chokepoints, targetId]
  );

  const [reqKind, setReqKind] = useState<StrategicRequestKind>(() =>
    targetChokepoint && targetChokepoint.status !== 'OPEN' ? 'OPEN_CHOKEPOINT' : 'JOINT_MILITARY_STRIKE'
  );
  const [reqLeverage, setReqLeverage] = useState<RequestLeverageMode>('DIPLOMATIC_INCENTIVE');
  const [reqCashB, setReqCashB] = useState<number>(25);
  const [reqThirdId, setReqThirdId] = useState<CountryId>(() => {
    const rival = target?.rivals.find((id) => id !== myCountryId && !room.countries[id]?.isEliminated);
    return rival || ALL_COUNTRY_IDS.find((id) => id !== myCountryId && id !== targetId) || 'US';
  });

  const [falseFlagThirdId, setFalseFlagThirdId] = useState<CountryId>(() => {
    const ally = target?.allies.find((id) => id !== myCountryId && !room.countries[id]?.isEliminated);
    return ally || ALL_COUNTRY_IDS.find((id) => id !== myCountryId && id !== targetId) || 'US';
  });

  if (!target) return null;

  const myMil = me ? computeCountryMilitary(me) : null;
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
  const fairOil60Price = Math.max(12, Math.round(20 * (room.market.oilPriceUsd / 82)));
  const peaceOfferCost = rel >= 0 || target.devastation >= 35 ? 0 : 20;

  const needsThirdCountry =
    reqKind === 'JOINT_MILITARY_STRIKE' ||
    reqKind === 'JOINT_CYBER_SABOTAGE' ||
    reqKind === 'IMPOSE_SANCTION';
  const needsChokepoint = reqKind === 'OPEN_CHOKEPOINT' || reqKind === 'BLOCKADE_CHOKEPOINT';

  const reqEval = me
    ? evaluateStrategicRequestChance(
        me,
        target,
        reqKind,
        reqLeverage,
        reqLeverage === 'DIPLOMATIC_INCENTIVE' ? reqCashB : 0,
        room.chokepoints,
        needsThirdCountry ? room.countries[reqThirdId] : null,
        needsChokepoint ? targetChokepoint?.id : undefined
      )
    : null;

  const falseFlagEval =
    me && room.countries[falseFlagThirdId]
      ? evaluateFalseFlagSabotageChance(me, target, room.countries[falseFlagThirdId], room.round)
      : null;

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
      title: '🎭 جنگ نیابتی و تسلیح شورشیان مرزی',
      effect: '-$18B فرسایش مالی، -۱۰٪ رضایت و -۶٪ کنترل مرزی دشمن با کمترین ریسک افشای هویت!',
      costB: 20,
    },
    {
      type: 'SAT_RECON',
      group: 'SPY',
      title: '📡 اشراف اطلاعاتی و پرونده محرمانه',
      effect: 'کشف دقیق خزانه، کلاهک‌ها، غذا/آب و ویرانی + ۱۲٪ افزایش دقت حملات نظامی.',
      costB: 9,
    },
    {
      type: 'INSURGENCY_PSYOPS',
      group: 'SPY',
      title: '🔥 جنگ روانی و التهاب سیاسی داخلی',
      effect: 'کاهش ۱۴٪ رضایت مردم و افزایش ۱۱٪ شاخص بحران دولت هدف.',
      costB: 16,
    },
    {
      type: 'BLACKOUT_VIRUS',
      group: 'CYBER',
      title: '⚡ ویروس سایبری Blackout علیه برق و رادار',
      effect: 'کور کردن رادار هشدار سریع هدف + قطع ۲۶٪ شبکه برق سراسری شهرها.',
      costB: 16,
    },
    {
      type: 'TREASURY_HEIST',
      group: 'CYBER',
      title: '🏦 هک و سرقت سایبری بانک مرکزی',
      effect: 'انتقال مستقیم $22B تا $40B از خزانه ارزی دشمن به خزانه کشور شما.',
      costB: 18,
    },
    {
      type: 'STUXNET_SABOTAGE',
      group: 'CYBER',
      title: '🧬 بدافزار صنعتی استاکس‌نت ۲',
      effect: '-۲۵٪ برنامه هسته‌ای هدف و تخریب ۱ سطح کارخانه دفاعی یا راکتور.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_COMMANDER',
      group: 'ASSASSINATE',
      title: '🎖️ ترور فرمانده ارشد نیروهای مسلح',
      effect: 'فلج کردن اتاق جنگ دشمن: -۲۵٪ توان فرماندهی و رهگیری هدف در این ماه!',
      costB: 24,
    },
    {
      type: 'ASSASSINATE_SCIENTIST',
      group: 'ASSASSINATE',
      title: '🔬 ترور دانشمندان هسته‌ای و هوافضا',
      effect: 'عقب انداختن ۲۸٪ پروژه کلاهک هسته‌ای و کاهش سطح فناوری هدف.',
      costB: 22,
    },
    {
      type: 'ASSASSINATE_MINISTER',
      group: 'ASSASSINATE',
      title: '🏛️ ترور مقامات ارشد سیاسی در پایتخت',
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
            title: `🛡️ پاتک آزادسازی خاک میهن (${100 - me.integrityPct}٪ در اشغال)`,
            effect: 'بازپس‌گیری تا ۲۶٪ از مناطق اشغالی کشور شما و افزایش ۱۰٪ روحیه ملی!',
            costB: 24,
          },
        ]
      : []),
    {
      type: 'AIR_SORTIE',
      title: `✈️ عملیات جنگنده‌ها و بمباران هوایی (اسکادران: ${myMil?.fighterCount || 0})`,
      effect: 'نبرد هوایی، سرکوب ۳۲٪ رادار دشمن و بمباران دقیق زیرساخت انتخابی.',
      costB: 18,
    },
    {
      type: 'MISSILE_DRONE_STRIKE',
      title: `🚀 حمله ترکیبی موشکی و امواج پهپادی (${(myMil?.missileCount || 0) + (myMil?.droneCount || 0)} واحد)`,
      effect: 'اشباع پدافند با موشک‌های هایپرسونیک و پهپادها و انهدام ۱ سطح زیرساخت هدف.',
      costB: 20,
    },
    {
      type: 'NAVAL_BLOCKADE_STRIKE',
      title: `⚓ عملیات ناوگان دریایی و محاصره بنادر (${myMil?.navalCount || 0} ناوگان)`,
      effect: 'شکار ناوگان دشمن، توقیف نفتکش‌ها و کاهش ۴۸٪ درآمد صادراتی هدف.',
      costB: 22,
    },
    {
      type: 'GROUND_CONQUEST',
      title: `🚜 تهاجم زرهی و پیشروی مرزی (خاک باقی‌مانده: ${target.integrityPct}٪)`,
      effect: 'تصرف مرحله‌ای خاک دشمن (تا ۲۴٪ در ماه) + غنیمت خزانه و نفت تا فتح کامل پایتخت.',
      costB: 34,
    },
    ...((target.orbitalSatellites || 0) > 0
      ? [
          {
            type: 'ASAT_STRIKE' as MilitaryOpType,
            title: `☄️ شلیک موشک ضدماهواره ASAT به مدار (${target.orbitalSatellites} ماهواره فعال)`,
            effect: 'انهدام ۱ سطح از منظومه‌های ماهواره‌ای دشمن در مدار زمین + کور کردن ۳۸٪ رادار هدف!',
            costB: 24,
          },
        ]
      : []),
    {
      type: 'NUCLEAR_STRIKE',
      title: `☢️ شلیک کلاهک استراتژیک هسته‌ای (موجودی: ${me?.warheads || 0})`,
      effect: 'انهدام سنگین زیرساخت‌ها و وضعیت DEFCON 1، همراه با تحریم جهانی مهاجم!',
      costB: 45,
      nuclear: true,
    },
  ];

  return (
    <div className="fixed inset-0 z-40 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] glass-panel rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden animate-panel-in">
        {/* Clean Header */}
        <div className="p-4 bg-[#060c18]/92 border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CountryFlag countryId={target.id} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">{target.nameFa}</h2>
                {target.isEliminated ? (
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white text-[11px] font-black">
                    🥀 سقوط‌کرده
                  </span>
                ) : target.playerName ? (
                  <span className="px-2 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                    👤 {target.playerName}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 text-[11px] font-bold">
                    {target.archetypeTagFa}
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
                {target.orbitalSatellites > 0 && <span>• 🛰️ {target.orbitalSatellites} ماهواره</span>}
                {me && (
                  <span
                    className={`font-bold ${
                      rel >= 25 ? 'text-emerald-300' : rel <= -25 ? 'text-rose-400' : 'text-amber-300'
                    }`}
                  >
                    • رابطه با شما: {rel > 0 ? `+${rel}` : rel}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
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
                چت
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

        {/* 3 Clean Action Tabs */}
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
              درخواست‌ها و پیمان
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
              نظامی ({me.militaryOrdersUsedThisRound}/{maxMilOps})
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
              فریب، هک و ترور ({me.covertOrdersUsedThisRound}/{maxCovOps})
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
            <div className="space-y-3.5 animate-card-pop">
              <div className="p-3 rounded-2xl glass-card flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-slate-200">
                  ⚔️ سهمیه عملیات نظامی این ماه:{' '}
                  <span className="text-rose-300 font-mono">
                    {me.militaryOrdersUsedThisRound} / {maxMilOps}
                  </span>
                </span>
                <span className="text-amber-300 font-mono">🛢️ سوخت شما: {me.oilReserve} واحد</span>
              </div>

              {hasActiveTruce && (
                <div className="p-3 rounded-2xl bg-cyan-500/15 border border-cyan-400/40 text-xs text-cyan-200 font-bold">
                  🕊️ پیمان آتش‌بس رسمی میان کشور شما و {target.nameFa} تا پایان ماه {truceUntil} برقرار است.
                </div>
              )}

              <div className="p-3 rounded-2xl glass-card space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  🎯 بخش هدف بمباران هوایی / موشکی:
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
                            شانس پیروزی: {details.winPct}٪
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
            <div className="space-y-3.5 animate-card-pop">
              {/* Intel Status Banner */}
              <div className="p-3 rounded-2xl glass-card flex items-center justify-between flex-wrap gap-2 text-xs">
                <span className="font-bold text-purple-200">
                  🕵️ سهمیه عملیات مخفی این ماه:{' '}
                  <span className="font-mono text-white">
                    {me.covertOrdersUsedThisRound} / {maxCovOps}
                  </span>
                </span>
                {intelSnapshot && (
                  <span className="text-emerald-300 font-bold font-mono">
                    🔓 خزانه هدف: ${intelSnapshot.treasuryB}B • کلاهک: {intelSnapshot.warheads} • غذا: {intelSnapshot.foodReserve}
                  </span>
                )}
              </div>

              {/* RENAMED & BALANCED FALSE-FLAG SABOTAGE STUDIO (v6.0 Item #3!) */}
              {falseFlagEval && (
                <div className="p-4 rounded-2xl bg-gradient-to-br from-purple-950/40 via-[#081124] to-rose-950/30 border border-purple-500/45 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="font-black text-xs sm:text-sm text-purple-200 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-purple-400" />
                      عملیات فریب و بحران‌سازی دیپلماتیک (پرچم دروغین)
                    </div>
                    <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                      شانس موفقیت: {falseFlagEval.winPct}٪ • ریسک افشا: {falseFlagEval.exposureRiskPct}٪
                    </span>
                  </div>

                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    صحنه‌سازی اطلاعاتی برای درگیر کردن <strong>{target.nameFa}</strong> با یک قدرت سوم (شکستن پیمان اتحاد، تحریم متقابل و تلافی نظامی در صورت سقوط رابطه؛ نیازمند اطلاعات Lv.2 و ۱ سهمیه مخفی).
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                    <select
                      value={falseFlagThirdId}
                      onChange={(e) => setFalseFlagThirdId(e.target.value as CountryId)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050a14] border border-slate-700 text-white text-xs"
                    >
                      {ALL_COUNTRY_IDS.filter(
                        (cid) => cid !== me.id && cid !== target.id && !room.countries[cid]?.isEliminated
                      ).map((cid) => {
                        const pairR = target.relations[cid] ?? 0;
                        const allied = target.allies.includes(cid);
                        return (
                          <option key={cid} value={cid}>
                            {room.countries[cid].nameFa} (رابطه فعلی با {target.nameFa}: {pairR > 0 ? `+${pairR}` : pairR}
                            {allied ? ' • متحد رسمی' : ''})
                          </option>
                        );
                      })}
                    </select>

                    <button
                      type="button"
                      disabled={!falseFlagEval.canExecute}
                      onClick={() => {
                        sound.playCyberPulse();
                        onFalseFlagSabotage(target.id, falseFlagThirdId);
                      }}
                      className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-l from-purple-500 to-rose-500 hover:from-purple-400 hover:to-rose-400 text-white font-black text-xs disabled:opacity-35"
                    >
                      🕵️ اجرای پرچم دروغین (${falseFlagEval.costB}B)
                    </button>
                  </div>

                  {falseFlagEval.errorFa ? (
                    <div className="text-[11px] text-amber-300 font-bold bg-amber-500/10 border border-amber-500/30 px-2.5 py-1.5 rounded-xl flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{falseFlagEval.errorFa}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {falseFlagEval.factorsFa.map((f, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-[#050a14] border border-slate-800 text-[10px] text-purple-200"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-4 gap-1.5 text-[11px] font-bold">
                {(
                  [
                    ['ALL', 'همه (۹)'],
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
                    className="p-3.5 rounded-2xl glass-card border-purple-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-xs sm:text-sm text-white">{cov.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                          شانس: {details.winPct}٪
                        </span>
                        {cov.type !== 'SAT_RECON' && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 font-mono text-[10px]">
                            ریسک ردیابی: {details.tracePct}٪
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
            /* =====================================================================
               DIPLOMACY, COMPREHENSIVE SMART STRATEGIC REQUESTS & PACTS (Item #4!)
            ===================================================================== */
            <div className="space-y-3.5 animate-card-pop">
              {/* 1. COMPREHENSIVE SMART STRATEGIC REQUESTS STUDIO */}
              <div className="glass-card border-amber-400/40 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="font-black text-xs sm:text-sm text-amber-300 flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    ارسال درخواست راهبردی و دیپلماتیک به {target.nameFa}
                  </div>
                  {reqEval && reqEval.canSend && target.playerId === null && (
                    <span
                      className={`px-2.5 py-0.5 rounded-lg font-mono text-xs font-black ${
                        reqEval.acceptPct >= 65
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : reqEval.acceptPct >= 38
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      }`}
                    >
                      احتمال موافقت هوش مصنوعی: {reqEval.acceptPct}٪
                    </span>
                  )}
                </div>

                {/* Request Type Picker */}
                <select
                  value={reqKind}
                  onChange={(e) => setReqKind(e.target.value as StrategicRequestKind)}
                  className="w-full px-3 py-2.5 rounded-xl bg-[#050a14] border border-slate-700 text-white text-xs font-bold"
                >
                  <option value="JOINT_MILITARY_STRIKE">⚔️ درخواست حمله نظامی مشترک علیه کشور سوم</option>
                  <option value="JOINT_CYBER_SABOTAGE">💻 درخواست حمله سایبری و هک کشور سوم</option>
                  <option value="IMPOSE_SANCTION">🚫 درخواست تحریم اقتصادی کشور سوم</option>
                  <option value="FORM_FRIENDSHIP">🤝 درخواست پیمان دوستی، عادی‌سازی و بازگشایی حریم هوایی</option>
                  <option value="CEASEFIRE_WITH_ME">🕊️ درخواست آتش‌بس فوری و توقف حملات علیه ما</option>
                  <option value="LIFT_SANCTION_ON_ME">✅ درخواست لغو تحریم اقتصادی علیه کشور ما</option>
                  <option value="ECONOMIC_AID">📦 درخواست کمک اضطراری مالی، نفت و غذا</option>
                  <option value="OPEN_CHOKEPOINT">
                    ⚓ درخواست بازگشایی تنگه دریایی {targetChokepoint ? `(${targetChokepoint.nameFa})` : '(مخصوص کنترل‌کننده تنگه)'}
                  </option>
                  <option value="BLOCKADE_CHOKEPOINT">
                    🚨 درخواست مسدودسازی تنگه دریایی به روی رقبا {targetChokepoint ? `(${targetChokepoint.nameFa})` : '(مخصوص کنترل‌کننده تنگه)'}
                  </option>
                </select>

                {/* Third Country Selector when applicable */}
                {needsThirdCountry && (
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-400">انتخاب کشور سوم هدف:</label>
                    <select
                      value={reqThirdId}
                      onChange={(e) => setReqThirdId(e.target.value as CountryId)}
                      className="w-full px-3 py-2 rounded-xl bg-[#050a14] border border-slate-700 text-white text-xs"
                    >
                      {ALL_COUNTRY_IDS.filter(
                        (cid) => cid !== me.id && cid !== target.id && !room.countries[cid]?.isEliminated
                      ).map((cid) => {
                        const rToThird = target.relations[cid] ?? 0;
                        return (
                          <option key={cid} value={cid}>
                            هدف: {room.countries[cid].nameFa} (رابطه {target.nameFa} با آن:{' '}
                            {rToThird > 0 ? `+${rToThird}` : rToThird})
                          </option>
                        );
                      })}
                    </select>
                  </div>
                )}

                {/* Leverage Mode Switcher */}
                <div className="grid grid-cols-2 gap-1.5 bg-[#050a14] p-1 rounded-xl border border-slate-800 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => setReqLeverage('DIPLOMATIC_INCENTIVE')}
                    className={`py-2 rounded-lg transition ${
                      reqLeverage === 'DIPLOMATIC_INCENTIVE'
                        ? 'bg-emerald-500 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    🤝 دیپلماسی و مشوق مالی
                  </button>
                  <button
                    type="button"
                    onClick={() => setReqLeverage('COERCIVE_PRESSURE')}
                    className={`py-2 rounded-lg transition ${
                      reqLeverage === 'COERCIVE_PRESSURE'
                        ? 'bg-amber-400 text-slate-950 font-black'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ⚠️ فشار بازدارندگی نظامی ($6B)
                  </button>
                </div>

                {reqLeverage === 'DIPLOMATIC_INCENTIVE' && (
                  <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
                    <span className="text-slate-300 text-[11px]">مشوق پیشنهادی از خزانه شما:</span>
                    <div className="flex items-center gap-1">
                      {[0, 15, 30, 50, 80].map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => setReqCashB(amt)}
                          className={`px-2.5 py-1 rounded-lg font-mono text-[11px] font-bold border ${
                            reqCashB === amt
                              ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200'
                              : 'bg-[#050a14] border-slate-800 text-slate-400'
                          }`}
                        >
                          {amt === 0 ? 'بدون پول' : `+$${amt}B`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {reqEval?.errorFa ? (
                  <div className="text-[11px] font-bold text-amber-300 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-xl">
                    ⚠️ {reqEval.errorFa}
                  </div>
                ) : (
                  reqEval &&
                  reqEval.factorsFa.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {reqEval.factorsFa.map((f, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded bg-[#050a14] border border-slate-800 text-[10px] text-cyan-200"
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  )
                )}

                <button
                  type="button"
                  disabled={!reqEval?.canSend}
                  onClick={() => {
                    sound.playDiplomacy();
                    onProposeRequest({
                      targetCountry: target.id,
                      kind: reqKind,
                      leverage: reqLeverage,
                      offeredCashB: reqLeverage === 'DIPLOMATIC_INCENTIVE' ? reqCashB : 0,
                      thirdCountry: needsThirdCountry ? reqThirdId : undefined,
                      chokepointId: needsChokepoint ? targetChokepoint?.id : undefined,
                    });
                  }}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-l from-amber-400 to-emerald-400 hover:from-amber-300 hover:to-emerald-300 text-slate-950 font-black text-xs shadow disabled:opacity-35"
                >
                  📜 ارسال رسمی درخواست به {target.nameFa}
                </button>
              </div>

              {/* 2. PEACE TREATY, SECRET PACT & ALLIANCE */}
              <div className="glass-card border-emerald-500/30 rounded-2xl p-3.5 space-y-2.5">
                <span className="text-xs font-black text-emerald-300 flex items-center gap-1.5">
                  <HeartHandshake className="w-4 h-4" />
                  معاهدات کلان صلح و هم‌پیمانی نظامی
                </span>

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
                    className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-400/40 text-emerald-200 font-black text-right disabled:opacity-45"
                  >
                    <div>🕊️ پیمان صلح ۳ ماهه ({peaceOfferCost === 0 ? 'رایگان' : `$${peaceOfferCost}B`})</div>
                    <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                      پایان وضعیت جنگی و لغو تحریم متقابل
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      sound.playDiplomacy();
                      onDiplomaticAction(target.id, 'IMPROVE_RELATIONS');
                    }}
                    className="p-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-black text-right"
                  >
                    <div>🤝 اعزام هیئت دیپلماتیک ($16B)</div>
                    <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                      بهبود فوری +۱۸ واحد شاخص رابطه سیاسی
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
                          priceB: rel >= 45 ? 15 : 26,
                          direction: 'PACT',
                        });
                      }}
                      className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-400/40 text-purple-200 font-black text-right"
                    >
                      <div>🕵️ پیمان دفاعی محرمانه (${rel >= 45 ? 15 : 26}B)</div>
                      <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                        مخفی از سایرین؛ کمین خودکار علیه مهاجم!
                      </div>
                    </button>
                  ) : isSecretAlly ? (
                    <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-400/50 text-purple-200 font-black flex items-center justify-center">
                      🕵️ پیمان دفاعی محرمانه فعال ✓
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
                          priceB: rel >= 55 ? 14 : 28,
                          direction: 'PACT',
                        });
                      }}
                      className="p-2.5 rounded-xl bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/40 text-indigo-200 font-black text-right"
                    >
                      <div className="flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> اتحاد رسمی نظامی (${rel >= 55 ? 14 : 28}B)
                      </div>
                      <div className="text-[10px] font-normal text-slate-300 mt-0.5">
                        تولید تحت لیسانس تسلیحات پیشرفته متحد
                      </div>
                    </button>
                  ) : (
                    <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/35 text-emerald-300 font-black flex items-center justify-center">
                      🤝 متحد نظامی رسمی ✓
                    </div>
                  )}
                </div>
              </div>

              {/* 3. Quick Bilateral Trade, Sanctions & Collapsible Arms Export */}
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
                  className="p-2.5 rounded-xl bg-emerald-500/12 hover:bg-emerald-500/22 border border-emerald-500/35 text-emerald-200 font-bold text-center"
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
                      priceB: 16,
                      direction: 'BUY',
                    });
                  }}
                  className="p-2.5 rounded-xl bg-lime-500/12 hover:bg-lime-500/22 border border-lime-500/35 text-lime-200 font-bold text-center"
                >
                  🌾 واردات ۶۰ غلات ($16B)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    onToggleSanction(target.id);
                  }}
                  className={`p-2.5 rounded-xl border font-bold flex items-center justify-center gap-1.5 ${
                    iSanctionThem
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                      : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  }`}
                >
                  <Ban className="w-4 h-4" />
                  {iSanctionThem ? 'لغو تحریم دوجانبه' : 'تحریم دوجانبه'}
                </button>
              </div>

              {/* Collapsible Arms & UN Section to Prevent Visual Clutter */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setShowArmsDeals((v) => !v)}
                  className="flex-1 py-2 px-3 rounded-xl bg-[#060c18] hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 flex items-center justify-center gap-1.5"
                >
                  <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                  {showArmsDeals ? 'بستن فهرست خرید سلاح و سازمان ملل' : '🎖️ خرید تسلیحات بومی و طرح قطعنامه سازمان ملل'}
                </button>
              </div>

              {showArmsDeals && (
                <div className="space-y-3 animate-card-pop">
                  {targetIndigenousWeapons.length > 0 && (
                    <div className="glass-card rounded-2xl p-3 space-y-2">
                      <div className="font-black text-xs text-amber-300">
                        خرید مستقیم تسلیحات ساخت {target.nameFa}:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {targetIndigenousWeapons.map((w) => {
                          const exportPrice = Math.round(w.unitCostB * (isAlly ? 1.05 : 1.18));
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

                  <div className="glass-card border-amber-500/25 rounded-2xl p-3 space-y-2">
                    <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                      <Scale className="w-4 h-4" />
                      طرح قطعنامه رسمی در شورای امنیت درباره {target.nameFa}:
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          sound.playUNGavel();
                          onProposeResolution(target.id, 'GLOBAL_SANCTION');
                        }}
                        className="p-2.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-200 font-bold text-right"
                      >
                        ⚖️ قطعنامه تحریم شورای امنیت
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playUNGavel();
                          onProposeResolution(target.id, 'IAEA_INSPECTION');
                        }}
                        className="p-2.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-200 font-bold text-right"
                      >
                        ☢️ بازرسی هسته‌ای آژانس (IAEA)
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playUNGavel();
                          onProposeResolution(target.id, 'EMERGENCY_AID_PACKAGE');
                        }}
                        className="p-2.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 font-bold text-right"
                      >
                        🏥 بسته کمک بازسازی $45B
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          sound.playUNGavel();
                          onProposeResolution(target.id, 'CEASEFIRE_DEMAND');
                        }}
                        className="p-2.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-200 font-bold text-right"
                      >
                        🕊️ قطعنامه آتش‌بس و کاهش تنش
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
