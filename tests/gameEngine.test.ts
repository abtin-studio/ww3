import { describe, expect, it } from 'vitest';
import { io as ClientSocket } from 'socket.io-client';
import { evaluateAITradeOffer } from '../server/aiNations';
import {
  applyAlertPosture,
  createNewRoomState,
  executeAcceptedTrade,
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
} from '../server/gameEngine';
import { createAppServer } from '../server/index';

describe('WW3 Global Command — Simulation Engine & Multiplayer', () => {
  it('enforces indigenous real-world weapon rules and allows indigenous builds', () => {
    const room = createNewRoomState('TEST1', 'Test Room', 'p1', 'Amir', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: true,
    });
    room.phase = 'PLANNING';
    room.countries.IR.playerId = 'p1';

    // Iran cannot directly manufacture American F-35A
    const f35Attempt = queuePlayerOrder(room, 'IR', {
      kind: 'PRODUCE_WEAPON',
      weaponId: 'f35a',
      quantity: 1,
    });
    expect(f35Attempt.ok).toBe(false);

    // Iran CAN directly manufacture indigenous Fattah-2 hypersonic missile
    const startTreasury = room.countries.IR.treasuryB;
    const fattahBuild = queuePlayerOrder(room, 'IR', {
      kind: 'PRODUCE_WEAPON',
      weaponId: 'fattah2',
      quantity: 1,
    });
    expect(fattahBuild.ok).toBe(true);
    expect(room.countries.IR.treasuryB).toBeLessThan(startTreasury);
  });

  it('handles AI diplomacy: oil exports to Germany and Congress F-22 restriction', () => {
    const room = createNewRoomState('TEST2', 'Diplomacy', 'p1', 'Salar', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: true,
    });
    room.phase = 'PLANNING';

    // Saudi Arabia sells 60 oil to AI Germany at fair price ($25B)
    const oilOffer = {
      id: 'off-1',
      round: 1,
      from: 'SA' as const,
      to: 'DE' as const,
      offerType: 'OIL' as const,
      amount: 60,
      priceB: 25,
      direction: 'SELL' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };
    const decision = evaluateAITradeOffer(room, oilOffer);
    expect(decision.accepted).toBe(true);

    const exec = executeAcceptedTrade(room, oilOffer);
    expect(exec.ok).toBe(true);

    // Non-ally tries to buy F-22 Raptor from US -> blocked by Congress rule
    const f22Offer = {
      id: 'off-2',
      round: 1,
      from: 'IN' as const,
      to: 'US' as const,
      offerType: 'WEAPON' as const,
      weaponId: 'f22',
      amount: 1,
      priceB: 50,
      direction: 'BUY' as const,
      noteFa: '',
      status: 'PENDING' as const,
    };
    expect(evaluateAITradeOffer(room, f22Offer).accepted).toBe(false);
  });

  it('triggers 30s RADAR_ALERT for human targets with intact radar, and resolves counter-salvo + Hormuz oil shock', () => {
    const room = createNewRoomState('TEST3', 'War Room', 'p1', 'Host', {
      gmMode: 'AUTO',
      maxRounds: 12,
      planningTimerSec: 0,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.countries.IR.playerId = 'p1';
    room.countries.IR.isOnline = true;
    room.countries.US.playerId = 'p2';
    room.countries.US.isOnline = true;

    // Iran blocks Strait of Hormuz + launches drone swarm & missile strike at US bases
    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'DOMESTIC_POLICY',
        policyType: 'TOGGLE_CHOKEPOINT',
        chokepointStatus: 'BLOCKADED',
      }).ok
    ).toBe(true);

    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MILITARY_STRIKE',
        targetCountry: 'US',
        strikeType: 'DRONE_SWARM',
        targetSector: 'RADAR_NETWORK',
      }).ok
    ).toBe(true);

    const nextStep = prepareEndOfPlanning(room);
    expect(nextStep).toBe('RADAR_ALERT');
    expect(room.countries.US.incomingAlertActive).toBe(true);

    // US selects immediate COUNTER_SALVO during 30s alert!
    const postureRes = applyAlertPosture(room, 'US', 'COUNTER_SALVO');
    expect(postureRes.ok).toBe(true);

    const initialOilPrice = room.market.oilPriceUsd;
    resolveCurrentRound(room);

    expect(room.round).toBe(2);
    expect(room.chokepoints.HORMUZ.status).toBe('BLOCKADED');
    expect(room.market.oilPriceUsd).toBeGreaterThan(initialOilPrice);
    expect(room.visualEvents.length).toBeGreaterThanOrEqual(2);
  });

  it('enforces Fog-of-War masking for rivals while giving God-View to Human GM', () => {
    const room = createNewRoomState('TEST4', 'Fog', 'gm1', 'Narrator', {
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
    room.countries.RU.orders.push({
      id: 'secret-ord',
      actor: 'RU',
      kind: 'ESPIONAGE_OP',
      targetCountry: 'US',
      espionageType: 'DEEP_RECON',
      summaryFa: 'Secret Spy',
      costB: 10,
    });

    const cnView = sanitizeRoomForPlayer(room, 'p2');
    expect(cnView.countries.US.orders.length).toBe(0);
    expect(Object.keys(cnView.countries.US.weapons).length).toBe(0);

    const gmView = sanitizeRoomForPlayer(room, 'gm1');
    expect(gmView.countries.RU.orders.length).toBe(1);
    expect(Object.keys(gmView.countries.US.weapons).length).toBeGreaterThan(0);
  });

  it('runs live multiplayer lobby creation, country selection, and round progression over Socket.io', async () => {
    const { httpServer, stopTicker } = createAppServer();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3999;
    const url = `http://127.0.0.1:${port}`;

    const c1 = ClientSocket(url, { transports: ['websocket'] });
    const c2 = ClientSocket(url, { transports: ['websocket'] });

    try {
      const createRes = await new Promise<{ ok: boolean; roomCode?: string }>((resolve) => {
        c1.emit('lobby:create', { playerId: 'u1', playerName: 'Ali', roomName: 'WW3 Match' }, resolve);
      });
      expect(createRes.ok).toBe(true);
      const code = createRes.roomCode!;

      const joinRes = await new Promise<{ ok: boolean }>((resolve) => {
        c2.emit('lobby:join', { roomCode: code, playerId: 'u2', playerName: 'Reza' }, resolve);
      });
      expect(joinRes.ok).toBe(true);

      await new Promise<{ ok: boolean }>((resolve) =>
        c1.emit('lobby:select_role', { countryId: 'IR' }, resolve)
      );
      await new Promise<{ ok: boolean }>((resolve) =>
        c2.emit('lobby:select_role', { countryId: 'RU' }, resolve)
      );

      const startRes = await new Promise<{ ok: boolean }>((resolve) =>
        c1.emit('lobby:start', resolve)
      );
      expect(startRes.ok).toBe(true);

      // Both players mark Ready -> round immediately resolves to Round 2!
      const round2Promise = new Promise<number>((resolve) => {
        c1.on('room:state', (st) => {
          if (st.round === 2) resolve(st.round);
        });
      });

      c1.emit('game:toggle_ready', true);
      c2.emit('game:toggle_ready', true);

      const reachedRound = await round2Promise;
      expect(reachedRound).toBe(2);
    } finally {
      c1.disconnect();
      c2.disconnect();
      stopTicker();
      httpServer.close();
    }
  });
});
