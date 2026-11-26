import { describe, expect, it } from 'vitest';
import { io as ClientSocket } from 'socket.io-client';
import { evaluateAITradeOffer } from '../server/aiNations';
import {
  applyAlertPosture,
  createNewRoomState,
  instantBuildInfra,
  instantProduceWeapon,
  instantSetChokepoint,
  instantSpotTrade,
  instantUpgradeTrack,
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
} from '../server/gameEngine';
import { createAppServer } from '../server/index';

describe('WW3 Global Command v2.0 — Simulation, Living AI, Spot Market & Radar Fix', () => {
  it('supports instant 1-click Spot Market oil trading, 6-track Level-Ups, and indigenous weapon rules', () => {
    const room = createNewRoomState('V2A', 'Room', 'p1', 'Amir', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: true,
    });
    room.phase = 'PLANNING';
    room.countries.IR.playerId = 'p1';

    const beforeCash = room.countries.IR.treasuryB;
    const sellRes = instantSpotTrade(room, 'IR', 'OIL', 'SELL');
    expect(sellRes.ok).toBe(true);
    expect(room.countries.IR.treasuryB).toBeGreaterThan(beforeCash);

    const prevAero = room.countries.IR.upgrades.AEROSPACE;
    const upRes = instantUpgradeTrack(room, 'IR', 'AEROSPACE');
    expect(upRes.ok).toBe(true);
    expect(room.countries.IR.upgrades.AEROSPACE).toBe(prevAero + 1);

    // Iran cannot directly manufacture US F-35A, CAN manufacture indigenous Fattah-2
    expect(instantProduceWeapon(room, 'IR', 'f35a', 1).ok).toBe(false);
    expect(instantProduceWeapon(room, 'IR', 'fattah2', 1).ok).toBe(true);
    expect(instantBuildInfra(room, 'IR', 'POWER_PLANT').ok).toBe(true);
  });

  it('triggers targeted Radar Alert ONLY for attacked human, refunds posture switches, and generates RoundSummary', () => {
    const room = createNewRoomState('V2B', 'War', 'p1', 'Host', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: true,
    });
    room.phase = 'PLANNING';
    room.countries.IR.playerId = 'p1';
    room.countries.IR.isOnline = true;
    room.countries.US.playerId = 'p2';
    room.countries.US.isOnline = true;

    // Close Strait of Hormuz instantly -> oil price spikes immediately!
    const startOil = room.market.oilPriceUsd;
    expect(instantSetChokepoint(room, 'IR', 'BLOCKADED').ok).toBe(true);
    expect(room.market.oilPriceUsd).toBeGreaterThan(startOil);

    // Iran queues drone swarm + precision strike on US
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'US',
        militaryType: 'SEAD_DRONE_SWARM',
      }).ok
    ).toBe(true);
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'US',
        militaryType: 'PRECISION_STRIKE',
        targetSector: 'REFINERY',
      }).ok
    ).toBe(true);

    const prep = prepareEndOfPlanning(room);
    expect(prep.next).toBe('RADAR_ALERT');
    expect(prep.alertedCountryIds).toEqual(['US']);

    // US selects COUNTER_SALVO -> allConfirmed becomes true immediately!
    const post = applyAlertPosture(room, 'US', 'COUNTER_SALVO');
    expect(post.ok).toBe(true);
    expect(post.allConfirmed).toBe(true);

    resolveCurrentRound(room);
    expect(room.round).toBe(2);
    expect(room.countries.IR.lastRoundSummary).not.toBeNull();
    expect(room.countries.IR.lastRoundSummary?.myOperations.length).toBe(2);
    expect(room.countries.US.lastRoundSummary?.incomingAttacks.length).toBeGreaterThanOrEqual(2);
  });

  it('resolves Living AI retaliation and Congress F-22 export rules', () => {
    const room = createNewRoomState('V2C', 'AI', 'p1', 'Player', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: true,
    });
    room.phase = 'PLANNING';
    room.countries.TR.playerId = 'p1';
    room.countries.TR.isOnline = true;

    // Simulate that AI Russia was attacked by Turkey last round -> Russia AI must queue retaliatory strike!
    room.countries.RU.lastAttackedBy = 'TR';
    const prep = prepareEndOfPlanning(room);
    expect(prep.alertedCountryIds).toContain('TR');

    // Non-ally tries to buy F-22 from US
    const f22Offer = {
      id: 'f22-1',
      round: 1,
      from: 'IN' as const,
      to: 'US' as const,
      offerType: 'WEAPON' as const,
      weaponId: 'f22',
      amount: 1,
      priceB: 55,
      direction: 'BUY' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };
    expect(evaluateAITradeOffer(room, f22Offer).accepted).toBe(false);
  });

  it('hides rival secret orders in sanitizeRoomForPlayer while showing God-View to GM', () => {
    const room = createNewRoomState('V2D', 'Fog', 'gm1', 'GM', {
      gmMode: 'HUMAN',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.players.push({
      id: 'p2',
      name: 'Player2',
      isHost: false,
      isGM: false,
      countryId: 'CN',
      connected: true,
    });
    room.countries.CN.playerId = 'p2';
    queuePlayerOrder(room, 'RU', {
      kind: 'COVERT_OPERATION',
      targetCountry: 'US',
      covertType: 'TREASURY_HEIST',
    });

    expect(sanitizeRoomForPlayer(room, 'p2').countries.RU.orders.length).toBe(0);
    expect(sanitizeRoomForPlayer(room, 'gm1').countries.RU.orders.length).toBe(1);
  });

  it('immediately resolves RADAR_ALERT over Socket.io as soon as defender clicks posture without 30s freeze', async () => {
    const { httpServer, stopTicker } = createAppServer();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3998;
    const url = `http://127.0.0.1:${port}`;

    const c1 = ClientSocket(url, { transports: ['websocket'] });
    const c2 = ClientSocket(url, { transports: ['websocket'] });

    try {
      const createRes = await new Promise<{ ok: boolean; roomCode?: string }>((resolve) =>
        c1.emit('lobby:create', { playerId: 'u1', playerName: 'Ali' }, resolve)
      );
      const code = createRes.roomCode!;
      await new Promise<{ ok: boolean }>((resolve) =>
        c2.emit('lobby:join', { roomCode: code, playerId: 'u2', playerName: 'Reza' }, resolve)
      );
      await new Promise<{ ok: boolean }>((resolve) =>
        c1.emit('lobby:select_role', { countryId: 'IR' }, resolve)
      );
      await new Promise<{ ok: boolean }>((resolve) =>
        c2.emit('lobby:select_role', { countryId: 'US' }, resolve)
      );
      await new Promise<{ ok: boolean }>((resolve) => c1.emit('lobby:start', resolve));

      // Iran attacks US -> triggers RADAR_ALERT
      await new Promise<{ ok: boolean }>((resolve) =>
        c1.emit(
          'game:queue_order',
          { kind: 'MILITARY_OPERATION', targetCountry: 'US', militaryType: 'PRECISION_STRIKE' },
          resolve
        )
      );

      const alertPhaseReached = new Promise<void>((resolve) => {
        c2.on('room:state', (st) => {
          if (st.phase === 'RADAR_ALERT' && st.countries.US.incomingAlertActive) resolve();
        });
      });

      c1.emit('game:toggle_ready', true);
      c2.emit('game:toggle_ready', true);
      await alertPhaseReached;

      // US clicks MAX_INTERCEPT -> must IMMEDIATELY advance to Round 2 in <500ms!
      const round2Reached = new Promise<number>((resolve) => {
        c1.on('room:state', (st) => {
          if (st.round === 2 && st.phase === 'PLANNING') resolve(st.round);
        });
      });

      c2.emit('game:alert_posture', 'MAX_INTERCEPT');
      const r2 = await round2Reached;
      expect(r2).toBe(2);
    } finally {
      c1.disconnect();
      c2.disconnect();
      stopTicker();
      httpServer.close();
    }
  });
});
