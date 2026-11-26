import React, { useState } from 'react';
import { X, Lock, Eye, Zap, RefreshCw } from 'lucide-react';
import { ALL_COUNTRY_IDS } from '../../shared/realWorldData';
import { CountryId, CreatorCheatPayload, GameRoomState } from '../../shared/types';
import { CountryFlag } from './CountryFlag';

interface SecretCheatModalProps {
  myCountryId: CountryId | null;
  onClose: () => void;
  onInspect: (
    secretKey: string,
    cb: (res: { ok: boolean; fullRoom?: GameRoomState; errorFa?: string }) => void
  ) => void;
  onExecCheat: (
    payload: CreatorCheatPayload,
    cb: (res: { ok: boolean; messageFa?: string; fullRoom?: GameRoomState; errorFa?: string }) => void
  ) => void;
}

export const SecretCheatModal: React.FC<SecretCheatModalProps> = ({
  myCountryId,
  onClose,
  onInspect,
  onExecCheat,
}) => {
  const [secretKey, setSecretKey] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [fullRoom, setFullRoom] = useState<GameRoomState | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryId>(myCountryId || 'IR');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    onInspect(secretKey, (res) => {
      if (!res.ok || !res.fullRoom) {
        setStatusMsg(res.errorFa || 'رمز عبور اشتباه است.');
        return;
      }
      setUnlocked(true);
      setFullRoom(res.fullRoom);
      setStatusMsg(null);
    });
  };

  const runCheat = (partial: Omit<CreatorCheatPayload, 'secretKey' | 'targetCountry'>) => {
    onExecCheat(
      {
        secretKey,
        targetCountry: selectedCountry,
        ...partial,
      },
      (res) => {
        setStatusMsg(res.messageFa || res.errorFa || null);
        if (res.fullRoom) setFullRoom(res.fullRoom);
      }
    );
  };

  const refreshSpy = () => {
    onInspect(secretKey, (res) => {
      if (res.ok && res.fullRoom) setFullRoom(res.fullRoom);
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-4xl max-h-[92vh] bg-[#060b16] border border-emerald-500/40 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-3.5 bg-[#040811] border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
            <Lock className="w-4 h-4" />
            <span>کنسول فوق‌محرمانه سازنده (God Mode & Spy View)</span>
          </div>
          <div className="flex items-center gap-2">
            {unlocked && (
              <button
                type="button"
                onClick={refreshSpy}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300"
                title="بروزرسانی اطلاعات زنده"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {!unlocked ? (
          <form onSubmit={handleUnlock} className="p-6 space-y-4 max-w-md mx-auto w-full">
            <p className="text-xs text-slate-400 text-center">
              کد دسترسی اختصاصی سازنده را وارد کنید (هیچ‌یک از بازیکنان دیگر متوجه باز شدن این پنل نمی‌شوند):
            </p>
            {statusMsg && (
              <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs text-center">
                {statusMsg}
              </div>
            )}
            <input
              type="password"
              autoFocus
              value={secretKey}
              onChange={(e) => setSecretKey(e.target.value)}
              placeholder="Creator Master Key..."
              dir="ltr"
              className="w-full px-4 py-3 rounded-xl bg-[#091224] border border-slate-700 focus:border-emerald-400 focus:outline-none text-center font-mono text-white"
            />
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm"
            >
              بازگشایی کنسول سازنده
            </button>
          </form>
        ) : (
          <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
            {statusMsg && (
              <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-bold">
                {statusMsg}
              </div>
            )}

            {/* Target Country Selector & Silent Cheats */}
            <div className="p-4 rounded-2xl bg-[#0a1326] border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                  <Zap className="w-4 h-4" /> اعمال تغییرات مخفی بدون ثبت در اخبار عمومی:
                </span>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value as CountryId)}
                  className="px-3 py-1.5 rounded-xl bg-[#050a14] border border-slate-700 text-xs font-bold text-white"
                >
                  {ALL_COUNTRY_IDS.map((cid) => {
                    const c = fullRoom?.countries[cid];
                    return (
                      <option key={cid} value={cid}>
                        {c?.nameFa || cid} {c?.playerName ? `(${c.playerName})` : '(AI)'}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'ADD_RESOURCES', treasuryDelta: 250 })}
                  className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200"
                >
                  💰 +$250B خزانه
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'ADD_RESOURCES', treasuryDelta: 1000 })}
                  className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200"
                >
                  💎 +$1000B خزانه
                </button>
                <button
                  type="button"
                  onClick={() =>
                    runCheat({
                      action: 'ADD_RESOURCES',
                      oilDelta: 200,
                      foodDelta: 200,
                      waterDelta: 200,
                    })
                  }
                  className="p-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200"
                >
                  🛢️ +۲۰۰ نفت، غذا و آب
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'ADD_RESOURCES', warheadsDelta: 3 })}
                  className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200"
                >
                  ☢️ +۳ کلاهک هسته‌ای
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'SET_DOCTRINES_MAX' })}
                  className="p-2.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200"
                >
                  🌟 فول کردن دکترین‌ها (Lv.10)
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'HEAL_ALL' })}
                  className="p-2.5 rounded-xl bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/40 text-teal-200"
                >
                  💚 بازسازی ۱۰۰٪ و رفع بحران
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'ADD_ELITE_ARMY' })}
                  className="p-2.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-200"
                >
                  🎖️ تزریق ارتش نخبه کامل
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'REVIVE_COUNTRY' })}
                  className="p-2.5 rounded-xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200"
                >
                  🔄 احیای کشور سقوط‌کرده
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'FORCE_COLLAPSE' })}
                  className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 col-span-2"
                >
                  💥 سقوط فوری دولت هدف
                </button>
                <button
                  type="button"
                  onClick={() => runCheat({ action: 'FORCE_NEXT_ROUND' })}
                  className="p-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black col-span-2"
                >
                  ⏭️ اجرای فوری پایان ماه
                </button>
              </div>
            </div>

            {/* Unmasked Real-Time Spy Table of All Players & Secret Orders */}
            {fullRoom && (
              <div className="space-y-2">
                <h3 className="text-xs font-black text-cyan-300 flex items-center gap-1.5">
                  <Eye className="w-4 h-4" /> اشراف کامل بدون مه جنگ بر تمام کشورها و عملیات‌های مخفی این ماه:
                </h3>
                <div className="overflow-x-auto rounded-2xl border border-slate-800">
                  <table className="w-full text-right text-xs bg-[#08101e]">
                    <thead className="bg-[#050a14] text-slate-400 border-b border-slate-800">
                      <tr>
                        <th className="p-2.5">کشور</th>
                        <th className="p-2.5">خزانه واقعی</th>
                        <th className="p-2.5">نفت / غذا / آب</th>
                        <th className="p-2.5">کلاهک</th>
                        <th className="p-2.5">رضایت / ویرانی</th>
                        <th className="p-2.5">عملیات‌های ثبت‌شده این ماه</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/70">
                      {Object.values(fullRoom.countries).map((c) => (
                        <tr key={c.id} className={c.playerId ? 'bg-emerald-500/5' : ''}>
                          <td className="p-2.5 font-bold text-white flex items-center gap-1.5">
                            <CountryFlag countryId={c.id} size="sm" />
                            <span>{c.nameFa}</span>
                            {c.playerName && (
                              <span className="text-[10px] text-amber-300">({c.playerName})</span>
                            )}
                          </td>
                          <td className="p-2.5 font-mono text-emerald-300 font-bold">${c.treasuryB}B</td>
                          <td className="p-2.5 font-mono text-slate-300">
                            {c.oilReserve} / {c.foodReserve} / {c.waterReserve || 0}
                          </td>
                          <td className="p-2.5 font-mono text-rose-300 font-bold">{c.warheads}</td>
                          <td className="p-2.5 font-mono">
                            <span className="text-cyan-300">{c.approval}٪</span> /{' '}
                            <span className="text-rose-400">{c.devastation}٪</span>
                          </td>
                          <td className="p-2.5 text-[11px] text-amber-200">
                            {c.orders.length === 0
                              ? '—'
                              : c.orders.map((o) => o.summaryFa).join(' | ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
