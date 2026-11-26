import React, { useState } from 'react';
import {
  X,
  Handshake,
  Swords,
  Eye,
  MessageSquare,
  Ban,
  ShieldCheck,
  AlertTriangle,
  ShoppingCart,
} from 'lucide-react';
import {
  computeCountryMilitary,
  estimateCovertSuccessPct,
  estimateMilitarySuccessPct,
} from '../../shared/advisor';
import { WEAPONS_CATALOG } from '../../shared/realWorldData';
import {
  CountryId,
  CovertOpType,
  GameRoomState,
  MilitaryOpType,
  StrikeTargetSector,
  TradeResourceKind,
  UNResolution,
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
  onProposeResolution: (target: CountryId, kind: UNResolution['kind']) => void;
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

  return (
    <div className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl max-h-[92vh] bg-[#0a1222] border-t sm:border border-slate-700 rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#070d19] border-b border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <CountryFlag countryId={target.id} size="lg" />
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-white">{target.nameFa}</h2>
                {target.playerName ? (
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
                {target.capitalFa} • اطلاعات: {target.agencyCode} • پدافند هوایی: {targetMil.interceptRate}٪
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
                چت خصوصی
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

        {/* 3 Crystal-Clear Action Tabs */}
        {me && (
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
              اتاق جنگ و حمله
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
              هک، ویروس و ترور
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
              تجارت و خرید سلاح
            </button>
          </div>
        )}

        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {!me || !myMil ? (
            <div className="text-sm text-slate-300">نمای نظارتی راوی</div>
          ) : tab === 'WAR' ? (
            <div className="space-y-3.5">
              {/* Live Force Comparison Bar */}
              <div className="p-3.5 rounded-2xl bg-[#0d172a] border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-emerald-300">
                    ⚔️ قدرت تهاجمی شما: {myMil.attackScore}
                  </span>
                  <span className="font-bold text-rose-300">
                    🛡️ قدرت دفاعی {target.nameFa}: {targetMil.defenseScore} (رهگیری {targetMil.interceptRate}٪)
                  </span>
                </div>
                <div className="w-full h-2.5 rounded-full bg-rose-500/30 overflow-hidden flex">
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

              {/* Target Sector Selector for Missile/Air Strikes */}
              <div className="p-3 rounded-2xl bg-[#0d172a] border border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-300 block">
                  🎯 هدف حمله موشکی/هوایی را مشخص کنید:
                </span>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  {(
                    [
                      ['MILITARY_BASES', '🎖️ ارتش و تسلیحات'],
                      ['REFINERY', '🛢️ نفت و پالایشگاه'],
                      ['POWER_PLANT', '⚡ نیروگاه برق'],
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

              {/* 4 Crystal-Clear Military Operations with Exact Win %! */}
              {(
                [
                  {
                    type: 'SEAD_DRONE_SWARM' as MilitaryOpType,
                    title: '🛸 ۱. موج پهپادی سپرشکن (اشباع پدافند)',
                    effect: 'پدافند دشمن را در همین ماه ۳۵٪ ضعیف می‌کند تا موشک‌های بعدی شما راحت اصابت کنند!',
                    costB: 12,
                    nuclear: false,
                  },
                  {
                    type: 'PRECISION_STRIKE' as MilitaryOpType,
                    title: '🚀 ۲. حمله موشکی و هوایی نقطه‌زن',
                    effect:
                      sector === 'REFINERY'
                        ? 'تخریب پالایشگاه و سوزاندن ذخایر نفت دشمن'
                        : sector === 'POWER_PLANT'
                        ? 'قطع سنگین شبکه برق سراسری و کاهش رضایت مردم هدف'
                        : 'انهدام مستقیم ۱ واحد تسلیحات ارتش دشمن + خسارت مالی',
                    costB: 20,
                    nuclear: false,
                  },
                  {
                    type: 'FULL_INVASION' as MilitaryOpType,
                    title: '🛡️ ۳. تهاجم همه‌جانبه زمینی و دریایی (غنیمت جنگی!)',
                    effect:
                      'نبرد سنگین تانک‌ها و ناوها؛ در صورت پیروزی $30B تا $55B پول + ۵۰ نفت غنیمت می‌گیرید! (شکست = تلفات واحد خودی)',
                    costB: 30,
                    nuclear: false,
                  },
                  {
                    type: 'NUCLEAR_STRIKE' as MilitaryOpType,
                    title: `☢️ ۴. شلیک کلاهک هسته‌ای (موجودی: ${me.warheads} کلاهک)`,
                    effect: 'نابودی ۴۵٪ اقتصاد و زیرساخت هدف، اما اعلام DEFCON 1 و تحریم جهانی علیه شما!',
                    costB: 40,
                    nuclear: true,
                  },
                ] as const
              ).map((op) => {
                const winPct = estimateMilitarySuccessPct(me, target, op.type);
                return (
                  <div
                    key={op.type}
                    className={`p-3.5 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      op.nuclear
                        ? 'bg-rose-950/35 border-rose-500/50'
                        : 'bg-[#0d172a] border-slate-800'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-white">{op.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded-md font-mono text-[11px] font-bold ${
                            winPct >= 65
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : winPct >= 42
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          شانس موفقیت: {winPct}٪
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 leading-relaxed">{op.effect}</p>
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
              {/* Intel Box */}
              <div className="p-3 rounded-2xl bg-[#0d172a] border border-slate-800 text-xs flex items-center justify-between">
                {intelSnapshot ? (
                  <span className="text-emerald-300 font-bold">
                    🔓 پرونده سرّی باز است: خزانه ${intelSnapshot.treasuryB}B | نفت {intelSnapshot.oilReserve} | کلاهک{' '}
                    {intelSnapshot.warheads} (+۱۴٪ دقت حمله فعال!)
                  </span>
                ) : (
                  <span className="text-slate-300">
                    🔒 پرونده محرمانه بسته است — با «اشراف ماهواره‌ای» آمار مخفی و +۱۴٪ دقت حمله بگیرید!
                  </span>
                )}
              </div>

              {(
                [
                  {
                    type: 'SAT_RECON' as CovertOpType,
                    title: '📡 ۱. اشراف اطلاعاتی و ماهواره‌ای',
                    effect: 'افشای کامل خزانه و کلاهک‌ها + افزایش ۱۴٪ شانس اصابت تمام حملات نظامی به این کشور!',
                    costB: 8,
                  },
                  {
                    type: 'BLACKOUT_VIRUS' as CovertOpType,
                    title: '⚡ ۲. ویروس سایبری Blackout و کور کردن رادار',
                    effect: 'رادار دشمن را کور می‌کند (آژیر دفاعی برایش روشن نمی‌شود!) + قطع ۲۵٪ برق شهرها.',
                    costB: 15,
                  },
                  {
                    type: 'TREASURY_HEIST' as CovertOpType,
                    title: '🏦 ۳. سرقت سایبری از بانک مرکزی دشمن',
                    effect: 'هک شبکه بانکی و انتقال مستقیم $22B تا $38B از خزانه این کشور به خزانه شما!',
                    costB: 16,
                  },
                  {
                    type: 'SABOTAGE_ASSASSINATION' as CovertOpType,
                    title: '🎯 ۴. ترور هدفمند و خرابکاری استاکس‌نت',
                    effect: 'عقب انداختن ۲۲٪ برنامه هسته‌ای هدف و کاهش ۲۰٪ قدرت فرماندهی ارتش دشمن.',
                    costB: 22,
                  },
                ] as const
              ).map((cov) => {
                const winPct = estimateCovertSuccessPct(me, target, cov.type);
                return (
                  <div
                    key={cov.type}
                    className="p-3.5 rounded-2xl bg-[#0d172a] border border-purple-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-sm text-white">{cov.title}</span>
                        <span className="px-2 py-0.5 rounded-md bg-purple-500/20 text-purple-200 font-mono text-[11px] font-bold">
                          شانس موفقیت: {winPct}٪
                        </span>
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
              {/* 1-Click Fast Bilateral Deals */}
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
                    دریافت نقدی +${fairOil60Price}B (پاسخ آنی اگر AI باشد!)
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
                    پرداخت ${fairOil60Price}B و تقویت انبار سوخت
                  </div>
                </button>
              </div>

              {/* Buy Indigenous Real Weapons from Target Country */}
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

              {/* Alliance, Sanction & UN */}
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                {!isAlly && (
                  <button
                    type="button"
                    onClick={() =>
                      onProposeTrade({
                        to: target.id,
                        offerType: 'ALLIANCE',
                        amount: 1,
                        priceB: 20,
                        direction: 'PACT',
                      })
                    }
                    className="p-3 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-200 font-bold flex items-center justify-center gap-1.5"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    پیمان دفاعی مشترک ($20B)
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

                <button
                  type="button"
                  onClick={() => onProposeResolution(target.id, 'GLOBAL_SANCTION')}
                  className="p-3 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-200 font-bold col-span-2 flex items-center justify-center gap-1.5"
                >
                  <AlertTriangle className="w-4 h-4" />
                  ثبت قطعنامه تحریم بین‌المللی در شورای امنیت سازمان ملل
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
