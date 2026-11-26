import React, { useState } from 'react';
import { Send, Globe, Lock, Check, X, Scale, Shield, Plus } from 'lucide-react';
import { WEAPONS_CATALOG } from '../../shared/realWorldData';
import { CountryId, GameRoomState, ResolutionKind } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

export type ChatTargetSelection = CountryId | 'GLOBAL' | 'COALITION';

interface DiplomacyChatPanelProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  isGM: boolean;
  activeChatTarget: ChatTargetSelection;
  onChangeChatTarget: (target: ChatTargetSelection) => void;
  onSendChat: (
    channel: 'GLOBAL' | 'COALITION' | 'DIRECT' | 'GM_WHISPER',
    text: string,
    toCountry?: CountryId
  ) => void;
  onRespondTrade: (offerId: string, accept: boolean) => void;
  onVoteResolution: (resolutionId: string, vote: 'YES' | 'NO' | 'VETO') => void;
  onProposeResolution: (target: CountryId, kind: ResolutionKind) => void;
  onCreateCoalition: (nameFa: string) => void;
  onJoinCoalition: (coalitionId: string) => void;
}

const QUICK_CABLES = [
  '🤝 پیشنهاد صلح و پیمان عدم تعرض متقابل داریم.',
  '⚠️ اولتیماتوم رسمی: هرگونه حمله به منافع ما با پاسخ موشکی روبرو می‌شود!',
  '🛢️ آماده فروش نفت و گاز یا معامله تسلیحاتی با شرایط ویژه هستیم.',
  '🛡️ اعضای ائتلاف! برای دفاع مشترک و رای‌گیری سازمان ملل هماهنگ شوید.',
];

export const DiplomacyChatPanel: React.FC<DiplomacyChatPanelProps> = ({
  room,
  myCountryId,
  isGM,
  activeChatTarget,
  onChangeChatTarget,
  onSendChat,
  onRespondTrade,
  onVoteResolution,
  onProposeResolution,
  onCreateCoalition,
  onJoinCoalition,
}) => {
  const [text, setText] = useState('');
  const [newCoalitionName, setNewCoalitionName] = useState('');
  const [showCoalitions, setShowCoalitions] = useState(false);

  const me = myCountryId ? room.countries[myCountryId] : null;
  const myCoalition = me?.coalitionId ? room.coalitions[me.coalitionId] : null;

  const incomingTrades = room.trades.filter(
    (t) => t.status === 'PENDING' && t.to === myCountryId
  );
  const recentTrades = room.trades.slice(0, 5);
  const activeResolutions = room.resolutions.filter((r) => r.status === 'ACTIVE');

  const filteredMessages = room.messages.filter((m) => {
    if (activeChatTarget === 'GLOBAL') return m.channel === 'GLOBAL';
    if (activeChatTarget === 'COALITION') return m.channel === 'COALITION';
    if (isGM) {
      return m.fromCountry === activeChatTarget || m.toCountry === activeChatTarget;
    }
    return (
      m.channel !== 'GLOBAL' &&
      m.channel !== 'COALITION' &&
      ((m.fromCountry === myCountryId && m.toCountry === activeChatTarget) ||
        (m.fromCountry === activeChatTarget && m.toCountry === myCountryId) ||
        (m.channel === 'GM_WHISPER' && m.toCountry === myCountryId))
    );
  });

  const dispatchMessage = (msgText: string) => {
    if (!msgText.trim()) return;
    if (activeChatTarget === 'GLOBAL') {
      onSendChat('GLOBAL', msgText);
    } else if (activeChatTarget === 'COALITION') {
      onSendChat('COALITION', msgText);
    } else if (isGM) {
      onSendChat('GM_WHISPER', msgText, activeChatTarget);
    } else {
      onSendChat('DIRECT', msgText, activeChatTarget);
    }
  };

  const submitMsg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    dispatchMessage(text);
    setText('');
  };

  return (
    <div className="space-y-3.5">
      {/*Coalitions & Special OPEC/UN Summits Bar*/}
      {me && !me.isEliminated && (
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-3.5 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              {myCoalition ? `ائتلاف فعلی شما: «${myCoalition.nameFa}»` : 'شما هنوز عضو ائتلاف چندجانبه نیستید'}
            </div>
            <button
              type="button"
              onClick={() => setShowCoalitions((v) => !v)}
              className="px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/35 text-cyan-200 text-xs font-bold"
            >
              {showCoalitions ? 'بستن مدیریت ائتلاف‌ها و کمیته‌ها' : '🛡️ ائتلاف‌ها و کمیته اوپک/سازمان ملل'}
            </button>
          </div>

          {showCoalitions && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              {/* Existing Coalitions */}
              <div className="space-y-1.5">
                {Object.values(room.coalitions).map((coal) => {
                  const isMember = coal.members.includes(me.id);
                  return (
                    <div
                      key={coal.id}
                      className="p-2.5 rounded-xl bg-[#070d19] border border-slate-800 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <div className="font-bold text-white">{coal.nameFa}</div>
                        <div className="flex flex-wrap items-center gap-1 mt-1">
                          {coal.members.map((mId) => (
                            <span
                              key={mId}
                              className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-200 flex items-center gap-1"
                            >
                              <CountryFlag countryId={mId} size="sm" />
                              {room.countries[mId]?.nameFa}
                            </span>
                          ))}
                        </div>
                      </div>
                      {!isMember ? (
                        <button
                          type="button"
                          onClick={() => onJoinCoalition(coal.id)}
                          className="px-3 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black shrink-0"
                        >
                          پیوستن
                        </button>
                      ) : (
                        <span className="text-emerald-300 font-bold text-[11px] shrink-0">عضو رسمی ✓</span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Create Custom Coalition */}
              <div className="flex gap-2">
                <input
                  type="text"
                  maxLength={32}
                  value={newCoalitionName}
                  onChange={(e) => setNewCoalitionName(e.target.value)}
                  placeholder="نام ائتلاف جدید (مثلاً: پیمان خلیج فارس)..."
                  className="flex-1 px-3 py-2 rounded-xl bg-[#060b14] border border-slate-700 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newCoalitionName.trim()) return;
                    onCreateCoalition(newCoalitionName);
                    setNewCoalitionName('');
                  }}
                  className="px-3 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" /> تاسیس ($25B)
                </button>
              </div>

              {/* Global Economic / OPEC Committees */}
              <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                <button
                  type="button"
                  onClick={() => onProposeResolution(me.id, 'OPEC_OIL_CUT')}
                  className="p-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/35 text-amber-200 font-bold text-right"
                >
                  🛢️ تشکیل کمیته اوپک‌پلاس: افزایش قیمت نفت (+$22)
                </button>
                <button
                  type="button"
                  onClick={() => onProposeResolution(me.id, 'OPEC_OIL_BOOST')}
                  className="p-2.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-200 font-bold text-right"
                >
                  📉 تشکیل کمیته انرژی: کاهش قیمت نفت (-$18)
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Incoming Trade Contracts */}
      {incomingTrades.length > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-3.5 space-y-2">
          <h3 className="text-xs sm:text-sm font-black text-emerald-300">
            📨 قراردادهای منتظر امضای شما ({incomingTrades.length})
          </h3>
          {incomingTrades.map((tr) => {
            const sender = room.countries[tr.from];
            const wName = tr.weaponId ? WEAPONS_CATALOG[tr.weaponId]?.nameFa : '';
            return (
              <div
                key={tr.id}
                className="p-3 rounded-xl bg-[#07101e] border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <CountryFlag countryId={sender.id} size="sm" />
                  <span className="font-bold text-white">از طرف {sender.nameFa}:</span>
                  <span className="text-slate-200">
                    {tr.offerType === 'ALLIANCE'
                      ? `پیشنهاد پیمان دفاعی مشترک (+$${tr.priceB}B)`
                      : tr.offerType === 'WEAPON'
                      ? `${tr.direction === 'SELL' ? 'پیشنهاد فروش' : 'درخواست خرید'} ${tr.amount}× «${wName}» ($${tr.priceB}B)`
                      : `${tr.direction === 'SELL' ? 'فروش' : 'خرید'} ${tr.amount} واحد ${tr.offerType} ($${tr.priceB}B)`}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => onRespondTrade(tr.id, true)}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black flex items-center gap-1"
                  >
                    <Check className="w-3.5 h-3.5" /> امضا
                  </button>
                  <button
                    type="button"
                    onClick={() => onRespondTrade(tr.id, false)}
                    className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold flex items-center gap-1"
                  >
                    <X className="w-3.5 h-3.5" /> رد
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Active UN & Special Committee Votes */}
      {activeResolutions.length > 0 && (
        <div className="bg-[#0b1324] border border-amber-500/35 rounded-2xl p-3.5 space-y-2.5">
          <h3 className="text-xs sm:text-sm font-black text-amber-300 flex items-center gap-1.5">
            <Scale className="w-4 h-4" />
            جلسات و رای‌گیری‌های فعال بین‌المللی ({activeResolutions.length})
          </h3>
          {activeResolutions.map((res) => {
            const canVeto =
              Boolean(me?.isUNVetoMember) &&
              (res.kind === 'GLOBAL_SANCTION' ||
                res.kind === 'CONDEMN_AGGRESSION' ||
                res.kind === 'IAEA_INSPECTION');

            return (
              <div
                key={res.id}
                className="p-3 rounded-xl bg-[#070d19] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <span className="text-[10px] font-bold text-amber-300">{res.committeeFa}</span>
                  <div className="font-bold text-white">{res.titleFa}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{res.effectSummaryFa}</div>
                  <div className="text-[11px] text-cyan-300 mt-1 font-mono">
                    موافق: {res.votesYes.length} کشور • مخالف: {res.votesNo.length} کشور
                  </div>
                </div>
                {me && !me.isEliminated && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onVoteResolution(res.id, 'YES')}
                      className={`px-2.5 py-1.5 rounded-lg border font-bold ${
                        res.votesYes.includes(me.id)
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      }`}
                    >
                      👍 موافق
                    </button>
                    <button
                      type="button"
                      onClick={() => onVoteResolution(res.id, 'NO')}
                      className={`px-2.5 py-1.5 rounded-lg border font-bold ${
                        res.votesNo.includes(me.id)
                          ? 'bg-rose-500 text-white border-rose-400'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      👎 مخالف
                    </button>
                    {canVeto && (
                      <button
                        type="button"
                        onClick={() => onVoteResolution(res.id, 'VETO')}
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black"
                      >
                        🛑 وتو
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Diplomatic Messenger */}
      <div className="bg-[#0b1324] border border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[390px]">
        {/* Channel Selector */}
        <div className="border-b md:border-b-0 md:border-l border-slate-800 p-2.5 space-y-1.5 max-h-[165px] md:max-h-[430px] overflow-y-auto bg-[#070d19]">
          <button
            type="button"
            onClick={() => onChangeChatTarget('GLOBAL')}
            className={`w-full px-3 py-2 rounded-xl text-right text-xs font-bold flex items-center gap-2 ${
              activeChatTarget === 'GLOBAL'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            مجمع عمومی جهان
          </button>

          {myCoalition && (
            <button
              type="button"
              onClick={() => onChangeChatTarget('COALITION')}
              className={`w-full px-3 py-2 rounded-xl text-right text-xs font-bold flex items-center gap-2 ${
                activeChatTarget === 'COALITION'
                  ? 'bg-purple-500/20 border border-purple-500/40 text-purple-200'
                  : 'text-slate-300 hover:bg-slate-800/60'
              }`}
            >
              <Shield className="w-4 h-4 text-purple-400 shrink-0" />
              اتاق ائتلاف ({myCoalition.members.length})
            </button>
          )}

          <div className="text-[10px] font-bold text-slate-500 px-2 pt-1.5">
            🔒 خط محرمانه با کشورها (ربات و بازیکن):
          </div>

          {Object.values(room.countries)
            .filter((c) => c.id !== myCountryId && !c.isEliminated)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChangeChatTarget(c.id)}
                className={`w-full px-2.5 py-2 rounded-xl text-right text-xs flex items-center justify-between ${
                  activeChatTarget === c.id
                    ? 'bg-cyan-500/20 border border-cyan-500/40 text-white font-bold'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <span className="truncate flex items-center gap-1.5">
                  <CountryFlag countryId={c.id} size="sm" /> {c.nameFa} {c.playerName ? `(${c.playerName})` : ''}
                </span>
                {c.playerId ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                ) : (
                  <span className="text-[9px] text-indigo-300">پاسخگو</span>
                )}
              </button>
            ))}
        </div>

        {/* Chat Area */}
        <div className="md:col-span-2 flex flex-col justify-between h-[360px] md:h-[430px]">
          <div className="px-4 py-2.5 border-b border-slate-800 bg-[#08101f] flex items-center justify-between text-xs">
            {activeChatTarget === 'GLOBAL' ? (
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> تالار رسمی سازمان ملل (همه کشورها می‌بینند)
              </span>
            ) : activeChatTarget === 'COALITION' ? (
              <span className="font-bold text-purple-300 flex items-center gap-1.5">
                <Shield className="w-4 h-4" /> اتاق رمزنگاری‌شده اعضای «{myCoalition?.nameFa}»
              </span>
            ) : (
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> خط مستقیم با{' '}
                <CountryFlag countryId={activeChatTarget} size="sm" /> {room.countries[activeChatTarget]?.nameFa}
              </span>
            )}
          </div>

          <div className="flex-1 p-3 overflow-y-auto space-y-2">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-4">
                پیام یا تلگراف سریع بفرستید؛ حتی کشورهای تحت کنترل هوش مصنوعی نیز به صورت زنده پاسخ دیپلماتیک می‌دهند!
              </div>
            ) : (
              filteredMessages.map((m) => {
                const mine =
                  (isGM && m.fromCountry === 'GM') ||
                  (!isGM && m.fromCountry === myCountryId);
                return (
                  <div
                    key={m.id}
                    className={`flex flex-col ${mine ? 'items-start' : 'items-end'}`}
                  >
                    <div
                      className={`max-w-[86%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        m.channel === 'GM_WHISPER'
                          ? 'bg-amber-500/20 border border-amber-400/50 text-amber-100'
                          : mine
                          ? 'bg-emerald-500/20 border border-emerald-500/35 text-slate-100'
                          : 'bg-[#111d35] border border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-cyan-300 mb-0.5 flex items-center gap-1.5">
                        {m.fromCountry !== 'GM' && <CountryFlag countryId={m.fromCountry} size="sm" />}
                        <span>{m.fromName}</span>
                      </div>
                      <p>{m.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* 1-Click Quick Diplomatic Cables */}
          <div className="px-2.5 py-1.5 border-t border-slate-800/80 bg-[#070d19] flex gap-1.5 overflow-x-auto text-[10px]">
            {QUICK_CABLES.map((cbl, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => dispatchMessage(cbl)}
                className="px-2.5 py-1 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 whitespace-nowrap shrink-0"
              >
                {cbl.slice(0, 28)}...
              </button>
            ))}
          </div>

          <form onSubmit={submitMsg} className="p-2.5 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                activeChatTarget === 'GLOBAL'
                  ? 'صدور بیانیه رسمی در مجمع عمومی...'
                  : activeChatTarget === 'COALITION'
                  ? 'پیام محرمانه به اعضای ائتلاف...'
                  : 'ارسال پیام محرمانه دوجانبه...'
              }
              className="flex-1 px-3 py-2 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-xs text-white"
            />
            <button
              type="submit"
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1"
            >
              <Send className="w-4 h-4" />
              ارسال
            </button>
          </form>
        </div>
      </div>

      {/* Recent Trade Log */}
      {recentTrades.length > 0 && (
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-3.5 space-y-2">
          <h4 className="text-xs font-bold text-slate-300">📜 آخرین سوابق قراردادهای شما</h4>
          <div className="space-y-1.5">
            {recentTrades.map((t) => (
              <div
                key={t.id}
                className="px-3 py-2 rounded-xl bg-[#070d19] border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <CountryFlag countryId={t.from} size="sm" /> ← <CountryFlag countryId={t.to} size="sm" />:{' '}
                  {t.responseReasonFa || `پیشنهاد ${t.offerType} ($${t.priceB}B)`}
                </span>
                <span
                  className={`px-2 py-0.5 rounded font-bold text-[10px] shrink-0 ${
                    t.status === 'ACCEPTED'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : t.status === 'REJECTED'
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {t.status === 'ACCEPTED' ? 'امضا شد' : t.status === 'REJECTED' ? 'رد شد' : 'در انتظار'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
