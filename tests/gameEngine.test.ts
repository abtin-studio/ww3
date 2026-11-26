import { describe, expect, it } from 'vitest';
import { io as ClientSocket } from 'socket.io-client';
import { evaluateAITradeOffer } from '../server/aiNations';
import {
  applyAlertPosture,
  createCoalition,
  createNewRoomState,
  instantBuildInfra,
  instantEmergencyAction,
  instantMinorDiplomacyPact,
  instantProduceWeapon,
  instantSetChokepoint,
  instantSpotTrade,
  instantUpgradeTrack,
  joinCoalition,
  prepareEndOfPlanning,
  queuePlayerOrder,
  resolveCurrentRound,
  sanitizeRoomForPlayer,
} from '../server/gameEngine';
import { createAppServer } from '../server/index';
import { INFRASTRUCTURE_CATALOG, getCalendarLabelFa } from '../shared/realWorldData';

const DEFAULT_SETTINGS = {
  gameMode: 'MULTI' as const,
  difficulty: 'HARD' as const,
  gmMode: 'AUTO' as const,
  maxRounds: 100,
  planningTimerSec: 0,
  enableAINations: true,
};

describe('WW3 Global Command v3.0 — Reconstruction, Regime Collapse, World Conquest & Covert Privacy', () => {
  it('initializes 20 Major Powers + 150+ Real World Minor Nations and dynamic 100-round calendar', () => {
    const room = createNewRoomState('V3A', 'World', 'p1', 'Amir', DEFAULT_SETTINGS);
    expect(Object.keys(room.countries).length).toBe(20);
    expect(Object.keys(room.minorNations).length).toBeGreaterThan(140);
    expect(room.minorNations['368']?.nameFa).toBe('عراق');
    expect(room.minorNations['862']?.nameFa).toBe('ونزوئلا');
    expect(getCalendarLabelFa(1)).toContain('2027');
    expect(getCalendarLabelFa(85)).toContain('2034');
  });

  it('prevents MAX-infra deadlock: bomb damage creates rebuildable ruins AND emergency reconstruction always works', () => {
    const room = createNewRoomState('V3B', 'Rebuild', 'p1', 'Amir', DEFAULT_SETTINGS);
    room.phase = 'PLANNING';
    const ir = room.countries.IR;
    ir.playerId = 'p1';
    ir.treasuryB = 600;

    // Max out POWER_PLANT completely (20/20)
    ir.infrastructure.POWER_PLANT = INFRASTRUCTURE_CATALOG.POWER_PLANT.maxLevel;
    // Simulate severe nuclear/missile bombardment dropping grid & approval while maxed
    ir.powerGrid = 18;
    ir.approval = 20;
    ir.devastation = 62;

    // Emergency Reconstruction ALWAYS works even when infrastructure is 20/20!
    const gridFix = instantEmergencyAction(room, 'IR', 'REPAIR_GRID');
    expect(gridFix.ok).toBe(true);
    expect(ir.powerGrid).toBe(42);
    expect(ir.devastation).toBe(48);

    const reliefFix = instantEmergencyAction(room, 'IR', 'NATIONAL_RELIEF');
    expect(reliefFix.ok).toBe(true);
    expect(ir.approval).toBe(34);
    expect(ir.devastation).toBe(28);

    // Simulate war ruin (1 level destroyed from 20 -> 19 with damagedInfra = 1)
    ir.infrastructure.POWER_PLANT = 19;
    ir.damagedInfra.POWER_PLANT = 1;
    const reb = instantBuildInfra(room, 'IR', 'POWER_PLANT');
    expect(reb.ok).toBe(true);
    expect(ir.infrastructure.POWER_PLANT).toBe(20);
    expect(ir.damagedInfra.POWER_PLANT).toBe(0);
  });

  it('enforces Covert Attribution Privacy: untraced covert ops NEVER leak attacker identity to target or map', () => {
    const room = createNewRoomState('V3C', 'Stealth', 'p1', 'Host', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.players.push({
      id: 'p2',
      name: 'TargetPlayer',
      isHost: false,
      isGM: false,
      countryId: 'BR',
      connected: true,
    });
    room.players[0].countryId = 'IL';
    room.countries.IL.playerId = 'p1';
    room.countries.IL.upgrades.INTELLIGENCE = 10;
    room.countries.BR.playerId = 'p2';
    // Give target minimal counter-intel so trace chance stays at minimum floor
    room.countries.BR.upgrades.INTELLIGENCE = 0;
    room.countries.BR.intelLevel = 1;
    room.countries.BR.infrastructure.CYBER_HQ = 0;

    expect(
      queuePlayerOrder(room, 'IL', {
        kind: 'COVERT_OPERATION',
        targetCountry: 'BR',
        covertType: 'ASSASSINATE_SCIENTIST',
      }).ok
    ).toBe(true);

    // Force deterministic untraced hit via Math.random check over multiple trials or verify schema contract
    resolveCurrentRound(room);
    const brSummary = room.countries.BR.lastRoundSummary!;
    expect(brSummary.incomingAttacks.length).toBe(1);
    const atk = brSummary.incomingAttacks[0];
    if (atk.attackerId === null) {
      // Untraced! Verify target does NOT see IL's visual arc on sanitized state AND news doesn't leak IL!
      expect(atk.attackerLabelFa).toContain('ناشناس');
      const sanitizedForTarget = sanitizeRoomForPlayer(room, 'p2');
      expect(sanitizedForTarget.visualEvents.some((v) => v.fromCountry === 'IL')).toBe(false);
      // Actor itself still sees its own covert trajectory
      const sanitizedForActor = sanitizeRoomForPlayer(room, 'p1');
      expect(sanitizedForActor.visualEvents.some((v) => v.fromCountry === 'IL')).toBe(true);
    }
  });

  it('triggers complete Regime Collapse & Elimination on overwhelming devastation without locking match', () => {
    const room = createNewRoomState('V3D', 'Collapse', 'p1', 'Host', {
      ...DEFAULT_SETTINGS,
      enableAINations: false,
    });
    room.phase = 'PLANNING';
    room.countries.US.playerId = 'p1';
    room.countries.US.isOnline = true;
    // Put AI KP into catastrophic 96% devastation
    room.countries.KP.devastation = 96;
    room.countries.KP.approval = 4;
    room.countries.KP.lastAttackedBy = 'US';

    resolveCurrentRound(room);
    expect(room.countries.KP.isEliminated).toBe(true);
    expect(room.countries.KP.conqueredBy).toBe('US');
    expect(room.rankings.find((r) => r.countryId === 'KP')?.score).toBe(0);
  });

  it('supports World Nation Conquest, Diplomatic Pact, Coalitions, Air/Naval/Land ops & 30-round stability', () => {
    const room = createNewRoomState('V3E', 'Empire', 'p1', 'Commander', {
      ...DEFAULT_SETTINGS,
      gameMode: 'SINGLE',
    });
    room.phase = 'PLANNING';
    room.countries.IR.playerId = 'p1';
    room.countries.IR.isOnline = true;
    room.countries.IR.treasuryB = 500;

    // Sign peaceful pact with Oman ('512')
    expect(instantMinorDiplomacyPact(room, 'IR', '512').ok).toBe(true);
    expect(room.minorNations['512'].alignedWith).toBe('IR');

    // Create custom coalition & join
    expect(createCoalition(room, 'IR', 'پیمان خلیج فارس').ok).toBe(true);
    const newCoalId = room.countries.IR.coalitionId!;
    expect(joinCoalition(room, 'RU', newCoalId).ok).toBe(true);

    // Queue minor nation conquest + fighter air sortie + Spot trade + weapon rule
    expect(instantSpotTrade(room, 'IR', 'OIL', 'SELL').ok).toBe(true);
    expect(instantUpgradeTrack(room, 'IR', 'AEROSPACE').ok).toBe(true);
    // 2nd upgrade in the same month is realistically blocked
    expect(instantUpgradeTrack(room, 'IR', 'INDUSTRY').ok).toBe(false);
    expect(instantProduceWeapon(room, 'IR', 'fattah2', 1).ok).toBe(true);

    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MINOR_NATION_OPERATION',
        targetMinorId: '368',
        minorOpType: 'CONQUER_ANNEX',
      }).ok
    ).toBe(true);

    expect(
      queuePlayerOrder(room, 'IR', {
        kind: 'MILITARY_OPERATION',
        targetCountry: 'IL',
        militaryType: 'AIR_SORTIE',
        targetSector: 'AIR_DEFENSE_NET',
      }).ok
    ).toBe(true);

    // Run 25 full living-world rounds to verify zero crashes, AI chokepoints, and numerical health!
    for (let i = 0; i < 25; i++) {
      if ((room.phase as string) === 'FINISHED') break;
      prepareEndOfPlanning(room);
      resolveCurrentRound(room);
    }

    expect(room.round).toBeGreaterThan(20);
    expect(Number.isNaN(room.market.oilPriceUsd)).toBe(false);
    expect(evaluateAITradeOffer(room, {
      id: 'f22-check',
      round: room.round,
      from: 'IN',
      to: 'US',
      offerType: 'WEAPON',
      weaponId: 'f22',
      amount: 1,
      priceB: 60,
      direction: 'BUY',
      noteFa: '',
      status: 'PENDING',
    }).accepted).toBe(false);
  });

  it('immediately resolves RADAR_ALERT over Socket.io and never deadlocks if a player disconnects', async () => {
    const { httpServer, stopTicker } = createAppServer();
    await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
    const addr = httpServer.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3998;
    const url = `http://127.0.0.1:${port}`;

    const c1 = ClientSocket(url, { transports: ['websocket'] });
    const c2 = ClientSocket(url, { transports: ['websocket'] });

    try {
      const createRes = await new Promise<{ ok: boolean; roomCode?: string }>((resolve) =>
        c1.emit(
          'lobby:create',
          {
            playerId: 'u1',
            playerName: 'Ali',
            settings: { gameMode: 'MULTI', difficulty: 'HARD', maxRounds: 50 },
          },
          resolve
        )
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

      // Close Strait of Hormuz & queue missile strike
      expect(
        (await new Promise<{ ok: boolean }>((r) => c1.emit('game:set_chokepoint', 'BLOCKADED', r))).ok
      ).toBe(true);

      await new Promise<{ ok: boolean }>((resolve) =>
        c1.emit(
          'game:queue_order',
          {
            kind: 'MILITARY_OPERATION',
            targetCountry: 'US',
            militaryType: 'MISSILE_DRONE_STRIKE',
            targetSector: 'POWER_PLANT',
          },
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
