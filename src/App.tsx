import React, { useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Globe2,
  Building2,
  MessageSquare,
  Tv,
  Mic,
  Volume2,
  VolumeX,
  CheckCircle2,
  Clock,
  Share2,
  LogOut,
  Radio,
} from 'lucide-react';
import { computeEconomyProjection } from '../shared/advisor';
import {
  AlertPosture,
  ChokepointStatus,
  CountryId,
  CovertOpType,
  DifficultyLevel,
  EmergencyActionKind,
  GameMode,
  GameRoomState,
  GameSettings,
  GMMode,
  InfrastructureType,
  MilitaryOpType,
  MinorNationOpType,
  ResolutionKind,
  StrikeTargetSector,
  TradeResourceKind,
  UpgradeTrack,
} from '../shared/types';
import { CountryFlag } from './components/CountryFlag';
import { ChatTargetSelection, DiplomacyChatPanel } from './components/DiplomacyChatPanel';
import { GMControlPanel } from './components/GMControlPanel';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { MinorNationDrawer } from './components/MinorNationDrawer';
import { MyCountryPanel } from './components/MyCountryPanel';
import { NewsAndRankingsPanel } from './components/NewsAndRankingsPanel';
import { RadarAlertModal } from './components/RadarAlertModal';
import { RoundSummaryModal } from './components/RoundSummaryModal';
import { DrawerTab, TargetCountryDrawer } from './components/TargetCountryDrawer';
import { WorldMap } from './components/WorldMap';
import { sound } from './utils/sound';

function getOrCreatePlayerId(): string {
  try {
    let id = localStorage.getItem('ww3_player_id');
    if (!id) {
      id = `cmdr-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
      localStorage.setItem('ww3_player_id', id);
    }
    return id;
  } catch {
    return `cmdr-${Math.random().toString(36).slice(2, 10)}`;
  }
}

type MainTab = 'MAP' | 'COUNTRY' | 'DIPLOMACY' | 'NEWS' | 'GM';

export const App: React.FC = () => {
  const playerId = useMemo(() => getOrCreatePlayerId(), []);
  const urlRoom = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || '').toUpperCase();
  }, []);

  const [defaultName] = useState<string>(() => {
    try {
      return localStorage.getItem('ww3_player_name') || '';
    } catch {
      return '';
    }
  });

  const socketRef = useRef<Socket | null>(null);
  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [muted, setMuted] = useState(() => sound.isMuted());
  const [nowMs, setNowMs] = useState(() => Date.now());

  const [mobileTab, setMobileTab] = useState<MainTab>('MAP');
  const [desktopSideTab, setDesktopSideTab] = useState<Exclude<MainTab, 'MAP'>>('COUNTRY');
  const [drawerTarget, setDrawerTarget] = useState<{ countryId: CountryId; tab: DrawerTab } | null>(null);
  const [minorDrawerId, setMinorDrawerId] = useState<string | null>(null);
  const [activeChatTarget, setActiveChatTarget] = useState<ChatTargetSelection>('GLOBAL');

  const showToast = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ text, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 3800);
  };

  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('room:state', (nextRoom: GameRoomState) => {
      setRoom(nextRoom);
      setBusy(false);
      try {
        localStorage.setItem('ww3_saved_room', nextRoom.roomCode);
      } catch {
        // ignore
      }
    });

    socket.on('room:sound', (ev: { type: string }) => {
      if (ev.type === 'RADAR_SIREN') {
        sound.playRadarSiren();
      } else if (ev.type === 'TACTICAL_PING') {
        sound.playRadarPing();
      } else if (ev.type === 'ROUND_RESOLVED' || ev.type === 'GM_CHIME' || ev.type === 'GAME_START') {
        sound.playNewsChime();
      }
    });

    socket.on('connect', () => {
      try {
        const savedRoom = urlRoom || localStorage.getItem('ww3_saved_room');
        const savedName = localStorage.getItem('ww3_player_name');
        if (savedRoom && savedName) {
          socket.emit('lobby:join', {
            roomCode: savedRoom,
            playerId,
            playerName: savedName,
          });
        }
      } catch {
        // ignore
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [playerId, urlRoom]);

  const mePlayer = room?.players.find((p) => p.id === playerId) || null;
  const myCountryId = mePlayer?.countryId || null;
  const myCountry = room && myCountryId ? room.countries[myCountryId] : null;
  const isGM = Boolean(mePlayer?.isGM);

  useEffect(() => {
    if (isGM) {
      setDesktopSideTab('GM');
    } else if (desktopSideTab === 'GM') {
      setDesktopSideTab('COUNTRY');
    }
  }, [isGM]);

  const handleCreateLobby = (opts: {
    playerName: string;
    roomName: string;
    gameMode: GameMode;
    difficulty: DifficultyLevel;
    gmMode: GMMode;
    maxRounds: number;
    planningTimerSec: number;
  }) => {
    if (!socketRef.current) return;
    setBusy(true);
    setErrorFa(null);
    try {
      localStorage.setItem('ww3_player_name', opts.playerName);
    } catch {
      // ignore
    }
    socketRef.current.emit(
      'lobby:create',
      {
        playerId,
        playerName: opts.playerName,
        roomName: opts.roomName,
        settings: {
          gameMode: opts.gameMode,
          difficulty: opts.difficulty,
          gmMode: opts.gmMode,
          maxRounds: opts.maxRounds,
          planningTimerSec: opts.planningTimerSec,
          enableAINations: true,
        },
      },
      (res: { ok: boolean; roomCode?: string; errorFa?: string }) => {
        setBusy(false);
        if (!res.ok) setErrorFa(res.errorFa || 'خطا در ساخت لابی');
      }
    );
  };

  const handleJoinLobby = (opts: { playerName: string; roomCode: string }) => {
    if (!socketRef.current) return;
    setBusy(true);
    setErrorFa(null);
    try {
      localStorage.setItem('ww3_player_name', opts.playerName);
    } catch {
      // ignore
    }
    socketRef.current.emit(
      'lobby:join',
      {
        playerId,
        playerName: opts.playerName,
        roomCode: opts.roomCode,
      },
      (res: { ok: boolean; errorFa?: string }) => {
        setBusy(false);
        if (!res.ok) setErrorFa(res.errorFa || 'کد لابی یافت نشد.');
      }
    );
  };

  const handleLeaveRoom = () => {
    try {
      localStorage.removeItem('ww3_saved_room');
    } catch {
      // ignore
    }
    window.history.replaceState({}, '', window.location.pathname);
    setRoom(null);
  };

  if (!room) {
    return (
      <LandingScreen
        initialRoomCode={urlRoom}
        defaultPlayerName={defaultName}
        errorFa={errorFa}
        busy={busy}
        onCreateLobby={handleCreateLobby}
        onJoinLobby={handleJoinLobby}
      />
    );
  }

  if (room.phase === 'LOBBY') {
    return (
      <LobbyScreen
        room={room}
        playerId={playerId}
        errorFa={errorFa}
        onLeaveLobby={handleLeaveRoom}
        onSelectRole={(countryId, asGM) => {
          setErrorFa(null);
          socketRef.current?.emit(
            'lobby:select_role',
            { countryId, asGM },
            (res: { ok: boolean; errorFa?: string }) => {
              if (!res.ok && res.errorFa) setErrorFa(res.errorFa);
            }
          );
        }}
        onUpdateSettings={(partial: Partial<GameSettings>) => {
          socketRef.current?.emit('lobby:update_settings', partial);
        }}
        onStartGame={() => {
          socketRef.current?.emit('lobby:start', (res: { ok: boolean; errorFa?: string }) => {
            if (!res.ok && res.errorFa) setErrorFa(res.errorFa);
          });
        }}
      />
    );
  }

  const latestBreaking = room.news[0];
  const secondsLeft = room.phaseEndsAt ? Math.max(0, Math.ceil((room.phaseEndsAt - nowMs) / 1000)) : null;
  const activeHumanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && c.isOnline && !c.isEliminated
  );
  const readyHumansCount = activeHumanCountries.filter((c) => c.isReady).length;
  const pendingTradesForMe = room.trades.filter((t) => t.status === 'PENDING' && t.to === myCountryId).length;
  const econ = myCountry
    ? computeEconomyProjection(myCountry, room.market, room.chokepoints, room.minorNations)
    : null;

  const handleSelectCountryOnMap = (cid: CountryId) => {
    setMinorDrawerId(null);
    if (cid === myCountryId) {
      setDrawerTarget(null);
      setMobileTab('COUNTRY');
      setDesktopSideTab('COUNTRY');
    } else {
      setDrawerTarget({ countryId: cid, tab: 'WAR' });
    }
  };

  const handleSelectMinorOnMap = (minorId: string) => {
    setDrawerTarget(null);
    setMinorDrawerId(minorId);
  };

  const handleQueueOrder = (draft: {
    kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION' | 'MINOR_NATION_OPERATION';
    targetCountry?: CountryId;
    targetMinorId?: string;
    militaryType?: MilitaryOpType;
    targetSector?: StrikeTargetSector;
    covertType?: CovertOpType;
    minorOpType?: MinorNationOpType;
  }) => {
    socketRef.current?.emit(
      'game:queue_order',
      draft,
      (res: { ok: boolean; errorFa?: string }) => {
        if (!res.ok) {
          showToast(res.errorFa || 'ثبت عملیات ممکن نشد', 'warn');
        } else {
          showToast('🎯 فرمان عملیاتی ثبت شد و مسیر آن روی نقشه قفل گردید!', 'ok');
          setDrawerTarget(null);
          setMinorDrawerId(null);
        }
      }
    );
  };

  const handleProposeTrade = (payload: {
    to: CountryId;
    offerType: TradeResourceKind;
    amount: number;
    weaponId?: string;
    priceB: number;
    direction: 'SELL' | 'BUY' | 'PACT';
    noteFa?: string;
  }) => {
    socketRef.current?.emit(
      'game:propose_trade',
      payload,
      (res: { ok: boolean; status?: string; messageFa?: string }) => {
        showToast(
          res.messageFa || (res.ok ? 'قرارداد ارسال شد' : 'پیشنهاد رد شد'),
          res.ok ? 'ok' : 'warn'
        );
      }
    );
  };

  const handleProposeResolution = (target: CountryId, kind: ResolutionKind) => {
    socketRef.current?.emit(
      'game:propose_un_resolution',
      { target, kind },
      (res?: { ok: boolean; errorFa?: string }) => {
        if (res && !res.ok) showToast(res.errorFa || 'خطا در ثبت جلسه', 'warn');
        else showToast('⚖️ جلسه رسمی و رای‌گیری در کمیته بین‌المللی ثبت شد!', 'ok');
      }
    );
  };

  const defconBadgeColor =
    room.defcon === 1
      ? 'bg-rose-600 text-white animate-pulse'
      : room.defcon === 2
      ? 'bg-orange-500 text-slate-950'
      : room.defcon === 3
      ? 'bg-amber-400 text-slate-950'
      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40';

  return (
    <div className="min-h-screen bg-[#040811] text-slate-100 flex flex-col pb-16 lg:pb-0">
      {/* Toast Feedback */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold backdrop-blur-md bg-[#0b1528]/95 border-slate-600">
          <span className={toast.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}>
            {toast.text}
          </span>
        </div>
      )}

      {/* End-of-Month Summary Modal */}
      {room.phase === 'PLANNING' && myCountry?.lastRoundSummary && (
        <RoundSummaryModal
          room={room}
          summary={myCountry.lastRoundSummary}
          onDismiss={() => socketRef.current?.emit('game:dismiss_summary')}
        />
      )}

      {/* Targeted 18s Radar Intercept Modal (ONLY for online non-eliminated attacked player) */}
      {room.phase === 'RADAR_ALERT' &&
        myCountry &&
        !myCountry.isEliminated &&
        myCountry.incomingAlertActive &&
        !myCountry.alertPostureConfirmed && (
          <RadarAlertModal
            me={myCountry}
            secondsLeft={secondsLeft ?? 18}
            onSelectPosture={(posture: AlertPosture) => {
              socketRef.current?.emit(
                'game:alert_posture',
                posture,
                (res: { ok: boolean; errorFa?: string }) => {
                  if (!res.ok && res.errorFa) showToast(res.errorFa, 'warn');
                  else showToast('🛡️ فرمان پدافندی ثبت شد؛ در حال اجرای نبرد!', 'ok');
                }
              );
            }}
          />
        )}

      {/* Clear Banner for Non-Targeted Players During Radar Alert */}
      {room.phase === 'RADAR_ALERT' &&
        (!myCountry || !myCountry.incomingAlertActive || myCountry.alertPostureConfirmed) && (
          <div className="bg-rose-950/70 border-b border-rose-500/50 px-4 py-2 text-center text-xs sm:text-sm font-bold text-rose-200 flex items-center justify-center gap-2">
            <Radio className="w-4 h-4 animate-ping text-rose-400" />
            رادار کشور هدف پرتابه‌ها را شناسایی کرد! در انتظار واکنش پدافندی فرمانده هدف ({secondsLeft ?? 15} ثانیه)...
          </div>
        )}

      {/* Campaign Finished Banner */}
      {room.phase === 'FINISHED' && room.winnerSummaryFa && (
        <div className="bg-gradient-to-l from-amber-500/25 via-emerald-500/20 to-cyan-500/25 border-b border-amber-400/50 px-4 py-3 text-center text-sm sm:text-base font-black text-amber-200 flex flex-wrap items-center justify-center gap-3">
          <span>🏆 {room.winnerSummaryFa}</span>
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black"
          >
            شروع بازی جدید
          </button>
        </div>
      )}

      {/* Top Command HUD */}
      <header className="bg-[#070e1c] border-b border-slate-800 px-3 sm:px-5 py-2.5 space-y-2 sticky top-0 z-30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <span className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs ${defconBadgeColor}`}>
              DEFCON {room.defcon}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white">
              ماه {room.round}/{room.settings.maxRounds} •{' '}
              <span className="text-cyan-300">{room.calendarLabelFa}</span>
            </span>
            <span className="hidden sm:inline-block text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/25 px-2.5 py-0.5 rounded-lg">
              🛢️ نفت جهانی: ${room.market.oilPriceUsd}
            </span>
            {secondsLeft !== null && room.phase === 'PLANNING' && (
              <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-xs flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> {secondsLeft}s
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {myCountry && !myCountry.isEliminated && room.phase === 'PLANNING' && (
              <button
                type="button"
                onClick={() => {
                  sound.playOrderConfirm();
                  socketRef.current?.emit('game:toggle_ready', !myCountry.isReady);
                }}
                className={`px-4 py-1.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition shadow ${
                  myCountry.isReady
                    ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {room.settings.gameMode === 'SINGLE'
                  ? 'پایان ماه و اجرای عملیات جهان'
                  : myCountry.isReady
                  ? `آماده‌ام (${readyHumansCount}/${activeHumanCountries.length})`
                  : `پایان ماه و اجرا (${readyHumansCount}/${activeHumanCountries.length})`}
              </button>
            )}

            {room.settings.gameMode === 'MULTI' && (
              <button
                type="button"
                title="کپی لینک دعوت لابی"
                onClick={() => {
                  const link = `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`;
                  navigator.clipboard.writeText(link);
                  showToast(`لینک دعوت لابی (${room.roomCode}) کپی شد!`, 'ok');
                }}
                className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
              >
                <Share2 className="w-4 h-4" />
                <span className="hidden sm:inline font-mono">{room.roomCode}</span>
              </button>
            )}

            <button
              type="button"
              title="قطع/وصل صدا"
              onClick={() => setMuted(sound.toggleMute())}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-300"
            >
              {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
            </button>

            <button
              type="button"
              title="خروج از بازی"
              onClick={handleLeaveRoom}
              className="p-2 rounded-xl bg-slate-800/90 hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Breaking News Strip */}
        {latestBreaking && (
          <div className="px-3 py-1.5 rounded-xl bg-[#040914] border border-slate-800/90 flex items-center gap-2 text-xs overflow-hidden">
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] shrink-0">
              خبر فوری
            </span>
            <span className="text-amber-300 font-bold shrink-0">{latestBreaking.agencyFa}:</span>
            <span className="text-slate-200 truncate">{latestBreaking.headlineFa}</span>
          </div>
        )}

        {/* My Country Vital Resources Strip */}
        {myCountry && econ && !myCountry.isEliminated && (
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-[11px]">
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1.5">
                <CountryFlag countryId={myCountry.id} size="sm" /> خزانه
              </span>
              <span className="font-mono font-black text-emerald-300">
                ${myCountry.treasuryB}B{' '}
                <span className="text-[10px] text-emerald-400/80">
                  ({econ.netIncomeB >= 0 ? `+${econ.netIncomeB}` : econ.netIncomeB})
                </span>
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🛢️ نفت</span>
              <span className="font-mono font-bold text-amber-300">
                {myCountry.oilReserve}{' '}
                <span className="text-[10px] text-slate-400">
                  ({econ.netOil >= 0 ? `+${econ.netOil}` : econ.netOil})
                </span>
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🔥 گاز</span>
              <span className="font-mono font-bold text-cyan-300">{myCountry.gasReserve}</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">⚡ برق</span>
              <span className="font-mono font-bold text-yellow-300">{myCountry.powerGrid}٪</span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">😊 مردم</span>
              <span
                className={`font-mono font-bold ${
                  myCountry.approval < 35 ? 'text-rose-400' : 'text-emerald-300'
                }`}
              >
                {myCountry.approval}٪
              </span>
            </div>
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0b1528] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🔥 ویرانی</span>
              <span
                className={`font-mono font-bold ${
                  myCountry.devastation >= 45 ? 'text-rose-400' : 'text-slate-300'
                }`}
              >
                {myCountry.devastation}٪
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1640px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Interactive World Map */}
        <div
          className={`lg:col-span-7 flex flex-col gap-3 ${
            mobileTab === 'MAP' ? 'block' : 'hidden lg:flex'
          }`}
        >
          <div className="h-[58vh] sm:h-[64vh] lg:h-[calc(100vh-205px)]">
            <WorldMap
              room={room}
              myCountryId={myCountryId}
              selectedCountryId={drawerTarget?.countryId || myCountryId}
              selectedMinorId={minorDrawerId}
              onSelectCountry={handleSelectCountryOnMap}
              onSelectMinorNation={handleSelectMinorOnMap}
            />
          </div>
        </div>

        {/* Command Side Column */}
        <div
          className={`lg:col-span-5 flex flex-col gap-3 ${
            mobileTab === 'MAP' ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="hidden lg:grid grid-cols-4 gap-1.5 bg-[#08101f] p-1.5 rounded-2xl border border-slate-800 text-xs font-bold">
            {!isGM ? (
              <button
                type="button"
                onClick={() => setDesktopSideTab('COUNTRY')}
                className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 ${
                  desktopSideTab === 'COUNTRY' ? 'bg-emerald-500 text-slate-950 font-black' : 'text-slate-300'
                }`}
              >
                <Building2 className="w-4 h-4" /> کشور و ارتقا
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setDesktopSideTab('GM')}
                className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 ${
                  desktopSideTab === 'GM' ? 'bg-amber-400 text-slate-950 font-black' : 'text-amber-300'
                }`}
              >
                <Mic className="w-4 h-4" /> اتاق راوی
              </button>
            )}
            <button
              type="button"
              onClick={() => setDesktopSideTab('DIPLOMACY')}
              className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 relative ${
                desktopSideTab === 'DIPLOMACY' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-300'
              }`}
            >
              <MessageSquare className="w-4 h-4" /> ائتلاف و چت
              {pendingTradesForMe > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
                  {pendingTradesForMe}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setDesktopSideTab('NEWS')}
              className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 col-span-2 ${
                desktopSideTab === 'NEWS' ? 'bg-rose-500 text-white font-black' : 'text-slate-300'
              }`}
            >
              <Tv className="w-4 h-4" /> اخبار جهان، نبردها و رتبه
            </button>
          </div>

          <div className="lg:h-[calc(100vh-265px)] lg:overflow-y-auto pr-0.5">
            {((mobileTab === 'COUNTRY' || (mobileTab === 'MAP' && desktopSideTab === 'COUNTRY')) &&
              myCountryId && (
                <MyCountryPanel
                  room={room}
                  countryId={myCountryId}
                  onInstantUpgrade={(track: UpgradeTrack) =>
                    socketRef.current?.emit(
                      'game:instant_upgrade',
                      track,
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onInstantInfra={(infraType: InfrastructureType) =>
                    socketRef.current?.emit(
                      'game:instant_infra',
                      infraType,
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onEmergencyAction={(kind: EmergencyActionKind) =>
                    socketRef.current?.emit(
                      'game:emergency_action',
                      kind,
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onInstantWeapon={(weaponId, quantity) =>
                    socketRef.current?.emit(
                      'game:instant_weapon',
                      { weaponId, quantity },
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onSpotTrade={(resource, mode) =>
                    socketRef.current?.emit(
                      'game:spot_trade',
                      { resource, mode },
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onToggleAutoSell={() => socketRef.current?.emit('game:toggle_autosell')}
                  onSetChokepoint={(st: ChokepointStatus) =>
                    socketRef.current?.emit(
                      'game:set_chokepoint',
                      st,
                      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                      }
                    )
                  }
                  onCancelOrder={(orderId) => socketRef.current?.emit('game:cancel_order', orderId)}
                  onProposeTrade={handleProposeTrade}
                  onOpenCountryDrawer={(cid, tab) => setDrawerTarget({ countryId: cid, tab })}
                />
              )) ||
              null}

            {((mobileTab === 'GM' || (mobileTab === 'MAP' && desktopSideTab === 'GM')) && isGM && (
              <GMControlPanel
                room={room}
                onBroadcastNews={(p) => socketRef.current?.emit('gm:broadcast_news', p)}
                onTriggerEvent={(p) => socketRef.current?.emit('gm:trigger_event', p)}
                onAdjustCountry={(p) => socketRef.current?.emit('gm:adjust_country', p)}
                onForceAdvance={() => socketRef.current?.emit('gm:force_advance')}
              />
            )) ||
              null}

            {((mobileTab === 'DIPLOMACY' || (mobileTab === 'MAP' && desktopSideTab === 'DIPLOMACY')) && (
              <DiplomacyChatPanel
                room={room}
                myCountryId={myCountryId}
                isGM={isGM}
                activeChatTarget={activeChatTarget}
                onChangeChatTarget={setActiveChatTarget}
                onSendChat={(channel, text, toCountry) =>
                  socketRef.current?.emit('game:send_chat', { channel, text, toCountry })
                }
                onRespondTrade={(offerId, accept) =>
                  socketRef.current?.emit(
                    'game:respond_trade',
                    { offerId, accept },
                    (res: { ok: boolean; errorFa?: string }) => {
                      if (!res.ok && res.errorFa) showToast(res.errorFa, 'warn');
                      else showToast('قرارداد اجرا شد!', 'ok');
                    }
                  )
                }
                onVoteResolution={(resolutionId, vote) =>
                  socketRef.current?.emit('game:vote_un_resolution', { resolutionId, vote })
                }
                onProposeResolution={handleProposeResolution}
                onCreateCoalition={(nameFa) =>
                  socketRef.current?.emit(
                    'game:create_coalition',
                    nameFa,
                    (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                      showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                    }
                  )
                }
                onJoinCoalition={(coalitionId) =>
                  socketRef.current?.emit(
                    'game:join_coalition',
                    coalitionId,
                    (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                      showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                    }
                  )
                }
              />
            )) ||
              null}

            {((mobileTab === 'NEWS' || (mobileTab === 'MAP' && desktopSideTab === 'NEWS')) && (
              <NewsAndRankingsPanel room={room} myCountryId={myCountryId} />
            )) ||
              null}
          </div>
        </div>
      </main>

      {/* Major Power Tactical Drawer */}
      {drawerTarget && (
        <TargetCountryDrawer
          room={room}
          myCountryId={myCountryId}
          targetId={drawerTarget.countryId}
          initialTab={drawerTarget.tab}
          onClose={() => setDrawerTarget(null)}
          onQueueOrder={handleQueueOrder}
          onProposeTrade={handleProposeTrade}
          onToggleSanction={(tid) => socketRef.current?.emit('game:toggle_sanction', tid)}
          onProposeResolution={handleProposeResolution}
          onOpenDirectChat={(tid) => {
            setActiveChatTarget(tid);
            setMobileTab('DIPLOMACY');
            setDesktopSideTab('DIPLOMACY');
          }}
        />
      )}

      {/* World Minor Nation Conquest / Coup / Base Drawer */}
      {minorDrawerId && (
        <MinorNationDrawer
          room={room}
          myCountryId={myCountryId}
          minorId={minorDrawerId}
          onClose={() => setMinorDrawerId(null)}
          onQueueMinorOrder={(mId, opType) =>
            handleQueueOrder({
              kind: 'MINOR_NATION_OPERATION',
              targetMinorId: mId,
              minorOpType: opType,
            })
          }
          onInstantMinorPact={(mId) =>
            socketRef.current?.emit(
              'game:minor_pact',
              mId,
              (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                if (res.ok) setMinorDrawerId(null);
              }
            )
          }
        />
      )}

      {/* Mobile Bottom Navigation */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#070e1c]/95 backdrop-blur-lg border-t border-slate-800 grid grid-cols-4 py-1.5 px-2 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => setMobileTab('MAP')}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
            mobileTab === 'MAP' ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
          }`}
        >
          <Globe2 className="w-5 h-5" />
          <span>نقشه جهان</span>
        </button>

        {!isGM ? (
          <button
            type="button"
            onClick={() => setMobileTab('COUNTRY')}
            className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
              mobileTab === 'COUNTRY' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'
            }`}
          >
            <Building2 className="w-5 h-5" />
            <span>کشور و ارتقا</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMobileTab('GM')}
            className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
              mobileTab === 'GM' ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400'
            }`}
          >
            <Mic className="w-5 h-5" />
            <span>اتاق راوی</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => setMobileTab('DIPLOMACY')}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 relative ${
            mobileTab === 'DIPLOMACY' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>ائتلاف و چت</span>
          {pendingTradesForMe > 0 && (
            <span className="absolute top-1 left-6 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
              {pendingTradesForMe}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setMobileTab('NEWS')}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
            mobileTab === 'NEWS' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
          }`}
        >
          <Tv className="w-5 h-5" />
          <span>اخبار و رتبه</span>
        </button>
      </nav>
    </div>
  );
};
