import compression from 'compression';
import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { Server, Socket } from 'socket.io';
import { evaluateAITradeOffer } from './aiNations.js';
import {
  addIntel,
  addNews,
  applyAlertPosture,
  cancelPlayerOrder,
  createNewRoomState,
  executeAcceptedTrade,
  instantBuildInfra,
  instantProduceWeapon,
  instantSetChokepoint,
  instantSpotTrade,
  instantUpgradeTrack,
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
  updateRankingsAndDefcon,
} from './gameEngine.js';
import { RoomStore } from './store.js';
import {
  AlertPosture,
  ChokepointStatus,
  CountryId,
  CovertOpType,
  GameRoomState,
  GameSettings,
  InfrastructureType,
  MilitaryOpType,
  StrikeTargetSector,
  TradeOffer,
  TradeResourceKind,
  UNResolution,
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

export function createAppServer() {
  const app = express();
  app.use(cors());
  app.use(compression());
  app.use(express.json());

  const store = new RoomStore();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  const socketSession = new Map<string, { roomCode: string; playerId: string }>();

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
        // ONLY the player actually under incoming missile/air attack hears the siren!
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
    if (room.phase !== 'PLANNING') return;
    const humanCountries = Object.values(room.countries).filter(
      (c) => c.playerId !== null && !c.isEliminated
    );
    if (humanCountries.length > 0 && humanCountries.every((c) => c.isReady)) {
      advanceFromPlanning(room);
    }
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: '2.0.0', uptime: process.uptime() });
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
        const playerName = (payload.playerName || 'فرمانده').trim().slice(0, 24) || 'فرمانده';
        const playerId = payload.playerId || uid('plr');
        let code = makeRoomCode();
        while (store.get(code)) code = makeRoomCode();

        const settings: GameSettings = {
          gmMode: payload.settings?.gmMode === 'HUMAN' ? 'HUMAN' : 'AUTO',
          maxRounds: payload.settings?.maxRounds || 12,
          planningTimerSec:
            payload.settings?.planningTimerSec !== undefined ? payload.settings.planningTimerSec : 0,
          enableAINations: payload.settings?.enableAINations ?? true,
        };

        const room = createNewRoomState(
          code,
          (payload.roomName || `اتاق جنگ ${playerName}`).slice(0, 36),
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

        const playerName = (payload.playerName || 'فرمانده').trim().slice(0, 24) || 'فرمانده';
        const playerId = payload.playerId || uid('plr');

        let existing = room.players.find((p) => p.id === playerId);
        if (!existing) {
          existing = {
            id: playerId,
            name: playerName,
            isHost: false,
            isGM: false,
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

    socket.on(
      'lobby:select_role',
      (
        payload: { countryId: CountryId | null; asGM?: boolean },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player) return;

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
          broadcastRoom(room);
          cb?.({ ok: true });
          return;
        }

        if (payload.countryId) {
          const targetCountry = room.countries[payload.countryId];
          if (!targetCountry) return;
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
          targetCountry.playerId = player.id;
          targetCountry.playerName = player.name;
          targetCountry.isOnline = true;
          broadcastRoom(room);
          cb?.({ ok: true });
        }
      }
    );

    socket.on('lobby:update_settings', (partial: Partial<GameSettings>) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room || room.phase !== 'LOBBY') return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.isHost) return;

      if (partial.gmMode) {
        room.settings.gmMode = partial.gmMode;
        if (partial.gmMode === 'AUTO') {
          for (const p of room.players) p.isGM = false;
        }
      }
      if (partial.maxRounds) room.settings.maxRounds = partial.maxRounds;
      if (partial.planningTimerSec !== undefined) room.settings.planningTimerSec = partial.planningTimerSec;
      if (partial.enableAINations !== undefined) room.settings.enableAINations = partial.enableAINations;
      broadcastRoom(room);
    });

    socket.on('lobby:start', (cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room || room.phase !== 'LOBBY') return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.isHost) {
        cb?.({ ok: false, errorFa: 'فقط میزبان لابی می‌تواند بازی را آغاز کند.' });
        return;
      }
      if (!room.players.some((p) => p.countryId !== null)) {
        cb?.({ ok: false, errorFa: 'حداقل یک بازیکن باید یک کشور را انتخاب کند!' });
        return;
      }

      room.phase = 'PLANNING';
      room.phaseEndsAt =
        room.settings.planningTimerSec > 0
          ? Date.now() + room.settings.planningTimerSec * 1000
          : null;
      io.to(room.roomCode).emit('room:sound', { type: 'GAME_START' });
      broadcastRoom(room);
      cb?.({ ok: true });
    });

    // === INSTANT ACTIONS (Level-Ups, Infrastructures, Weapons, 1-Click Oil Spot Market!) ===
    socket.on(
      'game:instant_upgrade',
      (track: UpgradeTrack, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const res = instantUpgradeTrack(room, player.countryId, track);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    socket.on(
      'game:instant_infra',
      (infraType: InfrastructureType, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const res = instantBuildInfra(room, player.countryId, infraType);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    socket.on(
      'game:instant_weapon',
      (
        payload: { weaponId: string; quantity?: number },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const res = instantProduceWeapon(room, player.countryId, payload.weaponId, payload.quantity || 1);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    socket.on(
      'game:spot_trade',
      (
        payload: { resource: 'OIL' | 'GAS' | 'FOOD' | 'URANIUM'; mode: 'BUY' | 'SELL' },
        cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void
      ) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const res = instantSpotTrade(room, player.countryId, payload.resource, payload.mode);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    socket.on('game:toggle_autosell', () => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      const player = room?.players.find((p) => p.id === sess.playerId);
      if (!room || !player?.countryId) return;
      const c = room.countries[player.countryId];
      if (c) {
        c.autoSellSurplus = !c.autoSellSurplus;
        broadcastRoom(room);
      }
    });

    socket.on(
      'game:set_chokepoint',
      (status: ChokepointStatus, cb?: (res: { ok: boolean; messageFa?: string; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const res = instantSetChokepoint(room, player.countryId, status);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    // === STRATEGIC QUEUED OPERATIONS ===
    socket.on(
      'game:queue_order',
      (
        draft: {
          kind: 'MILITARY_OPERATION' | 'COVERT_OPERATION';
          targetCountry: CountryId;
          militaryType?: MilitaryOpType;
          targetSector?: StrikeTargetSector;
          covertType?: CovertOpType;
        },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;
        const result = queuePlayerOrder(room, player.countryId, draft);
        if (result.ok) broadcastRoom(room);
        cb?.({ ok: result.ok, errorFa: result.errorFa });
      }
    );

    socket.on('game:cancel_order', (orderId: string) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      const player = room?.players.find((p) => p.id === sess.playerId);
      if (!room || !player?.countryId) return;
      if (cancelPlayerOrder(room, player.countryId, orderId)) {
        broadcastRoom(room);
      }
    });

    socket.on('game:toggle_ready', (ready: boolean) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room || room.phase !== 'PLANNING') return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.countryId) return;

      const c = room.countries[player.countryId];
      if (!c) return;
      c.isReady = ready;
      broadcastRoom(room);
      if (ready) checkAllHumansReady(room);
    });

    // BUG-FREE RADAR ALERT: Immediately advances round once all alerted defenders pick their defense!
    socket.on(
      'game:alert_posture',
      (posture: AlertPosture, cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;

        const res = applyAlertPosture(room, player.countryId, posture);
        if (!res.ok) {
          cb?.({ ok: false, errorFa: res.errorFa });
          return;
        }
        cb?.({ ok: true });
        if (res.allConfirmed) {
          finalizeRoundAfterAlert(room);
        } else {
          broadcastRoom(room);
        }
      }
    );

    socket.on('game:dismiss_summary', () => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      const player = room?.players.find((p) => p.id === sess.playerId);
      if (!room || !player?.countryId) return;
      room.countries[player.countryId].lastRoundSummary = null;
      socket.emit('room:state', sanitizeRoomForPlayer(room, player.id));
    });

    socket.on(
      'game:send_chat',
      (payload: { channel: 'GLOBAL' | 'DIRECT' | 'GM_WHISPER'; toCountry?: CountryId; text: string }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player) return;
        const cleanText = (payload.text || '').trim().slice(0, 350);
        if (!cleanText) return;

        const fromCountry: CountryId | 'GM' = player.isGM ? 'GM' : player.countryId!;
        if (!fromCountry) return;

        room.messages.push({
          id: uid('msg'),
          timestamp: Date.now(),
          channel: player.isGM && payload.toCountry ? 'GM_WHISPER' : payload.channel,
          fromCountry,
          fromName: player.isGM
            ? '🎙️ راوی کل جهان'
            : room.countries[fromCountry as CountryId].nameFa,
          toCountry: payload.toCountry,
          text: cleanText,
        });
        if (room.messages.length > 120) room.messages.shift();
        broadcastRoom(room);
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
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId || player.countryId === payload.to) return;

        const offer: TradeOffer = {
          id: uid('trd'),
          round: room.round,
          from: player.countryId,
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
        if (!targetCountry) return;

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
        if (room.trades.length > 40) room.trades.length = 40;
        broadcastRoom(room);
        cb?.({
          ok: true,
          status: 'PENDING',
          messageFa: `قرارداد برای ${targetCountry.nameFa} ارسال شد.`,
        });
      }
    );

    socket.on(
      'game:respond_trade',
      (
        payload: { offerId: string; accept: boolean },
        cb?: (res: { ok: boolean; errorFa?: string }) => void
      ) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;

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
        offer.responseReasonFa = `قرارداد امضا و اجرا شد.`;
        updateRankingsAndDefcon(room);
        broadcastRoom(room);
        cb?.({ ok: true });
      }
    );

    socket.on('game:toggle_sanction', (targetId: CountryId) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      const player = room?.players.find((p) => p.id === sess.playerId);
      if (!room || !player?.countryId || player.countryId === targetId) return;

      const actor = room.countries[player.countryId];
      const target = room.countries[targetId];
      if (!actor || !target) return;

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
          bodyFa: 'فشار بانکی و تجاری علیه کشور هدف افزایش یافت.',
          involvedCountries: [actor.id, target.id],
        });
      }
      updateRankingsAndDefcon(room);
      broadcastRoom(room);
    });

    socket.on(
      'game:propose_un_resolution',
      (payload: { target: CountryId; kind: UNResolution['kind'] }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;

        const proposer = room.countries[player.countryId];
        const target = room.countries[payload.target];
        if (!proposer || !target) return;

        const titleFa =
          payload.kind === 'GLOBAL_SANCTION'
            ? `قطعنامه تحریم اقتصادی جهانی علیه ${target.nameFa}`
            : payload.kind === 'CEASEFIRE_DEMAND'
            ? `قطعنامه آتش‌بس فوری با محوریت ${target.nameFa}`
            : `قطعنامه محکومیت نظامی ${target.nameFa}`;

        room.resolutions.unshift({
          id: uid('un'),
          round: room.round,
          proposer: proposer.id,
          target: target.id,
          kind: payload.kind,
          titleFa,
          votesYes: [proposer.id],
          votesNo: [],
          vetoedBy: null,
          status: 'ACTIVE',
        });
        broadcastRoom(room);
      }
    );

    socket.on(
      'game:vote_un_resolution',
      (payload: { resolutionId: string; vote: 'YES' | 'NO' | 'VETO' }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || !player?.countryId) return;

        const c = room.countries[player.countryId];
        const res = room.resolutions.find((r) => r.id === payload.resolutionId && r.status === 'ACTIVE');
        if (!c || !res) return;

        res.votesYes = res.votesYes.filter((id) => id !== c.id);
        res.votesNo = res.votesNo.filter((id) => id !== c.id);

        if (payload.vote === 'VETO' && c.isUNVetoMember) {
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

    // === HUMAN GM CONTROLS ===
    socket.on(
      'gm:broadcast_news',
      (payload: { agencyFa: string; headlineFa: string; bodyFa: string; breaking: boolean }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || (!player?.isGM && !player?.isHost)) return;

        addNews(room, {
          agencyFa: (payload.agencyFa || 'گزارش ویژه راوی').slice(0, 40),
          category: 'GM',
          breaking: Boolean(payload.breaking),
          headlineFa: (payload.headlineFa || '').slice(0, 180),
          bodyFa: (payload.bodyFa || '').slice(0, 350),
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
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || (!player?.isGM && !player?.isHost)) return;

        const target = payload.targetCountry ? room.countries[payload.targetCountry] : null;
        if (payload.preset === 'GLOBAL_OIL_SHOCK') {
          room.market.oilPriceUsd = Math.min(220, room.market.oilPriceUsd + 32);
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
        } else if (target) {
          if (payload.preset === 'OIL_BOOM') {
            target.oilReserve += 120;
            target.treasuryB += 50;
          } else if (payload.preset === 'EARTHQUAKE') {
            target.powerGrid = Math.max(20, target.powerGrid - 24);
            target.treasuryB = Math.max(10, target.treasuryB - 30);
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
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        const player = room?.players.find((p) => p.id === sess.playerId);
        if (!room || (!player?.isGM && !player?.isHost)) return;
        const c = room.countries[payload.countryId];
        if (!c) return;

        if (payload.treasuryDelta) c.treasuryB = Math.max(0, c.treasuryB + payload.treasuryDelta);
        if (payload.approvalDelta) c.approval = Math.max(0, Math.min(100, c.approval + payload.approvalDelta));
        if (payload.oilDelta) c.oilReserve = Math.max(0, c.oilReserve + payload.oilDelta);
        if (payload.warheadsDelta) c.warheads = Math.max(0, c.warheads + payload.warheadsDelta);

        updateRankingsAndDefcon(room);
        broadcastRoom(room);
      }
    );

    socket.on('gm:force_advance', () => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      const player = room?.players.find((p) => p.id === sess.playerId);
      if (!room || (!player?.isGM && !player?.isHost)) return;

      if (room.phase === 'PLANNING') {
        advanceFromPlanning(room);
      } else if (room.phase === 'RADAR_ALERT' || room.phase === 'GM_REVIEW') {
        resolveCurrentRound(room);
        io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
        broadcastRoom(room);
      }
    });

    socket.on('disconnect', () => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      socketSession.delete(socket.id);
      const room = store.get(sess.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (player) {
        player.connected = false;
        if (player.countryId && room.countries[player.countryId]) {
          room.countries[player.countryId].isOnline = false;
        }
        broadcastRoom(room);
      }
    });
  });

  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of store.values()) {
      if (!room.phaseEndsAt || now < room.phaseEndsAt) continue;

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
    console.log(`🌍 WW3 Global Command v2.0 online on http://localhost:${PORT}`);
  });
}
