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
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
  updateRankingsAndDefcon,
} from './gameEngine.js';
import { RoomStore } from './store.js';
import {
  AlertPosture,
  CountryId,
  GameOrder,
  GameRoomState,
  GameSettings,
  TradeOffer,
  TradeResourceKind,
  UNResolution,
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

  // Track socket.id -> { roomCode, playerId }
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

  function advanceFromPlanning(room: GameRoomState): void {
    const nextStep = prepareEndOfPlanning(room);
    if (nextStep === 'READY_TO_RESOLVE') {
      resolveCurrentRound(room);
      io.to(room.roomCode).emit('room:sound', { type: 'ROUND_RESOLVED', defcon: room.defcon });
    } else if (nextStep === 'RADAR_ALERT') {
      io.to(room.roomCode).emit('room:sound', { type: 'RADAR_SIREN' });
    } else if (nextStep === 'GM_REVIEW') {
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
    res.json({ ok: true, uptime: process.uptime() });
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

        // Allow selecting an available country even mid-game (hot-join!) if AI-controlled
        if (payload.asGM) {
          if (room.settings.gmMode !== 'HUMAN') {
            cb?.({ ok: false, errorFa: 'این لابی در حالت راوی خودکار است؛ ابتدا حالت راوی انسانی را فعال کنید.' });
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
          // Release previous country if any
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
      const chosenCountries = room.players.filter((p) => p.countryId !== null);
      if (chosenCountries.length === 0) {
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

    // === GAMEPLAY EVENTS ===
    socket.on(
      'game:queue_order',
      (draft: Partial<GameOrder>, cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId) {
          cb?.({ ok: false, errorFa: 'شما کنترل کشوری را در دست ندارید.' });
          return;
        }
        const result = queuePlayerOrder(room, player.countryId, draft);
        if (result.ok) {
          broadcastRoom(room);
        }
        cb?.({ ok: result.ok, errorFa: result.errorFa });
      }
    );

    socket.on('game:cancel_order', (orderId: string) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.countryId) return;
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
      if (ready) {
        checkAllHumansReady(room);
      }
    });

    socket.on(
      'game:alert_posture',
      (posture: AlertPosture, cb?: (res: { ok: boolean; errorFa?: string }) => void) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId) return;

        const res = applyAlertPosture(room, player.countryId, posture);
        if (res.ok) broadcastRoom(room);
        cb?.(res);
      }
    );

    socket.on(
      'game:send_chat',
      (payload: { channel: 'GLOBAL' | 'DIRECT' | 'GM_WHISPER'; toCountry?: CountryId; text: string }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player) return;
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
            ? '🎙️ راوی و اتاق کنترل جهان'
            : `${room.countries[fromCountry as CountryId].flag} ${room.countries[fromCountry as CountryId].nameFa}`,
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
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId || player.countryId === payload.to) return;

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

        // If target is AI controlled -> instant intelligent evaluation & execution!
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
            } else {
              offer.status = 'REJECTED';
              offer.responseReasonFa = exec.errorFa;
              room.trades.unshift(offer);
              broadcastRoom(room);
              cb?.({ ok: false, status: 'REJECTED', messageFa: exec.errorFa });
              return;
            }
          } else {
            offer.status = 'REJECTED';
            room.trades.unshift(offer);
            broadcastRoom(room);
            cb?.({ ok: false, status: 'REJECTED', messageFa: decision.reasonFa });
            return;
          }
        }

        // Human recipient -> notify live!
        room.trades.unshift(offer);
        if (room.trades.length > 40) room.trades.length = 40;
        broadcastRoom(room);
        cb?.({
          ok: true,
          status: 'PENDING',
          messageFa: `پیشنهاد رسمی به ${targetCountry.nameFa} ارسال شد و منتظر تایید بازیکن مقابل است.`,
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
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId) return;

        const offer = room.trades.find((t) => t.id === payload.offerId && t.status === 'PENDING');
        if (!offer || offer.to !== player.countryId) return;

        if (!payload.accept) {
          offer.status = 'REJECTED';
          offer.responseReasonFa = `توسط دولت ${room.countries[player.countryId].nameFa} رد شد.`;
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
        offer.responseReasonFa = `توافق دوجانبه امضا و اجرا شد.`;
        updateRankingsAndDefcon(room);
        broadcastRoom(room);
        cb?.({ ok: true });
      }
    );

    socket.on('game:toggle_sanction', (targetId: CountryId) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.countryId || player.countryId === targetId) return;

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
          headlineFa: `${actor.flag} ${actor.nameFa} بسته جدید تحریم‌های اقتصادی علیه ${target.flag} ${target.nameFa} وضع کرد`,
          bodyFa: 'محدودیت‌های بانکی و صادراتی علیه کشور هدف اعمال شد.',
          involvedCountries: [actor.id, target.id],
        });
      }
      updateRankingsAndDefcon(room);
      broadcastRoom(room);
    });

    socket.on('game:toggle_airspace', (payload: { targetId: CountryId; mode: 'OPEN' | 'CLOSED' }) => {
      const sess = socketSession.get(socket.id);
      if (!sess) return;
      const room = store.get(sess.roomCode);
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.countryId || player.countryId === payload.targetId) return;

      const actor = room.countries[player.countryId];
      if (payload.mode === 'CLOSED') {
        if (!actor.airspaceClosedTo.includes(payload.targetId)) actor.airspaceClosedTo.push(payload.targetId);
        actor.airspaceOpenTo = actor.airspaceOpenTo.filter((id) => id !== payload.targetId);
      } else {
        if (!actor.airspaceOpenTo.includes(payload.targetId)) actor.airspaceOpenTo.push(payload.targetId);
        actor.airspaceClosedTo = actor.airspaceClosedTo.filter((id) => id !== payload.targetId);
      }
      broadcastRoom(room);
    });

    socket.on(
      'game:propose_un_resolution',
      (payload: { target: CountryId; kind: UNResolution['kind'] }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId) return;

        const proposer = room.countries[player.countryId];
        const target = room.countries[payload.target];
        if (!proposer || !target) return;

        const titleFa =
          payload.kind === 'GLOBAL_SANCTION'
            ? `قطعنامه تحریم اقتصادی بین‌المللی علیه ${target.nameFa} به پیشنهاد ${proposer.nameFa}`
            : payload.kind === 'CEASEFIRE_DEMAND'
            ? `قطعنامه آتش‌بس فوری و کاهش تنش با محوریت ${target.nameFa}`
            : `قطعنامه محکومیت اقدامات نظامی و امنیتی ${target.nameFa}`;

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
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.countryId) return;

        const c = room.countries[player.countryId];
        const res = room.resolutions.find((r) => r.id === payload.resolutionId && r.status === 'ACTIVE');
        if (!c || !res) return;

        res.votesYes = res.votesYes.filter((id) => id !== c.id);
        res.votesNo = res.votesNo.filter((id) => id !== c.id);

        if (payload.vote === 'VETO' && c.isUNVetoMember) {
          res.votesNo.push(c.id);
          res.vetoedBy = c.id;
          res.status = 'VETOED';
          addNews(room, {
            agencyFa: 'شورای امنیت سازمان ملل',
            category: 'DIPLOMACY',
            breaking: true,
            headlineFa: `حق وتو اعمال شد! ${c.flag} ${c.nameFa} قطعنامه شورای امنیت را وتو کرد`,
            bodyFa: res.titleFa,
            involvedCountries: [c.id, res.target],
          });
        } else if (payload.vote === 'YES') {
          res.votesYes.push(c.id);
        } else {
          res.votesNo.push(c.id);
        }
        broadcastRoom(room);
      }
    );

    // === HUMAN GAME MASTER (NARRATOR) GOD-MODE CONTROLS ===
    socket.on(
      'gm:broadcast_news',
      (payload: { agencyFa: string; headlineFa: string; bodyFa: string; breaking: boolean }) => {
        const sess = socketSession.get(socket.id);
        if (!sess) return;
        const room = store.get(sess.roomCode);
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.isGM && !player?.isHost) return;

        addNews(room, {
          agencyFa: (payload.agencyFa || 'گزارش ویژه راوی جهان').slice(0, 40),
          category: 'GM',
          breaking: Boolean(payload.breaking),
          headlineFa: (payload.headlineFa || '').slice(0, 180),
          bodyFa: (payload.bodyFa || '').slice(0, 350),
          involvedCountries: [],
        });
        if (payload.breaking) {
          io.to(room.roomCode).emit('room:sound', { type: 'GM_CHIME' });
        }
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
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.isGM && !player?.isHost) return;

        const target = payload.targetCountry ? room.countries[payload.targetCountry] : null;
        if (payload.preset === 'GLOBAL_OIL_SHOCK') {
          room.market.oilPriceUsd = Math.min(220, room.market.oilPriceUsd + 32);
          room.market.globalTension = Math.min(100, room.market.globalTension + 12);
          addNews(room, {
            agencyFa: 'بلومبرگ فوری',
            category: 'ECONOMY',
            breaking: true,
            headlineFa: `جهش ناگهانی بهای جهانی نفت به $${room.market.oilPriceUsd} در پی شوک عرضه بین‌المللی!`,
            bodyFa: 'بازارهای بورس جهان در واکنش به بحران انرژی قرمزپوش شدند.',
            involvedCountries: [],
          });
        } else if (payload.preset === 'CALM_MARKETS') {
          room.market.oilPriceUsd = Math.max(65, room.market.oilPriceUsd - 20);
          room.market.globalTension = Math.max(10, room.market.globalTension - 15);
          addNews(room, {
            agencyFa: 'رویترز جهانی',
            category: 'DIPLOMACY',
            breaking: false,
            headlineFa: 'نشست صلح ژنو موجب کاهش تنش‌های جهانی و آرامش نسبی بازار انرژی شد',
            bodyFa: 'شاخص امیدواری اقتصادی در بورس‌های بزرگ رشد کرد.',
            involvedCountries: [],
          });
        } else if (target) {
          if (payload.preset === 'OIL_BOOM') {
            target.oilReserve += 110;
            target.treasuryB += 45;
            addNews(room, {
              agencyFa: 'رویترز انرژی',
              category: 'ECONOMY',
              breaking: true,
              headlineFa: `کشف میدان عظیم نفت و گاز جدید در ${target.flag} ${target.nameFa}!`,
              bodyFa: 'ذخایر استراتژیک انرژی و ارزش دارایی‌های ملی این کشور جهش یافت.',
              involvedCountries: [target.id],
            });
          } else if (payload.preset === 'EARTHQUAKE') {
            target.powerGrid = Math.max(20, target.powerGrid - 22);
            target.treasuryB = Math.max(10, target.treasuryB - 30);
            addNews(room, {
              agencyFa: 'بی‌بی‌سی فوری',
              category: 'WORLD_EVENT',
              breaking: true,
              headlineFa: `زلزله شدید در مناطق صنعتی ${target.flag} ${target.nameFa}؛ خسارت به شبکه برق و زیرساخت‌ها`,
              bodyFa: 'تیم‌های امدادی برای بازسازی شبکه انتقال برق وارد عمل شدند.',
              involvedCountries: [target.id],
            });
          } else if (payload.preset === 'MASS_PROTEST') {
            target.approval = Math.max(12, target.approval - 18);
            addNews(room, {
              agencyFa: 'فرانس‌پرس فوری',
              category: 'WORLD_EVENT',
              breaking: true,
              headlineFa: `تظاهرات گسترده و اعتصاب کارگری در شهرهای بزرگ ${target.flag} ${target.nameFa}!`,
              bodyFa: 'مخالفان دولت خواستار اصلاحات فوری اقتصادی شدند.',
              involvedCountries: [target.id],
            });
          } else if (payload.preset === 'MILITARY_AID') {
            target.treasuryB += 50;
            target.commanderBuff = Math.min(25, target.commanderBuff + 15);
            addIntel(target, room.round, 'SUCCESS', 'بسته ویژه پشتیبانی استراتژیک دریافت شد', '+$50B بودجه و تقویت روحیه ارتش.');
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
        if (!room) return;
        const player = room.players.find((p) => p.id === sess.playerId);
        if (!player?.isGM && !player?.isHost) return;
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
      if (!room) return;
      const player = room.players.find((p) => p.id === sess.playerId);
      if (!player?.isGM && !player?.isHost) return;

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

  // 1-second phase timer ticker (handles timed PLANNING & 30s RADAR_ALERT seamlessly)
  const ticker = setInterval(() => {
    const now = Date.now();
    for (const room of store.values()) {
      if (!room.phaseEndsAt || now < room.phaseEndsAt) continue;

      if (room.phase === 'PLANNING') {
        advanceFromPlanning(room);
      } else if (room.phase === 'RADAR_ALERT') {
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
    }
  }, 1000);

  // Serve built Vite SPA in production
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

// Start server when invoked directly
const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'));

if (isDirectRun) {
  const PORT = Number(process.env.PORT) || 3001;
  const { httpServer } = createAppServer();
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`🌍 WW3 Global Command Server online on http://localhost:${PORT}`);
  });
}
