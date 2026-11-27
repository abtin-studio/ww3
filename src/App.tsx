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
  Pause,
  Play,
  Save,
  HelpCircle,
  Trophy,
  RotateCcw,
  WifiOff,
  X,
  Settings,
  Film,
} from 'lucide-react';
import { computeEconomyProjection } from '../shared/advisor';
import {
  AlertPosture,
  ChokepointId,
  ChokepointStatus,
  CountryId,
  CovertOpType,
  CreatorCheatPayload,
  DifficultyLevel,
  DiplomaticActionKind,
  EmergencyActionKind,
  GameMode,
  GameRoomState,
  GameSettings,
  GMMode,
  InfrastructureType,
  MilitaryOpType,
  MinorNationOpType,
  RequestLeverageMode,
  ResolutionKind,
  SpaceConstellationId,
  StrategicRequestKind,
  StrikeTargetSector,
  TradeResourceKind,
  UltimatumDemand,
  UpgradeTrack,
} from '../shared/types';
import { CountryFlag } from './components/CountryFlag';
import { BattleReplayOverlay } from './components/BattleReplayOverlay';
import { ChatTargetSelection, DiplomacyChatPanel } from './components/DiplomacyChatPanel';
import { GMControlPanel } from './components/GMControlPanel';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { MinorNationDrawer } from './components/MinorNationDrawer';
import { MyCountryPanel } from './components/MyCountryPanel';
import { NewsAndRankingsPanel } from './components/NewsAndRankingsPanel';
import { RadarAlertModal } from './components/RadarAlertModal';
import { RoundSummaryModal } from './components/RoundSummaryModal';
import { SecretCheatModal } from './components/SecretCheatModal';
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

const PhaseCountdownBadge: React.FC<{
  phaseEndsAt: number | null;
  isPaused: boolean;
  pausedRemainingMs: number | null;
}> = ({ phaseEndsAt, isPaused, pausedRemainingMs }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!phaseEndsAt || isPaused) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [phaseEndsAt, isPaused]);

  if (isPaused && pausedRemainingMs) {
    return (
      <span className="px-2.5 py-0.5 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono text-xs flex items-center gap-1">
        <Pause className="w-3.5 h-3.5" /> {Math.ceil(pausedRemainingMs / 1000)}s
      </span>
    );
  }
  if (!phaseEndsAt) return null;
  const secs = Math.max(0, Math.ceil((phaseEndsAt - now) / 1000));
  return (
    <span className="px-2.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/40 text-rose-300 font-mono text-xs flex items-center gap-1">
      <Clock className="w-3.5 h-3.5" /> {secs}s
    </span>
  );
};

const MatchElapsedTimer: React.FC<{
  matchStartedAt: number | null;
  pausedAt: number | null;
  accumulatedPausedMs: number;
  savedElapsedMs: number;
  isPaused: boolean;
  isFinished: boolean;
}> = ({ matchStartedAt, pausedAt, accumulatedPausedMs, savedElapsedMs, isPaused, isFinished }) => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!matchStartedAt || isPaused || isFinished) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [matchStartedAt, isPaused, isFinished]);

  let totalMs = savedElapsedMs || 0;
  if (!isFinished && matchStartedAt) {
    const endRef = isPaused && pausedAt ? pausedAt : now;
    totalMs = Math.max(totalMs, totalMs + (endRef - matchStartedAt - (accumulatedPausedMs || 0)));
  }

  const totalSec = Math.max(0, Math.floor(totalMs / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const formatted =
    hrs > 0
      ? `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

  return (
    <span
      title="مجموع زمان سپری‌شده از شروع این کارزار"
      className="px-2.5 py-0.5 rounded-lg bg-slate-800/90 border border-slate-700 text-cyan-200 font-mono text-xs flex items-center gap-1.5"
    >
      <Clock className="w-3.5 h-3.5 text-cyan-400" />
      <span className="font-bold">{formatted}</span>
    </span>
  );
};

type SidePanelTab = 'COUNTRY' | 'DIPLOMACY' | 'NEWS' | 'GM';

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
  const [socketConnected, setSocketConnected] = useState(true);
  const [room, setRoom] = useState<GameRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorFa, setErrorFa] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'warn' } | null>(null);
  const [muted, setMuted] = useState(() => sound.isMuted());

  const [sideTab, setSideTab] = useState<SidePanelTab>('COUNTRY');
  const [mobileShowMap, setMobileShowMap] = useState<boolean>(true);
  const [showRoomMenu, setShowRoomMenu] = useState<boolean>(false);

  const [drawerTarget, setDrawerTarget] = useState<{ countryId: CountryId; tab: DrawerTab } | null>(null);
  const [minorDrawerId, setMinorDrawerId] = useState<string | null>(null);
  const [activeChatTarget, setActiveChatTarget] = useState<ChatTargetSelection>('GLOBAL');
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [endgameDismissed, setEndgameDismissed] = useState(false);
  const [showBattleReplay, setShowBattleReplay] = useState(false);
  const lastAutoReplayedRoundRef = useRef<number>(0);

  // Secret Creator Console State (Ctrl+Shift+X or 5 taps on DEFCON)
  const [showSecretCheat, setShowSecretCheat] = useState(false);
  const secretTapRef = useRef<{ count: number; lastTap: number }>({ count: 0, lastTap: 0 });

  const showToast = (text: string, tone: 'ok' | 'warn' = 'ok') => {
    if (!text) return;
    setToast({ text, tone });
    setTimeout(() => {
      setToast((prev) => (prev?.text === text ? null : prev));
    }, 4000);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === 'X' || e.key === 'x')) {
        e.preventDefault();
        setShowSecretCheat((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleDefconSecretTap = () => {
    const now = Date.now();
    if (now - secretTapRef.current.lastTap > 2200) {
      secretTapRef.current = { count: 1, lastTap: now };
    } else {
      secretTapRef.current.count += 1;
      secretTapRef.current.lastTap = now;
      if (secretTapRef.current.count >= 5) {
        secretTapRef.current = { count: 0, lastTap: 0 };
        setShowSecretCheat(true);
      }
    }
  };

  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 500,
    });
    socketRef.current = socket;

    socket.on('room:state', (nextRoom: GameRoomState) => {
      setRoom((prev) => {
        if (prev?.phase !== 'FINISHED' && nextRoom.phase === 'FINISHED') {
          setEndgameDismissed(false);
          sound.playVictory();
        }
        return nextRoom;
      });
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
      setSocketConnected(true);
      try {
        const savedRoom = urlRoom || localStorage.getItem('ww3_saved_room');
        const savedName = localStorage.getItem('ww3_player_name');
        if (savedRoom && savedName) {
          socket.emit(
            'lobby:join',
            {
              roomCode: savedRoom,
              playerId,
              playerName: savedName,
            },
            (res?: { ok: boolean }) => {
              if (res && !res.ok) {
                localStorage.removeItem('ww3_saved_room');
              }
            }
          );
        }
      } catch {
        // ignore
      }
    });

    socket.on('disconnect', () => {
      setSocketConnected(false);
    });

    return () => {
      socket.disconnect();
    };
  }, [playerId, urlRoom]);

  const mePlayer = room?.players.find((p) => p.id === playerId) || null;
  const myCountryId = mePlayer?.countryId || null;
  const myCountry = room && myCountryId ? room.countries[myCountryId] : null;
  const isHost = Boolean(mePlayer?.isHost);
  const isGM = Boolean(mePlayer?.isGM);

  useEffect(() => {
    const resolvedRound = myCountry?.lastRoundSummary?.roundResolved;
    if (
      room?.phase === 'PLANNING' &&
      resolvedRound &&
      resolvedRound > lastAutoReplayedRoundRef.current
    ) {
      lastAutoReplayedRoundRef.current = resolvedRound;
      if ((room.lastRoundReplay?.length || 0) > 0) {
        setShowBattleReplay(true);
      }
    }
  }, [room?.phase, room?.lastRoundReplay, myCountry?.lastRoundSummary?.roundResolved]);

  useEffect(() => {
    if (isGM) {
      setSideTab('GM');
    } else if (sideTab === 'GM') {
      setSideTab('COUNTRY');
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

  const handleLoadSavedGame = (opts: {
    playerName: string;
    saveCode?: string;
    rawRoomJson?: string;
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
      'lobby:load_save',
      {
        playerId,
        playerName: opts.playerName,
        saveCode: opts.saveCode,
        rawRoomJson: opts.rawRoomJson,
      },
      (res: { ok: boolean; roomCode?: string; errorFa?: string }) => {
        setBusy(false);
        if (!res.ok) setErrorFa(res.errorFa || 'خطا در بازیابی فایل ذخیره');
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
    socketRef.current?.emit('lobby:leave');
    setDrawerTarget(null);
    setMinorDrawerId(null);
    setShowRoomMenu(false);
    setRoom(null);
  };

  const handleSaveSnapshot = () => {
    sound.playOrderConfirm();
    setShowRoomMenu(false);
    socketRef.current?.emit(
      'game:save_snapshot',
      (res: {
        ok: boolean;
        saveCode?: string;
        roomJson?: string;
        fileName?: string;
        errorFa?: string;
      }) => {
        if (!res.ok) {
          showToast(res.errorFa || 'خطا در ذخیره بازی', 'warn');
          return;
        }
        if (res.roomJson && res.fileName) {
          const blob = new Blob([res.roomJson], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = res.fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
        showToast(
          `💾 بازی ذخیره و فایل دانلود شد! (کد سرور: ${res.saveCode})`,
          'ok'
        );
      }
    );
  };

  const handleTogglePause = () => {
    sound.playClick();
    setShowRoomMenu(false);
    socketRef.current?.emit(
      'game:toggle_pause',
      (res: { ok: boolean; isPaused?: boolean; errorFa?: string }) => {
        if (!res.ok && res.errorFa) showToast(res.errorFa, 'warn');
        else showToast(res.isPaused ? '⏸️ بازی متوقف شد.' : '▶️ بازی ادامه یافت!', 'ok');
      }
    );
  };

  const handleRematchInLobby = () => {
    sound.playOrderConfirm();
    socketRef.current?.emit('game:rematch_lobby', (res: { ok: boolean; errorFa?: string }) => {
      if (!res.ok && res.errorFa) showToast(res.errorFa, 'warn');
    });
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
        onLoadSavedGame={handleLoadSavedGame}
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
        onToggleLobbyReady={() => socketRef.current?.emit('lobby:toggle_ready')}
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
  const activeHumanCountries = Object.values(room.countries).filter(
    (c) => c.playerId !== null && c.isOnline && !c.isEliminated
  );
  const readyHumansCount = activeHumanCountries.filter((c) => c.isReady).length;
  const pendingTradesForMe =
    room.trades.filter((t) => t.status === 'PENDING' && t.to === myCountryId).length +
    (room.strategicRequests || []).filter((r) => r.status === 'PENDING' && r.to === myCountryId).length;
  const econ = myCountry
    ? computeEconomyProjection(myCountry, room.market, room.chokepoints, room.minorNations)
    : null;

  const switchTab = (nextTab: SidePanelTab) => {
    sound.playClick();
    setSideTab(nextTab);
    setMobileShowMap(false);
  };

  const handleSelectCountryOnMap = (cid: CountryId) => {
    setMinorDrawerId(null);
    if (cid === myCountryId) {
      setDrawerTarget(null);
      setSideTab('COUNTRY');
      setMobileShowMap(false);
    } else {
      setDrawerTarget({ countryId: cid, tab: 'DIPLOMACY' });
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
          res.messageFa || (res.ok ? 'پیشنهاد ارسال شد' : 'پیشنهاد رد شد'),
          res.ok ? 'ok' : 'warn'
        );
      }
    );
  };

  const handleProposeRequest = (payload: {
    targetCountry: CountryId;
    kind: StrategicRequestKind;
    leverage: RequestLeverageMode;
    offeredCashB?: number;
    thirdCountry?: CountryId;
    chokepointId?: ChokepointId;
  }) => {
    socketRef.current?.emit(
      'game:propose_request',
      payload,
      (res: { ok: boolean; status?: string; messageFa?: string; errorFa?: string }) => {
        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
        if (res.ok) setDrawerTarget(null);
      }
    );
  };

  const handleFalseFlagSabotage = (targetCountry: CountryId, thirdCountry: CountryId) => {
    socketRef.current?.emit(
      'game:false_flag_sabotage',
      { targetCountry, thirdCountry },
      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
      }
    );
  };

  const handleDiplomaticAction = (
    targetCountry: CountryId,
    kind: DiplomaticActionKind,
    opts?: { ultimatum?: UltimatumDemand; thirdCountry?: CountryId }
  ) => {
    socketRef.current?.emit(
      'game:diplomatic_action',
      { targetCountry, kind, ultimatum: opts?.ultimatum, thirdCountry: opts?.thirdCountry },
      (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
        showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
      }
    );
  };

  const handleProposeResolution = (target: CountryId, kind: ResolutionKind) => {
    socketRef.current?.emit(
      'game:propose_un_resolution',
      { target, kind },
      (res?: { ok: boolean; errorFa?: string }) => {
        if (res && !res.ok) showToast(res.errorFa || 'خطا در ثبت جلسه', 'warn');
        else showToast('⚖️ پیش‌نویس قطعنامه در شورای امنیت سازمان ملل ثبت شد!', 'ok');
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
    <div className="min-h-screen tactical-grid-bg text-slate-100 flex flex-col pb-16 lg:pb-0">
      {!socketConnected && (
        <div className="bg-amber-500 text-slate-950 text-xs font-black py-1.5 px-4 text-center flex items-center justify-center gap-2 z-50">
          <WifiOff className="w-4 h-4 animate-bounce" />
          در حال اتصال مجدد خودکار به سرور اتاق جنگ...
        </div>
      )}

      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-2xl border text-xs sm:text-sm font-bold glass-panel border-slate-600 animate-panel-in">
          <span className={toast.tone === 'ok' ? 'text-emerald-300' : 'text-rose-300'}>
            {toast.text}
          </span>
        </div>
      )}

      {showSecretCheat && (
        <SecretCheatModal
          myCountryId={myCountryId}
          onClose={() => setShowSecretCheat(false)}
          onInspect={(secretKey, cb) => socketRef.current?.emit('creator:inspect', secretKey, cb)}
          onExecCheat={(payload: CreatorCheatPayload, cb) =>
            socketRef.current?.emit('creator:exec', payload, cb)
          }
        />
      )}

      {/* Updated v6.0 Quick Guide Modal */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-xl glass-panel rounded-3xl p-5 sm:p-6 space-y-4 animate-panel-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base sm:text-lg font-black text-emerald-300">
                ⚡ راهنمای فرماندهی کل نسخه ۶.۰
              </h2>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2.5 text-xs sm:text-sm text-slate-200 leading-relaxed">
              <div className="p-3 rounded-xl bg-[#060c18] border border-slate-800">
                <strong className="text-emerald-400">۱. اقتصاد واقعی و لیدربورد متوازن:</strong> خرید بیش‌ازحد سلاح بدون پشتوانه صنعتی خزانه را با هزینه نگهداری خالی می‌کند! برای صدرنشینی، باید <strong>تولید ناخالص (GDP)، علم، منظومه‌های فضایی، رفاه مردم، متحدان و ماموریت‌ها</strong> را متوازن پیش ببرید.
              </div>
              <div className="p-3 rounded-xl bg-[#060c18] border border-slate-800">
                <strong className="text-sky-300">۲. ۴ منظومه فضایی و ماموریت‌های پویا:</strong> در تب <strong>«فضا»</strong> منظومه‌های جاسوسی اپتیکال، ناوبری GPS (-۳۰٪ مصرف سوخت!)، سپر فروسرخ SBIRS و اینترنت فضایی را تا سطح ۳ ارتقا دهید و در تب <strong>«ماموریت‌ها»</strong> جوایز مستمر بگیرید.
              </div>
              <div className="p-3 rounded-xl bg-[#060c18] border border-slate-800">
                <strong className="text-amber-300">۳. درخواست‌های راهبردی و پرچم دروغین:</strong> روی هر کشوری در نقشه کلیک کنید تا از آن بخواهید <strong>تنگه‌ای را ببندد/باز کند، به کشور سوم حمله نظامی یا سایبری بزند، یا تحریم وضع کند</strong>؛ یا با <strong>عملیات پرچم دروغین</strong> دو متحد را به جان هم بیندازید!
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm"
            >
              ورود به اتاق فرماندهی!
            </button>
          </div>
        </div>
      )}

      {/* Endgame Victory Podium */}
      {room.phase === 'FINISHED' && !endgameDismissed && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl glass-panel border-amber-400/50 rounded-3xl p-5 sm:p-6 space-y-5 animate-panel-in">
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-400/20 border border-amber-400/50 flex items-center justify-center mx-auto text-amber-300">
                <Trophy className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">پایان رسمی کارزار جهانی!</h2>
              <p className="text-xs sm:text-sm text-amber-200 font-bold leading-relaxed">
                {room.winnerSummaryFa}
              </p>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-bold text-slate-400">سکوی نهایی ۳ قدرت برتر جهان:</div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {room.rankings.slice(0, 3).map((r, i) => {
                  const c = room.countries[r.countryId];
                  return (
                    <div
                      key={r.countryId}
                      className={`p-3.5 rounded-2xl border text-center space-y-1 ${
                        i === 0
                          ? 'bg-amber-500/15 border-amber-400'
                          : 'bg-[#070f1e] border-slate-800'
                      }`}
                    >
                      <div className="text-lg">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                      <div className="flex items-center justify-center gap-1.5 font-black text-sm text-white">
                        <CountryFlag countryId={c.id} size="sm" />
                        <span>{c.nameFa}</span>
                      </div>
                      {c.playerName && (
                        <div className="text-[11px] text-emerald-300 font-bold">{c.playerName}</div>
                      )}
                      <div className="font-mono font-black text-cyan-300 text-sm">{r.score} امتیاز</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2">
              {isHost && (
                <button
                  type="button"
                  onClick={handleRematchInLobby}
                  className="py-3 px-4 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  بازی جدید در همین لابی
                </button>
              )}
              <button
                type="button"
                onClick={() => setEndgameDismissed(true)}
                className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs sm:text-sm"
              >
                مشاهده نقشه و آمار نهایی
              </button>
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="py-3 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 font-black text-xs sm:text-sm flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-4 h-4" />
                خروج به منوی اصلی
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pre-Month Global World-News Cinema */}
      {showBattleReplay && room.lastRoundReplay && room.lastRoundReplay.length > 0 && (
        <BattleReplayOverlay
          roundNumber={myCountry?.lastRoundSummary?.roundResolved || Math.max(1, room.round - 1)}
          monthLabelFa={myCountry?.lastRoundSummary?.monthLabelFa || room.calendarLabelFa}
          events={room.lastRoundReplay}
          onFinish={() => setShowBattleReplay(false)}
        />
      )}

      {room.phase === 'PLANNING' && !showBattleReplay && myCountry?.lastRoundSummary && (
        <RoundSummaryModal
          room={room}
          summary={myCountry.lastRoundSummary}
          hasReplay={(room.lastRoundReplay?.length || 0) > 0}
          onRewatchReplay={() => setShowBattleReplay(true)}
          onDismiss={() => socketRef.current?.emit('game:dismiss_summary')}
        />
      )}

      {room.phase === 'RADAR_ALERT' &&
        !room.isPaused &&
        myCountry &&
        !myCountry.isEliminated &&
        myCountry.incomingAlertActive &&
        !myCountry.alertPostureConfirmed && (
          <RadarAlertModal
            me={myCountry}
            secondsLeft={
              room.phaseEndsAt ? Math.max(1, Math.ceil((room.phaseEndsAt - Date.now()) / 1000)) : 18
            }
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

      {room.isPaused && (
        <div className="bg-amber-500/20 border-b border-amber-400/50 px-4 py-2 text-center text-xs sm:text-sm font-black text-amber-200 flex items-center justify-center gap-3">
          <Pause className="w-4 h-4 text-amber-400" />
          <span>⏸️ بازی توسط میزبان متوقف (Pause) شده است.</span>
          {isHost && (
            <button
              type="button"
              onClick={handleTogglePause}
              className="px-3 py-1 rounded-lg bg-emerald-500 text-slate-950 text-xs font-black"
            >
              ▶️ ادامه بازی
            </button>
          )}
        </div>
      )}

      {room.phase === 'RADAR_ALERT' &&
        (!myCountry || !myCountry.incomingAlertActive || myCountry.alertPostureConfirmed) && (
          <div className="bg-rose-950/70 border-b border-rose-500/50 px-4 py-2 text-center text-xs sm:text-sm font-bold text-rose-200 flex items-center justify-center gap-2">
            <Radio className="w-4 h-4 animate-ping text-rose-400" />
            رادار کشور هدف پرتابه‌ها را شناسایی کرد! در انتظار واکنش پدافندی فرمانده هدف...
          </div>
        )}

      {room.phase === 'FINISHED' && room.winnerSummaryFa && (
        <div className="bg-gradient-to-l from-amber-500/25 via-emerald-500/20 to-cyan-500/25 border-b border-amber-400/50 px-4 py-2.5 text-center text-xs sm:text-sm font-black text-amber-200 flex flex-wrap items-center justify-center gap-2.5">
          <span>🏆 {room.winnerSummaryFa}</span>
          {isHost && (
            <button
              type="button"
              onClick={handleRematchInLobby}
              className="px-3 py-1 rounded-xl bg-emerald-500 text-slate-950 text-xs font-black"
            >
              🔄 بازی جدید با همین جمع
            </button>
          )}
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="px-3 py-1 rounded-xl bg-slate-800 border border-slate-600 text-white text-xs font-bold"
          >
            منوی اصلی
          </button>
        </div>
      )}

      {/* Streamlined, Ultra-Clean Top HUD (v6.0 Item #7!) */}
      <header className="bg-[#060d1b]/95 backdrop-blur-xl border-b border-slate-800/90 px-3 sm:px-5 py-2 space-y-2 sticky top-0 z-30">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
            <span
              onClick={handleDefconSecretTap}
              className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs select-none cursor-pointer ${defconBadgeColor}`}
            >
              DEFCON {room.defcon}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white">
              ماه {room.round}/{room.settings.maxRounds}{' '}
              <span className="hidden sm:inline text-cyan-300">• {room.calendarLabelFa}</span>
            </span>
            <MatchElapsedTimer
              matchStartedAt={room.matchStartedAt}
              pausedAt={room.pausedAt}
              accumulatedPausedMs={room.accumulatedPausedMs || 0}
              savedElapsedMs={room.savedElapsedMs || 0}
              isPaused={room.isPaused}
              isFinished={room.phase === 'FINISHED'}
            />
            <span className="hidden md:inline-block text-xs text-amber-300 font-mono bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-lg">
              🛢️ نفت: ${room.market.oilPriceUsd}
            </span>
            {room.phase === 'PLANNING' && (
              <PhaseCountdownBadge
                phaseEndsAt={room.phaseEndsAt}
                isPaused={room.isPaused}
                pausedRemainingMs={room.pausedRemainingMs}
              />
            )}
          </div>

          {/* Primary Action + Consolidated Room Controls Popover */}
          <div className="flex items-center gap-2 relative">
            {myCountry && !myCountry.isEliminated && room.phase === 'PLANNING' && (
              <button
                type="button"
                disabled={room.isPaused}
                onClick={() => {
                  sound.playOrderConfirm();
                  socketRef.current?.emit('game:toggle_ready', !myCountry.isReady);
                }}
                className={`px-4 py-1.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-1.5 transition shadow-lg disabled:opacity-40 ${
                  myCountry.isReady
                    ? 'bg-emerald-500/25 border border-emerald-400 text-emerald-200'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                {room.settings.gameMode === 'SINGLE'
                  ? 'پایان ماه و اجرا'
                  : myCountry.isReady
                  ? `آماده‌ام (${readyHumansCount}/${activeHumanCountries.length})`
                  : `پایان ماه (${readyHumansCount}/${activeHumanCountries.length})`}
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                sound.playClick();
                setShowRoomMenu((v) => !v);
              }}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5"
            >
              <Settings className="w-4 h-4 text-cyan-300" />
              <span className="hidden sm:inline">منوی اتاق</span>
            </button>

            {showRoomMenu && (
              <div className="absolute left-0 top-11 w-56 glass-panel rounded-2xl p-2 space-y-1 z-50 shadow-2xl animate-panel-in text-xs">
                {(isHost || isGM) && room.phase !== 'FINISHED' && (
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-amber-200 font-bold flex items-center gap-2 text-right"
                  >
                    {room.isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
                    <span>{room.isPaused ? 'ادامه جریان بازی' : 'توقف موقت بازی (Pause)'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleSaveSnapshot}
                  className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-cyan-200 font-bold flex items-center gap-2 text-right"
                >
                  <Save className="w-4 h-4" />
                  <span>ذخیره بازی (Save فایل)</span>
                </button>

                {(room.lastRoundReplay?.length || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowRoomMenu(false);
                      setShowBattleReplay(true);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-purple-200 font-bold flex items-center gap-2 text-right"
                  >
                    <Film className="w-4 h-4" />
                    <span>بازپخش سینمایی ماه قبل</span>
                  </button>
                )}

                {room.settings.gameMode === 'MULTI' && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.playClick();
                      setShowRoomMenu(false);
                      const link = `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`;
                      navigator.clipboard.writeText(link);
                      showToast(`لینک دعوت لابی (${room.roomCode}) کپی شد!`, 'ok');
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-slate-200 font-bold flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <Share2 className="w-4 h-4" /> کپی لینک دعوت
                    </span>
                    <span className="font-mono text-emerald-300">{room.roomCode}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setMuted(sound.toggleMute())}
                  className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-slate-200 font-bold flex items-center gap-2 text-right"
                >
                  {muted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                  <span>{muted ? 'وصل کردن افکت‌های صوتی' : 'بی‌صدا کردن بازی'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setShowRoomMenu(false);
                    setShowGuideModal(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-slate-800/80 text-emerald-300 font-bold flex items-center gap-2 text-right"
                >
                  <HelpCircle className="w-4 h-4" />
                  <span>راهنمای سریع نسخه ۶.۰</span>
                </button>

                <div className="border-t border-slate-800 my-1" />

                <button
                  type="button"
                  onClick={handleLeaveRoom}
                  className="w-full px-3 py-2 rounded-xl hover:bg-rose-500/20 text-rose-300 font-bold flex items-center gap-2 text-right"
                >
                  <LogOut className="w-4 h-4" />
                  <span>خروج به منوی اصلی</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Breaking News Strip */}
        {latestBreaking && (
          <div
            onClick={() => switchTab('NEWS')}
            className="px-3 py-1.5 rounded-xl bg-[#040914]/90 border border-slate-800/90 flex items-center gap-2 text-xs overflow-hidden cursor-pointer hover:border-slate-700 transition"
          >
            <span className="px-2 py-0.5 rounded bg-rose-600 text-white font-black text-[10px] shrink-0">
              خبر فوری
            </span>
            <span className="text-amber-300 font-bold shrink-0">{latestBreaking.agencyFa}:</span>
            <span className="text-slate-200 truncate">{latestBreaking.headlineFa}</span>
          </div>
        )}

        {/* 7 Vital Resources Ribbon */}
        {myCountry && econ && !myCountry.isEliminated && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-1.5 text-[11px]">
            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-300 flex items-center gap-1">
                <CountryFlag countryId={myCountry.id} size="sm" /> خزانه
              </span>
              <span className="font-mono font-black text-emerald-300">
                ${myCountry.treasuryB}B{' '}
                <span className={`text-[10px] ${econ.netIncomeB >= 0 ? 'text-emerald-400/80' : 'text-rose-400'}`}>
                  ({econ.netIncomeB >= 0 ? `+${econ.netIncomeB}` : econ.netIncomeB})
                </span>
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🛢️ نفت</span>
              <span className="font-mono font-bold text-amber-300">
                {myCountry.oilReserve}{' '}
                <span className="text-[10px] text-slate-400">
                  ({econ.netOil >= 0 ? `+${econ.netOil}` : econ.netOil})
                </span>
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🔥 گاز</span>
              <span className="font-mono font-bold text-cyan-300">
                {myCountry.gasReserve}{' '}
                <span className="text-[10px] text-slate-400">
                  ({econ.netGas >= 0 ? `+${econ.netGas}` : econ.netGas})
                </span>
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">🌾 غذا</span>
              <span
                className={`font-mono font-bold ${
                  myCountry.foodReserve < 45 ? 'text-rose-400' : 'text-lime-300'
                }`}
              >
                {myCountry.foodReserve}{' '}
                <span className="text-[10px] text-slate-400">
                  ({econ.netFood >= 0 ? `+${econ.netFood}` : econ.netFood})
                </span>
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">💧 آب</span>
              <span
                className={`font-mono font-bold ${
                  (myCountry.waterReserve || 0) < 45 ? 'text-rose-400' : 'text-sky-300'
                }`}
              >
                {myCountry.waterReserve || 0}{' '}
                <span className="text-[10px] text-slate-400">
                  ({econ.netWater >= 0 ? `+${econ.netWater}` : econ.netWater})
                </span>
              </span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between">
              <span className="text-slate-400">⚡ برق</span>
              <span className="font-mono font-bold text-yellow-300">{myCountry.powerGrid}٪</span>
            </div>

            <div className="px-2.5 py-1.5 rounded-xl bg-[#0a1426] border border-slate-800 flex items-center justify-between col-span-2 sm:col-span-1">
              <span className="text-slate-400">😊 مردم / ویرانی</span>
              <span className="font-mono font-bold">
                <span className={myCountry.approval < 35 ? 'text-rose-400' : 'text-emerald-300'}>
                  {myCountry.approval}٪
                </span>{' '}
                / <span className={myCountry.devastation >= 45 ? 'text-rose-400' : 'text-slate-400'}>{myCountry.devastation}٪</span>
              </span>
            </div>
          </div>
        )}
      </header>

      {/* Interactive Global Flashpoint Event Banner */}
      {room.phase === 'PLANNING' &&
        room.activeFlashpoint &&
        myCountry &&
        !myCountry.isEliminated &&
        !room.activeFlashpoint.chosenBy[myCountry.id] && (
          <div className="max-w-[1640px] w-full mx-auto px-3 sm:px-4 pt-3">
            <div className="glass-panel border-amber-400/45 rounded-2xl p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3 animate-panel-in">
              <div className="space-y-0.5">
                <div className="text-xs sm:text-sm font-black text-amber-300 flex items-center gap-1.5">
                  <span>{room.activeFlashpoint.icon}</span>
                  <span>رویداد ویژه جهانی: {room.activeFlashpoint.titleFa}</span>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-300">{room.activeFlashpoint.descFa}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 shrink-0 text-xs">
                {room.activeFlashpoint.options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      sound.playOrderConfirm();
                      socketRef.current?.emit(
                        'game:flashpoint_choice',
                        opt.id,
                        (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                          showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                        }
                      );
                    }}
                    className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-right transition"
                  >
                    <div className="font-black text-amber-200">{opt.labelFa}</div>
                    <div className="text-[10px] text-slate-300 mt-0.5">{opt.effectFa}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      {/* Main Workspace */}
      <main
        onClick={() => showRoomMenu && setShowRoomMenu(false)}
        className="flex-1 max-w-[1640px] w-full mx-auto p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-4"
      >
        <div
          className={`lg:col-span-7 flex flex-col gap-3 ${
            mobileShowMap ? 'block' : 'hidden lg:flex'
          }`}
        >
          <div className="h-[58vh] sm:h-[64vh] lg:h-[calc(100vh-195px)]">
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

        <div
          className={`lg:col-span-5 flex flex-col gap-3 ${
            mobileShowMap ? 'hidden lg:flex' : 'flex'
          }`}
        >
          <div className="hidden lg:grid grid-cols-4 gap-1.5 glass-panel p-1.5 rounded-2xl text-xs font-bold">
            {!isGM ? (
              <button
                type="button"
                onClick={() => switchTab('COUNTRY')}
                className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  sideTab === 'COUNTRY' ? 'bg-emerald-500 text-slate-950 font-black shadow' : 'text-slate-300 hover:bg-slate-800/70'
                }`}
              >
                <Building2 className="w-4 h-4" /> فرماندهی کشور
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchTab('GM')}
                className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 transition ${
                  sideTab === 'GM' ? 'bg-amber-400 text-slate-950 font-black shadow' : 'text-amber-300'
                }`}
              >
                <Mic className="w-4 h-4" /> اتاق راوی
              </button>
            )}
            <button
              type="button"
              onClick={() => switchTab('DIPLOMACY')}
              className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 relative transition ${
                sideTab === 'DIPLOMACY' ? 'bg-cyan-400 text-slate-950 font-black shadow' : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <MessageSquare className="w-4 h-4" /> سازمان ملل و چت
              {pendingTradesForMe > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px]">
                  {pendingTradesForMe}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('NEWS')}
              className={`py-2.5 rounded-xl flex items-center justify-center gap-1.5 col-span-2 transition ${
                sideTab === 'NEWS' ? 'bg-rose-500 text-white font-black shadow' : 'text-slate-300 hover:bg-slate-800/70'
              }`}
            >
              <Tv className="w-4 h-4" /> اخبار جهان و لیدربورد
            </button>
          </div>

          <div className="lg:h-[calc(100vh-258px)] lg:overflow-y-auto pr-0.5">
            {sideTab === 'COUNTRY' && myCountryId && (
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
                onUpgradeConstellation={(cid: SpaceConstellationId) =>
                  socketRef.current?.emit(
                    'game:upgrade_constellation',
                    cid,
                    (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                      showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                    }
                  )
                }
                onRerollMission={(missionId: string) =>
                  socketRef.current?.emit(
                    'game:reroll_mission',
                    missionId,
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
                onSellWeapon={(weaponId, quantity) =>
                  socketRef.current?.emit(
                    'game:sell_weapon',
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
            )}

            {sideTab === 'GM' && isGM && (
              <GMControlPanel
                room={room}
                onBroadcastNews={(p) => socketRef.current?.emit('gm:broadcast_news', p)}
                onTriggerEvent={(p) => socketRef.current?.emit('gm:trigger_event', p)}
                onAdjustCountry={(p) => socketRef.current?.emit('gm:adjust_country', p)}
                onForceAdvance={() => socketRef.current?.emit('gm:force_advance')}
              />
            )}

            {sideTab === 'DIPLOMACY' && (
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
                      else showToast('معاهده امضا و اجرا شد!', 'ok');
                    }
                  )
                }
                onRespondRequest={(requestId, accept) =>
                  socketRef.current?.emit(
                    'game:respond_request',
                    { requestId, accept },
                    (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                      showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
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
                onLeaveCoalition={() =>
                  socketRef.current?.emit(
                    'game:leave_coalition',
                    (res: { ok: boolean; messageFa?: string; errorFa?: string }) => {
                      showToast(res.messageFa || res.errorFa || '', res.ok ? 'ok' : 'warn');
                    }
                  )
                }
              />
            )}

            {sideTab === 'NEWS' && (
              <NewsAndRankingsPanel room={room} myCountryId={myCountryId} />
            )}
          </div>
        </div>
      </main>

      {drawerTarget && (
        <TargetCountryDrawer
          room={room}
          myCountryId={myCountryId}
          targetId={drawerTarget.countryId}
          initialTab={drawerTarget.tab}
          onClose={() => setDrawerTarget(null)}
          onQueueOrder={handleQueueOrder}
          onProposeTrade={handleProposeTrade}
          onProposeRequest={handleProposeRequest}
          onFalseFlagSabotage={handleFalseFlagSabotage}
          onDiplomaticAction={handleDiplomaticAction}
          onToggleSanction={(tid) => socketRef.current?.emit('game:toggle_sanction', tid)}
          onProposeResolution={handleProposeResolution}
          onOpenDirectChat={(tid) => {
            setActiveChatTarget(tid);
            setSideTab('DIPLOMACY');
            setMobileShowMap(false);
          }}
        />
      )}

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
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-[#060d1b]/95 backdrop-blur-lg border-t border-slate-800 grid grid-cols-4 py-1.5 px-2 text-[11px] font-bold">
        <button
          type="button"
          onClick={() => {
            sound.playClick();
            setMobileShowMap(true);
          }}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
            mobileShowMap ? 'text-emerald-400 bg-emerald-500/10' : 'text-slate-400'
          }`}
        >
          <Globe2 className="w-5 h-5" />
          <span>نقشه جهان</span>
        </button>

        {!isGM ? (
          <button
            type="button"
            onClick={() => switchTab('COUNTRY')}
            className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
              !mobileShowMap && sideTab === 'COUNTRY' ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-400'
            }`}
          >
            <Building2 className="w-5 h-5" />
            <span>فرماندهی کشور</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => switchTab('GM')}
            className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
              !mobileShowMap && sideTab === 'GM' ? 'text-amber-400 bg-amber-500/10' : 'text-slate-400'
            }`}
          >
            <Mic className="w-5 h-5" />
            <span>اتاق راوی</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => switchTab('DIPLOMACY')}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 relative ${
            !mobileShowMap && sideTab === 'DIPLOMACY' ? 'text-amber-300 bg-amber-500/10' : 'text-slate-400'
          }`}
        >
          <MessageSquare className="w-5 h-5" />
          <span>سازمان ملل</span>
          {pendingTradesForMe > 0 && (
            <span className="absolute top-1 left-6 w-4 h-4 rounded-full bg-rose-600 text-white text-[10px] flex items-center justify-center">
              {pendingTradesForMe}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => switchTab('NEWS')}
          className={`py-1.5 rounded-xl flex flex-col items-center gap-0.5 ${
            !mobileShowMap && sideTab === 'NEWS' ? 'text-rose-400 bg-rose-500/10' : 'text-slate-400'
          }`}
        >
          <Tv className="w-5 h-5" />
          <span>اخبار و رتبه</span>
        </button>
      </nav>
    </div>
  );
};
