import compression from 'compression';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import { evaluateAITradeOffer, processInteractiveAIChat } from './aiNations.js';
import {
  addIntel,
  addNews,
  applyAlertPosture,
  applyCreatorCheat,
  cancelPlayerOrder,
  createCoalition,
  createNewRoomState,
  createResolutionSpec,
  executeAcceptedTrade,
  executeDiplomaticAction,
  instantBuildInfra,
  instantEmergencyAction,
  instantMinorDiplomacyPact,
  instantProduceWeapon,
  instantSellWeapon,
  instantSetChokepoint,
  instantSpotTrade,
  instantUpgradeTrack,
  joinCoalition,
  leaveCoalition,
  prepareEndOfPlanning,
  prepareResumedRoom,
  queuePlayerOrder,
  resetRoomForRematch,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
  updateRankingsAndDefcon,
  verifyCreatorKey,
} from './gameEngine.js';
import { RoomStore } from './store.js';
import {
  AlertPosture,
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
  InfrastructureType,
  MilitaryOpType,
  MinorNationOpType,
  ResolutionKind,
  StrikeTargetSector,
  TradeOffer,
  TradeResourceKind,
  UltimatumDemand,
  UpgradeTrack,
} from '../shared/types.js';

function makeRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 5; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function uid(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function createAppServer() {
  const app = express();
  app.use(cors());
  app.use(compression());
  app.use(express.json({ limit: '5mb' }));

  const store = new RoomStore();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    maxHttpBufferSize: 5e6,
  });

  const socketSession = new Map<string, { roomCode: string; playerId: string }>();

  function hasActiveSocketForPlayer(roomCode: string, playerId: string): boolean {
    for (const sess of socketSession.values()) {
      if (sess.roomCode === roomCode && sess.playerId === playerId) {
        return true;
      }
    }
    return false;
  }

  function getActiveContext(socketId: string) {
    const sess = socketSession.get(socketId);
    if (!sess) return null;
    const room = store.get(sess.roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.id === sess.playerId);
    if (!player) return null;
    // Guarantee online status after F5 / reconnect!
    player.connected = true;
    if (player.countryId && room.countries[player.countryId]) {
      room.countries[player.countryId].isOnline = true;
    }
    return { sess, room, player };
  }

  function broadcastRoom(room: GameRoomState): void {
    store.scheduleSave();
    const socketsInRoom = io.sockets.adapter.rooms.get(room.roomCode);
    if (!socketsInRoom) return;
    for (const sockId of socketsInRoom) {
      const sess = socketSession.get(sockId);
      const sock = io.sockets.sockets.get(sockId);
      if (sock) {
        sock.emit('room:state', sanitizeRoomForPlayer(room, sess?.playerId || null));
      }
    }
  }

  function emitTargetedSound(room: GameRoomState, alertedCountryIds: CountryId[]): void {
    const socketsInRoom = io.sockets.adapter.rooms.get(room.roomCode);
    if (!socketsInRoom) return;
    for (const sockId of socketsInRoom) {
      const sess = socketSession.get(sockId);
      const sock = io.sockets.sockets.get(sockId);
      if (!sock || !sess) continue;
      const p = room.players.find((x) => x.id === sess.playerId);
      if (p?.countryId && alertedCountryIds.includes(p.countryId)) {
        sock.emit('room:sound', { type: 'RADAR_SIREN' });
      } else {
        sock.emit('room:sound', { type: 'TACTICAL_PING' });
      }
    }
  }

  function finalizeRoundAfterAlert(room: GameRoomState): void {
    if (room.settings.gmMode === 'HUMAN' && room.players.some((p) => p.isGM && p.connected)) {
      room.phase = 'GM_REVIEW';
      room.phaseEndsAt = null;
      io.to(room.roomCode).emit('room:sound', { type: 'GM_CHIME' });
      broadcastRoom(room);
    } else {
      resolveCurrentRound(room);
      io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
      broadcastRoom(room);
    }
  }

  function advanceFromPlanning(room: GameRoomState): void {
    if (room.isPaused) return;
    const { next, alertedCountryIds } = prepareEndOfPlanning(room);
    if (next === 'READY_TO_RESOLVE') {
      resolveCurrentRound(room);
      io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
    } else if (next === 'RADAR_ALERT') {
      emitTargetedSound(room, alertedCountryIds);
    } else if (next === 'GM_REVIEW') {
      io.to(room.roomCode).emit('room:sound', { type: 'GM_CHIME' });
    }
    broadcastRoom(room);
  }

  function checkAllHumansReady(room: GameRoomState): void {
    if (room.phase !== 'PLANNING' || room.isPaused) return;
    const activeOnlineHumanCountries = Object.values(room.countries).filter(
      (c) => c.playerId !== null && c.isOnline && !c.isEliminated
    );
    if (activeOnlineHumanCountries.length > 0 && activeOnlineHumanCountries.every((c) => c.isReady)) {
      advanceFromPlanning(room);
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '4.0.0', uptime: process.uptime() });
  });

  io.on('connection', (socket: Socket) => {
    socket.on(
      'lobby:create',
      (
        payload: {
          playerId: string;
          playerName: string;
          roomName?: string;
          settings?: Partial<GameSettings>;
        },
        cb?: (res: { ok: boolean; roomCode?: string; errorFa?: string }) => void
      ) => {
        // Leave any previous room on this socket first!
        const prev = socketSession.get(socket.id);
        if (prev) {
          socket.leave(prev.roomCode);
          socketSession.delete(socket.id);
        }

        const playerName = (payload.playerName || 'فرمانده').trim().slice(0, 24) || 'فرمانده';
        const playerId = payload.playerId || uid('plr');
        let code = makeRoomCode();
        while (store.get(code)) code = makeRoomCode();

        const gameMode: GameMode = payload.settings?.gameMode === 'SINGLE' ? 'SINGLE' : 'MULTI';
        const difficulty: DifficultyLevel =
          payload.settings?.difficulty === 'EXTREME'
            ? 'EXTREME'
            : payload.settings?.difficulty === 'HARD'
            ? 'HARD'
            : 'NORMAL';

        const settings: GameSettings = {
          gameMode,
          difficulty,
          gmMode: gameMode === 'SINGLE' ? 'AUTO' : payload.settings?.gmMode === 'HUMAN' ? 'HUMAN' : 'AUTO',
          maxRounds: clamp(Math.round(payload.settings?.maxRounds || 24), 6, 200),
          planningTimerSec:
            payload.settings?.planningTimerSec && payload.settings.planningTimerSec > 0
              ? clamp(Math.round(payload.settings.planningTimerSec), 45, 1200)
              : 0,
          enableAINations: payload.settings?.enableAINations ?? true,
        };

        const room = createNewRoomState(
          code,
          (payload.roomName || (gameMode === 'SINGLE' ? `کارزار تک‌نفره ${playerName}` : `اتاق جنگ ${playerName}`)).slice(0, 36),
          playerId,
          playerName,
          settings
        );

        store.set(code, room);
        socket.join(code);
        socketSession.set(socket.id, { roomCode: code, playerId });
        socket.emit('room:state', sanitizeRoomForPlayer(room, playerId));
        cb?.({ ok: true, roomCode: code });
      }
    );

    socket.on(
      'lobby:load_save',
      (
        payload: {
          playerId: string;
          playerName: string;
          saveCode?: string;
          rawRoomJson?: string;
        },
        cb?: (res: { ok: boolean; roomCode?: string; errorFa?: string }) => void
      ) => {
        const prev = socketSession.get(socket.id);
        if (prev) {
          socket.leave(prev.roomCode);
          socketSession.delete(socket.id);
        }

        const playerName = (payload.playerName || 'فرمانده').trim().slice(0, 24) || 'فرمانده';
        const playerId = payload.playerId || uid('plr');

        let savedRoom: GameRoomState | null = null;
        if (payload.rawRoomJson) {
          try {
            const parsed = JSON.parse(payload.rawRoomJson) as GameRoomState;
            if (parsed && parsed.schemaVersion === 4 && parsed.countries?.IR) {
              savedRoom = parsed;
            }
          } catch {
            cb?.({ ok: false, errorFa: 'فایل ذخیره بازی معتبر یا سالم نیست!' });
            return;
          }
        } else if (payload.saveCode) {
          savedRoom = store.loadPermanentSnapshot(payload.saveCode);
        }

        if (!savedRoom) {
          cb?.({
            ok: false,
            errorFa: 'کد یا فایل ذخیره بازی (نسخه ۴.۰) یافت نشد! لطفاً کد SV-... یا فایل .ww3save.json را بررسی کنید.',
          });
          return;
        }

        let code = makeRoomCode();
        while (store.get(code)) code = makeRoomCode();

        const resumed = prepareResumedRoom(savedRoom, playerId, playerName, code);
        store.set(code, resumed);
        socket.join(code);
        socketSession.set(socket.id, { roomCode: code, playerId });
        socket.emit('room:state', sanitizeRoomForPlayer(resumed, playerId));
        cb?.({ ok: true, roomCode: code });
      }
    );

    socket.on(
      'lobby:join',
      (
        payload: { roomCode: string; playerId: string; playerName: string },
        cb?: (res: { ok: boolean; roomCode?: string; errorFa?: string }) => void
      ) => {
        const code = (payload.roomCode || '').trim().toUpperCase();
        const room = store.get(code);
        if (!room) {
          cb?.({ ok: false, errorFa: 'کد لابی پیدا نشد! لطفاً کد ۵ حرفی را بررسی کنید.' });
          return;
        }

        const prev = socketSession.get(socket.id);
        if (prev && prev.roomCode !== code) {
          socket.leave(prev.roomCode);
          socketSession.delete(socket.id);
        }

        const playerName = (payload.playerName || 'فرمانده').trim().slice(0, 24) || 'فرمانده';
        const playerId = payload.playerId || uid('plr');

        let existing = room.players.find((p) => p.id === playerId);
        if (!existing) {
          if (room.settings.gameMode === 'SINGLE' && room.players.length >= 1) {
            cb?.({ ok: false, errorFa: 'این لابی در حالت تک‌نفره ساخته شده است.' });
            return;
          }
          existing = {
            id: playerId,
            name: playerName,
            isHost: false,
            isGM: false,
            isReadyInLobby: false,
            countryId: null,
            connected: true,
          };
          room.players.push(existing);
        } else {
          existing.name = playerName;
          existing.connected = true;
          if (existing.countryId && room.countries[existing.countryId]) {
            room.countries[existing.countryId].isOnline = true;
            room.countries[existing.countryId].playerName = playerName;
          }
        }

        socket.join(code);
        socketSession.set(socket.id, { roomCode: code, playerId });
        broadcastRoom(room);
        cb?.({ ok: true, roomCode: code });
      }
    );

    socket.on('lobby:leave', (cb?: (res: { ok: boolean }) => void) => {
      const sess = socketSession.get(socket.id);
      if (sess) {
        socket.leave(sess.roomCode);
        socketSession.delete(socket.id);
        const room = store.get(sess.roomCode);
        if (room && !hasActiveSocketForPlayer(sess.roomCode, sess.playerId)) {
          const pIdx = room.players.findIndex((p) => p.id === sess.playerId);
          if (pIdx !== -1) {
            const p = room.players[pIdx];
            if (room.phase === 'LOBBY') {
              if (p.countryId && room.countries[p.countryId]) {
                room.countries[p.countryId].playerId = null;
                room.countries[p.countryId].playerName = null;
                room.countries[p.countryId].isOnline = false;
              }
              room.players.splice(pIdx, 1);
              if (room.players.length > 0 && !room.players.some((x) => x.isHost)) {
                room.players[0].isHost = true;
              }
            } else {
              p.connected = false;
              if (p.countryId && room.countries[p.countryId]) {
                room.countries[p.countryId].isOnline = false;
              }
            }
            broadcastRoom(room);
          }
        }
      }
      cb?.({ ok: true });
    });

    socket.on('lobby:toggle_ready', () => {
      const ctx = getActiveContext(socket.id);
      if (!ctx || ctx.room.phase !== 'LOBBY') return;
      ctx.player.isReadyInLobby = !ctx.player.isReadyInLobby;
      broadcastRoom(ctx.room);
    });

    socket.on(
      'lobby:select_role',
      (
        payload: { countryId: CountryId | null; asGM?: boolean },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        const { room, player } = ctx;

        if (payload.asGM) {
          if (room.settings.gmMode !== 'HUMAN') {
            cb?.({ ok: false, errorFa: 'ابتدا حالت راوی انسانی را فعال کنید.' });
            return;
          }
          const otherGM = room.players.find((p) => p.isGM && p.id !== player.id);
          if (otherGM) {
            cb?.({ ok: false, errorFa: `${otherGM.name} هم‌اکنون راوی بازی است.` });
            return;
          }
          if (player.countryId && room.countries[player.countryId]) {
            room.countries[player.countryId].playerId = null;
            room.countries[player.countryId].playerName = null;
            room.countries[player.countryId].isOnline = false;
          }
          player.countryId = null;
          player.isGM = true;
          player.isReadyInLobby = true;
          broadcastRoom(room);
          cb?.({ ok: true });
          return;
        }

        if (payload.countryId) {
          const targetCountry = room.countries[payload.countryId];
          if (!targetCountry || targetCountry.isEliminated) {
            cb?.({ ok: false, errorFa: 'این کشور سقوط کرده و قابل انتخاب نیست.' });
            return;
          }
          if (targetCountry.playerId && targetCountry.playerId !== player.id) {
            cb?.({ ok: false, errorFa: 'این کشور قبلاً توسط بازیکن دیگری انتخاب شده است!' });
            return;
          }
          if (player.countryId && room.countries[player.countryId]) {
            room.countries[player.countryId].playerId = null;
            room.countries[player.countryId].playerName = null;
            room.countries[player.countryId].isOnline = false;
          }
          player.isGM = false;
          player.countryId = payload.countryId;
          player.isReadyInLobby = true;
          targetCountry.playerId = player.id;
          targetCountry.playerName = player.name;
          targetCountry.isOnline = true;
          broadcastRoom(room);
          cb?.({ ok: true });
        }
      }
    );

    socket.on('lobby:update_settings', (partial: Partial<GameSettings>) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx || ctx.room.phase !== 'LOBBY' || !ctx.player.isHost) return;
      const { room } = ctx;

      if (partial.gameMode) room.settings.gameMode = partial.gameMode;
      if (partial.difficulty) room.settings.difficulty = partial.difficulty;
      if (partial.gmMode) {
        room.settings.gmMode = partial.gmMode;
        if (partial.gmMode === 'AUTO') {
          for (const p of room.players) p.isGM = false;
        }
      }
      if (partial.maxRounds !== undefined) {
        room.settings.maxRounds = clamp(Math.round(partial.maxRounds), 6, 200);
      }
      if (partial.planningTimerSec !== undefined) {
        room.settings.planningTimerSec =
          partial.planningTimerSec > 0 ? clamp(Math.round(partial.planningTimerSec), 45, 1200) : 0;
      }
      if (partial.enableAINations !== undefined) room.settings.enableAINations = partial.enableAINations;
      broadcastRoom(room);
    });

    socket.on('lobby:start', (cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx || ctx.room.phase !== 'LOBBY') return;
      const { room, player } = ctx;
      if (!player.isHost) {
        cb?.({ ok: false, errorFa: 'فقط میزبان لابی می‌تواند بازی را آغاز کند.' });
        return;
      }
      if (!room.players.some((p) => p.countryId !== null)) {
        cb?.({ ok: false, errorFa: 'حداقل یک بازیکن باید یک کشور را انتخاب کند!' });
        return;
      }

      room.phase = 'PLANNING';
      room.isPaused = false;
      room.pausedRemainingMs = null;
      room.phaseEndsAt =
        room.settings.planningTimerSec > 0
          ? Date.now() + room.settings.planningTimerSec * 1000
          : null;
      io.to(room.roomCode).emit('room:sound', { type: 'GAME_START' });
      broadcastRoom(room);
      cb?.({ ok: true });
    });

    // === PAUSE, SAVE SNAPSHOT & REMATCH (ITEMS #1 & #5) ===
    socket.on(
      'game:toggle_pause',
      (cb?: (res: { ok: boolean; isPaused?: boolean; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        const { room, player } = ctx;
        if (!player.isHost && !player.isGM) {
          cb?.({ ok: false, errorFa: 'فقط میزبان بازی می‌تواند بازی را متوقف یا ادامه دهد.' });
          return;
        }
        if (room.phase === 'LOBBY' || room.phase === 'FINISHED') {
          cb?.({ ok: false, errorFa: 'توقف موقت فقط در جریان بازی فعال است.' });
          return;
        }

        if (!room.isPaused) {
          room.isPaused = true;
          if (room.phaseEndsAt) {
            room.pausedRemainingMs = Math.max(1000, room.phaseEndsAt - Date.now());
            room.phaseEndsAt = null;
          }
        } else {
          room.isPaused = false;
          if (room.pausedRemainingMs) {
            room.phaseEndsAt = Date.now() + room.pausedRemainingMs;
            room.pausedRemainingMs = null;
          }
        }
        broadcastRoom(room);
        cb?.({ ok: true, isPaused: room.isPaused });
      }
    );

    socket.on(
      'game:save_snapshot',
      (
        cb?: (res: {
          ok: boolean;
          saveCode?: string;
          roomJson?: string;
          fileName?: string;
          errorFa?: string;
        }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        const { room } = ctx;
        const saveCode = store.savePermanentSnapshot(room);
        room.lastSavedCode = saveCode;
        broadcastRoom(room);
        cb?.({
          ok: true,
          saveCode,
          roomJson: JSON.stringify(room),
          fileName: `ww3-${room.roomCode}-month${room.round}.ww3save.json`,
        });
      }
    );

    socket.on('game:rematch_lobby', (cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx) return;
      const { room, player } = ctx;
      if (!player.isHost) {
        cb?.({ ok: false, errorFa: 'فقط میزبان می‌تواند بازی جدید در همین لابی آغاز کند.' });
        return;
      }
      resetRoomForRematch(room);
      broadcastRoom(room);
      cb?.({ ok: true });
    });

    // === INSTANT ACTIONS ===
    socket.on(
      'game:instant_upgrade',
      (track: UpgradeTrack, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantUpgradeTrack(ctx.room, ctx.player.countryId, track);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:instant_infra',
      (infraType: InfrastructureType, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantBuildInfra(ctx.room, ctx.player.countryId, infraType);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:emergency_action',
      (kind: EmergencyActionKind, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantEmergencyAction(ctx.room, ctx.player.countryId, kind);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:instant_weapon',
      (
        payload: { weaponId: string; quantity?: number },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantProduceWeapon(ctx.room, ctx.player.countryId, payload.weaponId, payload.quantity || 1);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:sell_weapon',
      (
        payload: { weaponId: string; quantity?: number },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantSellWeapon(ctx.room, ctx.player.countryId, payload.weaponId, payload.quantity || 1);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:spot_trade',
      (
        payload: { resource: 'OIL' | 'GAS' | 'FOOD' | 'WATER' | 'URANIUM'; mode: 'BUY' | 'SELL' },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantSpotTrade(ctx.room, ctx.player.countryId, payload.resource, payload.mode);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on('game:toggle_autosell', () => {
      const ctx = getActiveContext(socket.id);
      if (!ctx?.player.countryId) return;
      const c = ctx.room.countries[ctx.player.countryId];
      if (c && !c.isEliminated) {
        c.autoSellSurplus = !c.autoSellSurplus;
        broadcastRoom(ctx.room);
      }
    });

    socket.on(
      'game:set_chokepoint',
      (status: ChokepointStatus, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantSetChokepoint(ctx.room, ctx.player.countryId, status);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:minor_pact',
      (minorId: string, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = instantMinorDiplomacyPact(ctx.room, ctx.player.countryId, minorId);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    // === DIPLOMATIC STATECRAFT (THREATEN, BEFRIEND, SOW DISCORD — ITEM #17) ===
    socket.on(
      'game:diplomatic_action',
      (
        payload: {
          targetCountry: CountryId;
          kind: DiplomaticActionKind;
          ultimatum?: UltimatumDemand;
          thirdCountry?: CountryId;
        },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = executeDiplomaticAction(ctx.room, ctx.player.countryId, payload.targetCountry, payload.kind, {
          ultimatum: payload.ultimatum,
          thirdCountry: payload.thirdCountry,
        });
        broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    // === COALITIONS ===
    socket.on(
      'game:create_coalition',
      (nameFa: string, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = createCoalition(ctx.room, ctx.player.countryId, nameFa);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:join_coalition',
      (coalitionId: string, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = joinCoalition(ctx.room, ctx.player.countryId, coalitionId);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    socket.on(
      'game:leave_coalition',
      (cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const res = leaveCoalition(ctx.room, ctx.player.countryId);
        if (res.ok) broadcastRoom(ctx.room);
        cb?.(res);
      }
    );

    // === QUEUED STRATEGIC & CONQUEST OPERATIONS ===
    socket.on(
      'game:queue_order',
      (
        draft: {
          kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION' | 'MINOR_NATION_OPERATION';
          targetCountry?: CountryId;
          targetMinorId?: string;
          militaryType?: MilitaryOpType;
          targetSector?: StrikeTargetSector;
          covertType?: CovertOpType;
          minorOpType?: MinorNationOpType;
        },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const result = queuePlayerOrder(ctx.room, ctx.player.countryId, draft);
        if (result.ok) broadcastRoom(ctx.room);
        cb?.({ ok: result.ok, errorFa: result.errorFa });
      }
    );

    socket.on('game:cancel_order', (orderId: string) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx?.player.countryId) return;
      if (cancelPlayerOrder(ctx.room, ctx.player.countryId, orderId)) {
        broadcastRoom(ctx.room);
      }
    });

    socket.on('game:toggle_ready', (ready: boolean) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx || ctx.room.phase !== 'PLANNING' || ctx.room.isPaused || !ctx.player.countryId) return;

      const c = ctx.room.countries[ctx.player.countryId];
      if (!c || c.isEliminated) return;
      c.isReady = ready;
      broadcastRoom(ctx.room);
      if (ready) checkAllHumansReady(ctx.room);
    });

    socket.on(
      'game:alert_posture',
      (posture: AlertPosture, cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;

        const res = applyAlertPosture(ctx.room, ctx.player.countryId, posture);
        if (!res.ok) {
          cb?.({ ok: false, errorFa: res.errorFa });
          return;
        }
        cb?.({ ok: true });
        if (res.allConfirmed) {
          finalizeRoundAfterAlert(ctx.room);
        } else {
          broadcastRoom(ctx.room);
        }
      }
    );

    socket.on('game:dismiss_summary', () => {
      const ctx = getActiveContext(socket.id);
      if (!ctx?.player.countryId) return;
      ctx.room.countries[ctx.player.countryId].lastRoundSummary = null;
      socket.emit('room:state', sanitizeRoomForPlayer(ctx.room, ctx.player.id));
    });

    // === INTERACTIVE DIPLOMATIC CHAT WITH LIVE AI NEGOTIATION ===
    socket.on(
      'game:send_chat',
      (payload: {
        channel: 'GLOBAL' | 'COALITION' | 'DIRECT' | 'GM_WHISPER';
        toCountry?: CountryId;
        text: string;
      }) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        const { room, player } = ctx;
        const cleanText = (payload.text || '').trim().slice(0, 380);
        if (!cleanText) return;

        const fromCountry: CountryId | 'GM' = player.isGM ? 'GM' : player.countryId!;
        if (!fromCountry) return;

        const senderCountryObj = fromCountry !== 'GM' ? room.countries[fromCountry] : null;
        if (payload.channel === 'COALITION' && !senderCountryObj?.coalitionId) return;

        const effectiveChannel =
          player.isGM && payload.toCountry ? 'GM_WHISPER' : payload.channel;

        room.messages.push({
          id: uid('msg'),
          timestamp: Date.now(),
          channel: effectiveChannel,
          coalitionId: effectiveChannel === 'COALITION' ? senderCountryObj?.coalitionId || undefined : undefined,
          fromCountry,
          fromName: player.isGM
            ? '🎙️ راوی کل جهان'
            : `${senderCountryObj?.nameFa || ''}${player.name ? ` (${player.name})` : ''}`,
          toCountry: payload.toCountry,
          text: cleanText,
        });
        if (room.messages.length > 150) room.messages.shift();
        broadcastRoom(room);

        if (
          effectiveChannel === 'DIRECT' &&
          payload.toCountry &&
          senderCountryObj &&
          room.countries[payload.toCountry] &&
          room.countries[payload.toCountry].playerId === null &&
          !room.countries[payload.toCountry].isEliminated
        ) {
          const targetId = payload.toCountry;
          const senderId = senderCountryObj.id;
          setTimeout(() => {
            const latestRoom = store.get(room.roomCode);
            if (!latestRoom) return;
            const targetAI = latestRoom.countries[targetId];
            const latestSender = latestRoom.countries[senderId];
            if (!targetAI || !latestSender || targetAI.isEliminated || targetAI.playerId !== null) return;

            const replyText = processInteractiveAIChat(latestRoom, targetAI, latestSender, cleanText);
            latestRoom.messages.push({
              id: uid('ai-reply'),
              timestamp: Date.now(),
              channel: 'DIRECT',
              fromCountry: targetAI.id,
              fromName: `${targetAI.nameFa} (وزارت خارجه)`,
              toCountry: latestSender.id,
              text: replyText,
            });
            if (latestRoom.messages.length > 150) latestRoom.messages.shift();
            broadcastRoom(latestRoom);
          }, 550);
        }
      }
    );

    socket.on(
      'game:propose_trade',
      (
        payload: {
          to: CountryId;
          offerType: TradeResourceKind;
          amount: number;
          weaponId?: string;
          priceB: number;
          direction: 'SELL' | 'BUY' | 'PACT';
          noteFa?: string;
        },
        cb?: (res: { ok: boolean; status?: string; messageFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId || ctx.player.countryId === payload.to) return;
        const { room, player } = ctx;

        const offer: TradeOffer = {
          id: uid('trd'),
          round: room.round,
          from: player.countryId!,
          to: payload.to,
          offerType: payload.offerType,
          amount: Math.max(1, Math.round(payload.amount || 1)),
          weaponId: payload.weaponId,
          priceB: Math.max(0, Math.round(payload.priceB || 0)),
          direction: payload.direction,
          noteFa: (payload.noteFa || '').slice(0, 140),
          status: 'PENDING',
        };

        const targetCountry = room.countries[payload.to];
        if (!targetCountry || targetCountry.isEliminated) return;

        if (targetCountry.playerId === null) {
          const decision = evaluateAITradeOffer(room, offer);
          offer.responseReasonFa = decision.reasonFa;
          if (decision.accepted) {
            const exec = executeAcceptedTrade(room, offer);
            if (exec.ok) {
              offer.status = 'ACCEPTED';
              room.trades.unshift(offer);
              updateRankingsAndDefcon(room);
              broadcastRoom(room);
              cb?.({ ok: true, status: 'ACCEPTED', messageFa: decision.reasonFa });
              return;
            }
            offer.status = 'REJECTED';
            offer.responseReasonFa = exec.errorFa;
            room.trades.unshift(offer);
            broadcastRoom(room);
            cb?.({ ok: false, status: 'REJECTED', messageFa: exec.errorFa });
            return;
          }
          offer.status = 'REJECTED';
          room.trades.unshift(offer);
          broadcastRoom(room);
          cb?.({ ok: false, status: 'REJECTED', messageFa: decision.reasonFa });
          return;
        }

        room.trades.unshift(offer);
        if (room.trades.length > 50) room.trades.length = 50;
        broadcastRoom(room);
        cb?.({
          ok: true,
          status: 'PENDING',
          messageFa: `پیشنهاد رسمی برای ${targetCountry.nameFa} ارسال شد.`,
        });
      }
    );

    socket.on(
      'game:respond_trade',
      (
        payload: { offerId: string; accept: boolean },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const { room, player } = ctx;

        const offer = room.trades.find((t) => t.id === payload.offerId && t.status === 'PENDING');
        if (!offer || offer.to !== player.countryId) return;

        if (!payload.accept) {
          offer.status = 'REJECTED';
          offer.responseReasonFa = `توسط ${room.countries[player.countryId].nameFa} رد شد.`;
          broadcastRoom(room);
          cb?.({ ok: true });
          return;
        }

        const exec = executeAcceptedTrade(room, offer);
        if (!exec.ok) {
          cb?.({ ok: false, errorFa: exec.errorFa });
          return;
        }
        offer.status = 'ACCEPTED';
        offer.responseReasonFa = 'قرارداد امضا و اجرا شد.';
        updateRankingsAndDefcon(room);
        broadcastRoom(room);
        cb?.({ ok: true });
      }
    );

    socket.on('game:toggle_sanction', (targetId: CountryId) => {
      const ctx = getActiveContext(socket.id);
      if (!ctx?.player.countryId || ctx.player.countryId === targetId) return;
      const { room, player } = ctx;

      const actor = room.countries[player.countryId!];
      const target = room.countries[targetId];
      if (!actor || !target || actor.isEliminated || target.isEliminated) return;

      if (target.sanctionedBy.includes(actor.id)) {
        target.sanctionedBy = target.sanctionedBy.filter((id) => id !== actor.id);
      } else {
        target.sanctionedBy.push(actor.id);
        actor.allies = actor.allies.filter((id) => id !== target.id);
        target.allies = target.allies.filter((id) => id !== actor.id);
        addNews(room, {
          agencyFa: 'رویترز اقتصادی',
          category: 'ECONOMY',
          breaking: false,
          headlineFa: `${actor.nameFa} تحریم‌های اقتصادی علیه ${target.nameFa} وضع کرد`,
          bodyFa: 'فشارهای بانکی و تجاری علیه کشور هدف افزایش یافت.',
          involvedCountries: [actor.id, target.id],
        });
      }
      updateRankingsAndDefcon(room);
      broadcastRoom(room);
    });

    // === UN SECURITY COUNCIL & SPECIAL SUMMIT COMMITTEES ===
    socket.on(
      'game:propose_un_resolution',
      (
        payload: { target: CountryId; kind: ResolutionKind },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const { room, player } = ctx;

        const proposer = room.countries[player.countryId!];
        const target = room.countries[payload.target];
        if (!proposer || !target || proposer.isEliminated) return;

        if (room.resolutions.filter((r) => r.status === 'ACTIVE').length >= 3) {
          cb?.({ ok: false, errorFa: 'حداکثر ۳ جلسه/قطعنامه همزمان در هر ماه قابل طرح است.' });
          return;
        }

        const spec = createResolutionSpec(proposer, target, payload.kind);
        room.resolutions.unshift({
          id: uid('un'),
          round: room.round,
          proposer: proposer.id,
          target: target.id,
          kind: payload.kind,
          committeeFa: spec.committeeFa,
          titleFa: spec.titleFa,
          effectSummaryFa: spec.effectSummaryFa,
          votesYes: [proposer.id],
          votesNo: [],
          vetoedBy: null,
          status: 'ACTIVE',
        });
        broadcastRoom(room);
        cb?.({ ok: true });
      }
    );

    socket.on(
      'game:vote_un_resolution',
      (payload: { resolutionId: string; vote: 'YES' | 'NO' | 'VETO' }) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx?.player.countryId) return;
        const { room, player } = ctx;

        const c = room.countries[player.countryId!];
        const res = room.resolutions.find((r) => r.id === payload.resolutionId && r.status === 'ACTIVE');
        if (!c || c.isEliminated || !res) return;

        res.votesYes = res.votesYes.filter((id) => id !== c.id);
        res.votesNo = res.votesNo.filter((id) => id !== c.id);

        const vetoAllowed =
          c.isUNVetoMember &&
          (res.kind === 'GLOBAL_SANCTION' || res.kind === 'CONDEMN_AGGRESSION' || res.kind === 'IAEA_INSPECTION');

        if (payload.vote === 'VETO' && vetoAllowed) {
          res.votesNo.push(c.id);
          res.vetoedBy = c.id;
          res.status = 'VETOED';
        } else if (payload.vote === 'YES') {
          res.votesYes.push(c.id);
        } else {
          res.votesNo.push(c.id);
        }
        broadcastRoom(room);
      }
    );

    // === SECRET CREATOR CHEAT CONSOLE SOCKET HANDLERS (ITEM #21!) ===
    socket.on(
      'creator:inspect',
      (
        secretKey: string,
        cb?: (res: { ok: boolean; fullRoom?: GameRoomState; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        if (!verifyCreatorKey(secretKey)) {
          cb?.({ ok: false, errorFa: 'کد دسترسی سازنده نامعتبر است.' });
          return;
        }
        cb?.({ ok: true, fullRoom: ctx.room });
      }
    );

    socket.on(
      'creator:exec',
      (
        payload: CreatorCheatPayload,
        cb?: (res: { ok: boolean; messageFa?: string; fullRoom?: GameRoomState; errorFa?: string }) => void
      ) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx) return;
        const res = applyCreatorCheat(ctx.room, payload);
        if (res.ok) {
          broadcastRoom(ctx.room);
          cb?.({ ok: true, messageFa: res.messageFa, fullRoom: ctx.room });
        } else {
          cb?.({ ok: false, errorFa: res.errorFa });
        }
      }
    );

    // === HUMAN GM CONTROLS ===
    socket.on(
      'gm:broadcast_news',
      (payload: { agencyFa: string; headlineFa: string; bodyFa: string; breaking: boolean }) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx || (!ctx.player.isGM && !ctx.player.isHost)) return;
        const { room } = ctx;

        addNews(room, {
          agencyFa: (payload.agencyFa || 'گزارش ویژه راوی').slice(0, 40),
          category: 'GM',
          breaking: Boolean(payload.breaking),
          headlineFa: (payload.headlineFa || '').slice(0, 180),
          bodyFa: (payload.bodyFa || '').slice(0, 380),
          involvedCountries: [],
        });
        if (payload.breaking) io.to(room.roomCode).emit('room:sound', { type: 'GM_CHIME' });
        broadcastRoom(room);
      }
    );

    socket.on(
      'gm:trigger_event',
      (payload: {
        targetCountry?: CountryId;
        preset: 'OIL_BOOM' | 'EARTHQUAKE' | 'MASS_PROTEST' | 'MILITARY_AID' | 'GLOBAL_OIL_SHOCK' | 'CALM_MARKETS';
      }) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx || (!ctx.player.isGM && !ctx.player.isHost)) return;
        const { room } = ctx;

        const target = payload.targetCountry ? room.countries[payload.targetCountry] : null;
        if (payload.preset === 'GLOBAL_OIL_SHOCK') {
          room.market.oilPriceUsd = Math.min(240, room.market.oilPriceUsd + 32);
          room.market.globalTension = Math.min(100, room.market.globalTension + 12);
          addNews(room, {
            agencyFa: 'بلومبرگ فوری',
            category: 'ECONOMY',
            breaking: true,
            headlineFa: `جهش ناگهانی بهای جهانی نفت به $${room.market.oilPriceUsd}!`,
            bodyFa: 'شوک عرضه جهانی بازارهای انرژی را تکان داد.',
            involvedCountries: [],
          });
        } else if (payload.preset === 'CALM_MARKETS') {
          room.market.oilPriceUsd = Math.max(65, room.market.oilPriceUsd - 20);
          room.market.globalTension = Math.max(10, room.market.globalTension - 15);
        } else if (target && !target.isEliminated) {
          if (payload.preset === 'OIL_BOOM') {
            target.oilReserve += 120;
            target.treasuryB += 50;
          } else if (payload.preset === 'EARTHQUAKE') {
            target.powerGrid = Math.max(20, target.powerGrid - 24);
            target.devastation = Math.min(100, target.devastation + 18);
          } else if (payload.preset === 'MASS_PROTEST') {
            target.approval = Math.max(12, target.approval - 18);
          } else if (payload.preset === 'MILITARY_AID') {
            target.treasuryB += 50;
            target.commanderBuff = Math.min(25, target.commanderBuff + 15);
            addIntel(target, room.round, 'SUCCESS', 'کمک ویژه نظامی دریافت شد', '+$50B بودجه و تقویت ارتش.');
          }
        }
        updateRankingsAndDefcon(room);
        broadcastRoom(room);
      }
    );

    socket.on(
      'gm:adjust_country',
      (payload: {
        countryId: CountryId;
        treasuryDelta?: number;
        approvalDelta?: number;
        oilDelta?: number;
        warheadsDelta?: number;
      }) => {
        const ctx = getActiveContext(socket.id);
        if (!ctx || (!ctx.player.isGM && !ctx.player.isHost)) return;
        const c = ctx.room.countries[payload.countryId];
        if (!c) return;

        if (payload.treasuryDelta) c.treasuryB = Math.max(0, c.treasuryB + payload.treasuryDelta);
        if (payload.approvalDelta) c.approval = clamp(c.approval + payload.approvalDelta, 0, 100);
        if (payload.oilDelta) c.oilReserve = Math.max(0, c.oilReserve + payload.oilDelta);
        if (payload.warheadsDelta) c.warheads = Math.max(0, c.warheads + payload.warheadsDelta);

        updateRankingsAndDefcon(ctx.room);
        broadcastRoom(ctx.room);
      }
    );

    socket.on('gm:force_advance', () => {
      const ctx = getActiveContext(socket.id);
      if (!ctx || (!ctx.player.isGM && !ctx.player.isHost)) return;
      const { room } = ctx;
      room.isPaused = false;
      room.pausedRemainingMs = null;

      if (room.phase === 'PLANNING') {
        advanceFromPlanning(room);
      } else if (room.phase === 'RADAR_ALERT' || room.phase === 'GM_REVIEW') {
        resolveCurrentRound(room);
        io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
        broadcastRoom(room);
      }
    });

    // === 100% F5-SAFE MULTI-SOCKET DISCONNECT HANDLER (ITEM #6!) ===
    socket.on('disconnect', () => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      socketSession.delete(socket.id);

      // Critical F5 Refresh Fix: If a newer socket for the same playerId is ALREADY connected,
      // DO NOT mark this player offline!
      if (hasActiveSocketForPlayer(sess.roomCode, sess.playerId)) {
        return;
      }

      const room = store.get(sess.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (player) {
        player.connected = false;
        if (player.countryId && room.countries[player.countryId]) {
          room.countries[player.countryId].isOnline = false;
        }
        if (room.phase === 'PLANNING' && !room.isPaused) {
          checkAllHumansReady(room);
        } else if (room.phase === 'RADAR_ALERT' && !room.isPaused) {
          const remainingAlerted = Object.values(room.countries).filter(
            (x) => x.incomingAlertActive && !x.isEliminated && x.playerId !== null && x.isOnline && !x.alertPostureConfirmed
          );
          if (remainingAlerted.length === 0) {
            finalizeRoundAfterAlert(room);
            return;
          }
        } else if (room.phase === 'GM_REVIEW' && player.isGM) {
          resolveCurrentRound(room);
          io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
        }
        broadcastRoom(room);
      }
    });
  });

  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of store.values()) {
      if (room.isPaused || !room.phaseEndsAt || now < room.phaseEndsAt) continue;

      if (room.phase === 'PLANNING') {
        advanceFromPlanning(room);
      } else if (room.phase === 'RADAR_ALERT') {
        finalizeRoundAfterAlert(room);
      }
    }
  }, 1000);

  const distPath = path.resolve(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => {
      if (
        req.method === 'GET' &&
        !req.path.startsWith('/api') &&
        !req.path.startsWith('/socket.io')
      ) {
        res.sendFile(path.join(distPath, 'index.html'));
        return;
      }
      next();
    });
  }

  return { app, httpServer, io, store, stopTicker: () => clearInterval(ticker) };
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isDirectRun) {
  const PORT = Number(process.env.PORT) || 3001;
  const { httpServer } = createAppServer();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🌍 WW3 Global Command v4.0 online on http://localhost:${PORT}`);
  });
}
