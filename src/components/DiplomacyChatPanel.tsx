import React, { useState } from 'react';
import { Send, Globe, Lock, Check, X, Scale } from 'lucide-react';
import { WEAPONS_CATALOG } from '../../shared/realWorldData';
import { CountryId, GameRoomState } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface DiplomacyChatPanelProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  isGM: boolean;
  activeChatTarget: CountryId | 'GLOBAL';
  onChangeChatTarget: (target: CountryId | 'GLOBAL') => void;
  onSendChat: (channel: 'GLOBAL' | 'DIRECT' | 'GM_WHISPER', text: string, toCountry?: CountryId) => void;
  onRespondTrade: (offerId: string, accept: boolean) => void;
  onVoteResolution: (resolutionId: string, vote: 'YES' | 'NO' | 'VETO') => void;
}

export const DiplomacyChatPanel: React.FC<DiplomacyChatPanelProps> = ({
  room,
  myCountryId,
  isGM,
  activeChatTarget,
  onChangeChatTarget,
  onSendChat,
  onRespondTrade,
  onVoteResolution,
}) => {
  const [text, setText] = useState('');
  const me = myCountryId ? room.countries[myCountryId] : null;

  const incomingTrades = room.trades.filter(
    (t) => t.status === 'PENDING' && t.to === myCountryId
  );
  const recentTrades = room.trades.slice(0, 6);
  const activeResolutions = room.resolutions.filter((r) => r.status === 'ACTIVE');

  const filteredMessages = room.messages.filter((m) => {
    if (activeChatTarget === 'GLOBAL') return m.channel === 'GLOBAL';
    if (isGM) {
      return m.fromCountry === activeChatTarget || m.toCountry === activeChatTarget;
    }
    return (
      m.channel !== 'GLOBAL' &&
      ((m.fromCountry === myCountryId && m.toCountry === activeChatTarget) ||
        (m.fromCountry === activeChatTarget && m.toCountry === myCountryId) ||
        (m.channel === 'GM_WHISPER' && m.toCountry === myCountryId))
    );
  });

  const submitMsg = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    if (activeChatTarget === 'GLOBAL') {
      onSendChat('GLOBAL', text);
    } else if (isGM) {
      onSendChat('GM_WHISPER', text, activeChatTarget);
    } else {
      onSendChat('DIRECT', text, activeChatTarget);
    }
    setText('');
  };

  return (
    <div className="space-y-4">
      {/* Incoming Trade Contracts Requiring Signature */}
      {incomingTrades.length > 0 && (
        <div className="bg-emerald-950/30 border border-emerald-500/40 rounded-2xl p-4 space-y-2.5">
          <h3 className="text-sm font-black text-emerald-300">
            📨 پیشنهادهای رسمی روی میز شما ({incomingTrades.length})
          </h3>
          {incomingTrades.map((tr) => {
            const sender = room.countries[tr.from];
            const wName = tr.weaponId ? WEAPONS_CATALOG[tr.weaponId]?.nameFa : '';
            return (
              <div
                key={tr.id}
                className="p-3 rounded-xl bg-[#07101e] border border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs"
              >
                <div>
                  <span className="font-bold text-white">
                    از طرف {sender.flag} {sender.nameFa}:{' '}
                  </span>
                  <span className="text-slate-200">
                    {tr.offerType === 'ALLIANCE'
                      ? `پیشنهاد پیمان دفاعی مشترک (+$${tr.priceB}B)`
                      : tr.offerType === 'WEAPON'
                      ? `درخواست خرید ${tr.amount}× «${wName}» در قبال $${tr.priceB}B`
                      : `${tr.direction === 'SELL' ? 'فروش' : 'خرید'} ${tr.amount} واحد ${tr.offerType} به مبلغ $${tr.priceB}B`}
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

      {/* Active UN Security Council Resolutions */}
      {activeResolutions.length > 0 && (
        <div className="bg-[#0b1324] border border-amber-500/35 rounded-2xl p-4 space-y-2.5">
          <h3 className="text-sm font-black text-amber-300 flex items-center gap-1.5">
            <Scale className="w-4 h-4" />
            قطعنامه‌های در حال رای‌گیری شورای امنیت سازمان ملل
          </h3>
          {activeResolutions.map((res) => (
            <div
              key={res.id}
              className="p-3 rounded-xl bg-[#070d19] border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div>
                <div className="font-bold text-white">{res.titleFa}</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  موافق: {res.votesYes.length} کشور • مخالف: {res.votesNo.length} کشور
                </div>
              </div>
              {me && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onVoteResolution(res.id, 'YES')}
                    className="px-2.5 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                  >
                    👍 موافق
                  </button>
                  <button
                    type="button"
                    onClick={() => onVoteResolution(res.id, 'NO')}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 border border-slate-700 font-bold"
                  >
                    👎 مخالف
                  </button>
                  {me.isUNVetoMember && (
                    <button
                      type="button"
                      onClick={() => onVoteResolution(res.id, 'VETO')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-black"
                    >
                      🛑 وتو (VETO)
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Diplomatic Messenger */}
      <div className="bg-[#0b1324] border border-slate-800 rounded-2xl overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[380px]">
        {/* Channel Selector */}
        <div className="border-b md:border-b-0 md:border-l border-slate-800 p-3 space-y-1.5 max-h-[170px] md:max-h-[420px] overflow-y-auto bg-[#070d19]">
          <button
            type="button"
            onClick={() => onChangeChatTarget('GLOBAL')}
            className={`w-full px-3 py-2.5 rounded-xl text-right text-xs font-bold flex items-center gap-2 ${
              activeChatTarget === 'GLOBAL'
                ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-200'
                : 'text-slate-300 hover:bg-slate-800/60'
            }`}
          >
            <Globe className="w-4 h-4 text-emerald-400 shrink-0" />
            مجمع عمومی جهان (علنی)
          </button>

          <div className="text-[10px] font-bold text-slate-500 px-2 pt-2">
            🔒 خط قرمز محرمانه با کشورها:
          </div>

          {Object.values(room.countries)
            .filter((c) => c.id !== myCountryId)
            .map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onChangeChatTarget(c.id)}
                className={`w-full px-3 py-2 rounded-xl text-right text-xs flex items-center justify-between ${
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
                  <span className="text-[10px] text-slate-500">AI</span>
                )}
              </button>
            ))}
        </div>

        {/* Chat Conversation Area */}
        <div className="md:col-span-2 flex flex-col justify-between h-[340px] md:h-[420px]">
          <div className="px-4 py-2.5 border-b border-slate-800 bg-[#08101f] flex items-center justify-between text-xs">
            {activeChatTarget === 'GLOBAL' ? (
              <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                <Globe className="w-4 h-4" /> تالار رسمی سازمان ملل (همه کشورها می‌بینند)
              </span>
            ) : (
              <span className="font-bold text-cyan-300 flex items-center gap-1.5">
                <Lock className="w-4 h-4" /> خط رمزنگاری‌شده محرمانه با{' '}
                {room.countries[activeChatTarget]?.flag} {room.countries[activeChatTarget]?.nameFa}
              </span>
            )}
          </div>

          <div className="flex-1 p-3.5 overflow-y-auto space-y-2.5">
            {filteredMessages.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center px-4">
                هنوز پیامی رد و بدل نشده است. مذاکره، بلوف سیاسی یا پیشنهاد ائتلاف را آغاز کنید!
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
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                        m.channel === 'GM_WHISPER'
                          ? 'bg-amber-500/20 border border-amber-400/50 text-amber-100'
                          : mine
                          ? 'bg-emerald-500/20 border border-emerald-500/35 text-slate-100'
                          : 'bg-[#111d35] border border-slate-700 text-slate-200'
                      }`}
                    >
                      <div className="text-[10px] font-bold text-cyan-300 mb-0.5">{m.fromName}</div>
                      <p>{m.text}</p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form onSubmit={submitMsg} className="p-3 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                activeChatTarget === 'GLOBAL'
                  ? 'صدور بیانیه رسمی در مجمع عمومی جهان...'
                  : 'ارسال پیام محرمانه مستقیم...'
              }
              className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#060b14] border border-slate-700 focus:border-emerald-400 focus:outline-none text-xs text-white"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5"
            >
              <Send className="w-4 h-4" />
              ارسال
            </button>
          </form>
        </div>
      </div>

      {/* Recent Diplomatic & Trade Log */}
      {recentTrades.length > 0 && (
        <div className="bg-[#0b1324] border border-slate-800 rounded-2xl p-4 space-y-2">
          <h4 className="text-xs font-bold text-slate-300">📜 آخرین پاسخ‌های تجاری و تسلیحاتی شما</h4>
          <div className="space-y-1.5">
            {recentTrades.map((t) => (
              <div
                key={t.id}
                className="px-3 py-2 rounded-xl bg-[#070d19] border border-slate-800/80 flex items-center justify-between gap-2 text-xs"
              >
                <span className="text-slate-300">
                  {room.countries[t.from].flag} ← {room.countries[t.to].flag}:{' '}
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
                  {t.status === 'ACCEPTED' ? 'تایید شد' : t.status === 'REJECTED' ? 'رد شد' : 'در انتظار'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
