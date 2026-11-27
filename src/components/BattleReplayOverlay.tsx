import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
import {
  SkipForward,
  Pause,
  Play,
  FastForward,
  Radio,
  ShieldCheck,
  Flame,
  Camera,
  Globe2,
} from 'lucide-react';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import { CinematicReplayEvent } from '../../shared/types';
import { sound } from '../utils/sound';
import { CountryFlag } from './CountryFlag';

interface BattleReplayOverlayProps {
  roundNumber: number;
  monthLabelFa: string;
  events: CinematicReplayEvent[];
  onFinish: () => void;
}

const W = 960;
const H = 460;

function quadBezierPoint(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  t: number
): [number, number] {
  const u = 1 - t;
  return [
    u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
    u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
  ];
}

export const BattleReplayOverlay: React.FC<BattleReplayOverlayProps> = ({
  roundNumber,
  monthLabelFa,
  events,
  onFinish,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1 per event
  const [paused, setPaused] = useState(false);
  const [speedMult, setSpeedMult] = useState<1 | 2>(1);
  const [autoCamera, setAutoCamera] = useState(true);
  const soundPlayedRef = useRef<{ launch: number; impact: number }>({ launch: -1, impact: -1 });

  const { projection, landPaths, spherePath } = useMemo(() => {
    const topo = worldAtlas as unknown as { objects: { countries: unknown } };
    const rawFc = topojson.feature(
      worldAtlas as unknown as Parameters<typeof topojson.feature>[0],
      topo.objects.countries as Parameters<typeof topojson.feature>[1]
    ) as unknown as {
      type: 'FeatureCollection';
      features: Array<{ id?: string | number; type: 'Feature'; geometry: GeoPermissibleObjects }>;
    };
    const filtered = rawFc.features.filter((f) => String(f.id) !== '010' && String(f.id) !== '260');
    const cleanFc = { type: 'FeatureCollection' as const, features: filtered };
    const proj = geoNaturalEarth1().fitExtent(
      [
        [18, 16],
        [W - 18, H - 16],
      ],
      cleanFc as unknown as GeoPermissibleObjects
    );
    const pathGen = geoPath(proj);
    return {
      projection: proj,
      spherePath: pathGen({ type: 'Sphere' }) || '',
      landPaths: filtered.map((f, i) => ({
        key: `${f.id || i}`,
        d: pathGen(f as unknown as GeoPermissibleObjects) || '',
      })),
    };
  }, []);

  const currentEvent = events[currentIndex];

  useEffect(() => {
    if (!currentEvent) {
      onFinish();
      return;
    }
    if (soundPlayedRef.current.launch !== currentIndex) {
      soundPlayedRef.current.launch = currentIndex;
      if (currentEvent.kind === 'SPACE_LAUNCH' || currentEvent.kind === 'ASAT') {
        sound.playSatelliteTelemetry();
      } else if (currentEvent.kind === 'UN_DECISION') {
        sound.playUNGavel();
      } else if (currentEvent.kind === 'CYBER' || currentEvent.kind === 'DIPLOMACY_SHOCK') {
        sound.playCyberPulse();
      } else if (currentEvent.kind === 'AIR' || currentEvent.kind === 'SECRET_AMBUSH') {
        sound.playJetSortie();
      } else if (currentEvent.kind === 'CHOKEPOINT' || currentEvent.kind === 'WORLD_HEADLINE') {
        sound.playNewsChime();
      } else {
        sound.playMissileLaunch();
      }
    }
  }, [currentIndex, currentEvent, onFinish]);

  useEffect(() => {
    if (paused || !currentEvent) return;
    let rafId = 0;
    let lastTime = performance.now();
    const isNewsSpotlight =
      currentEvent.kind === 'UN_DECISION' ||
      currentEvent.kind === 'WORLD_HEADLINE' ||
      currentEvent.kind === 'CHOKEPOINT' ||
      currentEvent.kind === 'SPACE_LAUNCH' ||
      currentEvent.kind === 'DIPLOMACY_SHOCK';
    const durationMs = (isNewsSpotlight ? 2450 : 2650) / speedMult;

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      setProgress((prev) => {
        const next = prev + dt / durationMs;
        if (next >= 0.62 && soundPlayedRef.current.impact !== currentIndex) {
          soundPlayedRef.current.impact = currentIndex;
          if (
            currentEvent.kind === 'SPACE_LAUNCH' ||
            currentEvent.kind === 'WORLD_HEADLINE'
          ) {
            sound.playRadarPing();
          } else if (currentEvent.kind === 'UN_DECISION') {
            sound.playDiplomacy();
          } else if (currentEvent.intercepted) {
            sound.playInterceptShield();
          } else {
            sound.playCinematicBoom(currentEvent.kind === 'NUCLEAR' || currentEvent.kind === 'ASAT');
          }
        }
        if (next >= 1) {
          if (currentIndex + 1 < events.length) {
            setCurrentIndex((idx) => idx + 1);
            return 0;
          } else {
            setTimeout(() => onFinish(), 220);
            return 1;
          }
        }
        return next;
      });
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused, speedMult, currentIndex, currentEvent, events.length, onFinish]);

  if (!currentEvent) return null;

  const project = (coords: [number, number]): [number, number] => {
    const pt = projection(coords);
    return pt ? [pt[0], pt[1]] : [W / 2, H / 2];
  };

  const pStart = project(currentEvent.from);
  const rawEnd = project(currentEvent.to);
  const pEnd: [number, number] =
    currentEvent.kind === 'ASAT' || currentEvent.kind === 'SPACE_LAUNCH'
      ? [rawEnd[0], Math.max(30, rawEnd[1] - 42)]
      : rawEnd;

  const dx = pEnd[0] - pStart[0];
  const dy = pEnd[1] - pStart[1];
  const dist = Math.max(1, Math.hypot(dx, dy));
  const arcLift =
    currentEvent.kind === 'NUCLEAR' || currentEvent.kind === 'ASAT' || currentEvent.kind === 'SPACE_LAUNCH'
      ? Math.min(135, dist * 0.38 + 28)
      : Math.min(85, dist * 0.24);
  const pCtrl: [number, number] = [(pStart[0] + pEnd[0]) / 2, Math.max(16, (pStart[1] + pEnd[1]) / 2 - arcLift)];

  // Smooth Auto-Camera Focus & Pan onto the active region!
  const midX = (pStart[0] + pEnd[0]) / 2;
  const midY = (pStart[1] + pEnd[1]) / 2;
  const targetCamScale =
    !autoCamera || currentEvent.kind === 'WORLD_HEADLINE'
      ? 1
      : dist < 110
      ? 2.05
      : dist < 240
      ? 1.68
      : dist < 420
      ? 1.36
      : 1.15;

  const clampCamX = Math.max(W * (1 - targetCamScale), Math.min(0, W / 2 - midX * targetCamScale));
  const clampCamY = Math.max(H * (1 - targetCamScale), Math.min(0, H / 2 - midY * targetCamScale));
  const cameraTransform = `translate(${clampCamX.toFixed(1)}px, ${clampCamY.toFixed(1)}px) scale(${targetCamScale.toFixed(2)})`;

  const isInterceptScene =
    currentEvent.intercepted &&
    currentEvent.kind !== 'CHOKEPOINT' &&
    currentEvent.kind !== 'UN_DECISION' &&
    currentEvent.kind !== 'WORLD_HEADLINE';

  const stopT = isInterceptScene ? 0.72 : 1.0;
  const flightPhase = Math.min(1, progress / 0.62);
  const activeT = flightPhase * stopT;
  const warheadPos = quadBezierPoint(pStart, pCtrl, pEnd, activeT);
  const impactPos = quadBezierPoint(pStart, pCtrl, pEnd, stopT);

  // Secondary salvo trails for MISSILE / AIR / NUCLEAR
  const hasSalvo =
    currentEvent.kind === 'MISSILE' || currentEvent.kind === 'AIR' || currentEvent.kind === 'SECRET_AMBUSH';
  const salvoOffsets = hasSalvo ? [-0.08, 0, 0.07] : [0];

  const showInterceptor = isInterceptScene && progress >= 0.22 && progress <= 0.66;
  const interceptorT = Math.min(1, Math.max(0, (progress - 0.22) / 0.4));
  const interceptorPos: [number, number] = [
    pEnd[0] + (impactPos[0] - pEnd[0]) * interceptorT,
    pEnd[1] + (impactPos[1] - pEnd[1]) * interceptorT,
  ];

  const isExploding = progress >= 0.62;
  const blastProgress = isExploding ? Math.min(1, (progress - 0.62) / 0.38) : 0;

  const theme = useMemo(() => {
    switch (currentEvent.kind) {
      case 'NUCLEAR':
        return { color: '#f43f5e', badgeBg: 'bg-rose-600', channel: '☢️ هشدار قرمز اتمی (DEFCON 1)' };
      case 'ASAT':
        return { color: '#38bdf8', badgeBg: 'bg-sky-600', channel: '☄️ فرماندهی جنگ فضایی و ضدماهواره' };
      case 'SPACE_LAUNCH':
        return { color: '#22d3ee', badgeBg: 'bg-cyan-600', channel: '🛰️ ایستگاه رصد مداری جهان' };
      case 'UN_DECISION':
        return { color: '#fbbf24', badgeBg: 'bg-amber-600', channel: '⚖️ صحن شورای امنیت سازمان ملل' };
      case 'CHOKEPOINT':
        return { color: '#f59e0b', badgeBg: 'bg-orange-600', channel: '⚓ رصد آبراه‌های استراتژیک و نفت' };
      case 'DIPLOMACY_SHOCK':
      case 'CYBER':
      case 'PROXY':
        return { color: '#c084fc', badgeBg: 'bg-purple-600', channel: '🕵️ پرونده ویژه سایبری و اطلاعاتی' };
      case 'SECRET_AMBUSH':
        return { color: '#10b981', badgeBg: 'bg-emerald-600', channel: '💥 افشای پیمان محرمانه دفاعی!' };
      case 'WORLD_HEADLINE':
        return { color: '#38bdf8', badgeBg: 'bg-blue-600', channel: '🌍 بولتن اقتصادی و سیاسی جهان' };
      case 'AIR':
        return { color: '#60a5fa', badgeBg: 'bg-blue-600', channel: '✈️ رادار نبرد هوایی اسکادران‌ها' };
      case 'NAVAL':
        return { color: '#06b6d4', badgeBg: 'bg-cyan-600', channel: '⚓ عملیات ناوگان اقیانوسی' };
      default:
        return { color: '#fb923c', badgeBg: 'bg-rose-600', channel: '🚀 رادار حملات موشکی و زرهی' };
    }
  }, [currentEvent.kind]);

  const mainColor = theme.color;
  const fullArcD = `M ${pStart[0].toFixed(1)} ${pStart[1].toFixed(1)} Q ${pCtrl[0].toFixed(1)} ${pCtrl[1].toFixed(1)} ${pEnd[0].toFixed(1)} ${pEnd[1].toFixed(1)}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#02050c]/96 backdrop-blur-xl flex flex-col justify-between p-2.5 sm:p-4 select-none animate-panel-in">
      {/* Top Global Broadcast Header */}
      <div className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-2 bg-[#061022]/95 border border-slate-700/80 rounded-2xl px-3.5 py-2.5 shadow-2xl">
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`px-2.5 py-1 rounded-lg ${theme.badgeBg} text-white text-[11px] font-black flex items-center gap-1.5 shadow`}>
            <Radio className="w-3.5 h-3.5 animate-pulse" /> {currentEvent.categoryLabelFa || theme.channel}
          </span>
          <span className="text-xs sm:text-sm font-black text-white">
            مرور سینمایی تحولات جهان — ماه {roundNumber} ({monthLabelFa})
          </span>
          <span className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md">
            رویداد {currentIndex + 1} / {events.length}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            title="دوربین هوشمند روی منطقه رویداد / نمای کل جهان"
            onClick={() => setAutoCamera((v) => !v)}
            className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1 ${
              autoCamera
                ? 'bg-cyan-500/20 text-cyan-200 border-cyan-500/40'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            {autoCamera ? <Camera className="w-3.5 h-3.5" /> : <Globe2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{autoCamera ? 'زوم خودکار' : 'نمای کل'}</span>
          </button>
          <button
            type="button"
            onClick={() => setSpeedMult((s) => (s === 1 ? 2 : 1))}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-mono font-bold flex items-center gap-1 ${
              speedMult === 2
                ? 'bg-amber-400 text-slate-950 border-amber-300'
                : 'bg-slate-800 text-slate-300 border-slate-700'
            }`}
          >
            <FastForward className="w-3.5 h-3.5" /> {speedMult}x
          </button>
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200"
          >
            {paused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4 text-amber-300" />}
          </button>
          <button
            type="button"
            onClick={onFinish}
            className="px-3.5 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs flex items-center gap-1.5 shadow-lg"
          >
            ورود به اتاق فرماندهی
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Widescreen Satellite Theater with Smooth Auto-Zoom Camera */}
      <div className="max-w-6xl w-full mx-auto flex-1 my-2.5 relative rounded-3xl border border-slate-800/90 bg-[#030814] overflow-hidden flex items-center justify-center shadow-2xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full max-h-[64vh]">
          <defs>
            <radialGradient id="theaterOceanV6" cx="50%" cy="48%" r="68%">
              <stop offset="0%" stopColor="#081b36" />
              <stop offset="70%" stopColor="#040b18" />
              <stop offset="100%" stopColor="#02050c" />
            </radialGradient>
            <filter id="neonGlowV6" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g className="cinema-camera-smooth" style={{ transform: cameraTransform }}>
            {spherePath && <path d={spherePath} fill="url(#theaterOceanV6)" stroke="#142b4d" strokeWidth={0.9} />}

            {landPaths.map((lp) => (
              <path
                key={lp.key}
                d={lp.d}
                fill="#0d1b32"
                stroke="#1c355e"
                strokeWidth={0.48}
              />
            ))}

            {/* Orbital Ring Overlay for SPACE_LAUNCH & ASAT */}
            {(currentEvent.kind === 'SPACE_LAUNCH' || currentEvent.kind === 'ASAT') && (
              <ellipse
                cx={pEnd[0]}
                cy={pEnd[1] + 24}
                rx={75}
                ry={22}
                fill="none"
                stroke="#38bdf8"
                strokeWidth={0.9}
                strokeDasharray="4 4"
                strokeOpacity={0.55}
              />
            )}

            {/* Origin Pulse */}
            <g transform={`translate(${pStart[0]}, ${pStart[1]})`}>
              <circle cx={0} cy={0} r={9 / Math.sqrt(targetCamScale)} fill={mainColor} fillOpacity={0.25} />
              <circle cx={0} cy={0} r={3.5 / Math.sqrt(targetCamScale)} fill={mainColor} stroke="#ffffff" strokeWidth={0.8} />
            </g>

            {/* Target Marker & Special Icons */}
            <g transform={`translate(${pEnd[0]}, ${pEnd[1]})`}>
              <circle cx={0} cy={0} r={4.5 / Math.sqrt(targetCamScale)} fill="#0f172a" stroke="#94a3b8" strokeWidth={1} />
              {(currentEvent.kind === 'ASAT' || currentEvent.kind === 'SPACE_LAUNCH') && (
                <text x={0} y={-8} textAnchor="middle" fontSize={12 / Math.sqrt(targetCamScale)}>
                  🛰️
                </text>
              )}
              {currentEvent.kind === 'UN_DECISION' && (
                <text x={0} y={-8} textAnchor="middle" fontSize={12 / Math.sqrt(targetCamScale)}>
                  🏛️
                </text>
              )}
              {currentEvent.kind === 'CHOKEPOINT' && (
                <text x={0} y={-8} textAnchor="middle" fontSize={12 / Math.sqrt(targetCamScale)}>
                  ⚓
                </text>
              )}
            </g>

            {/* Ghost Trajectory Guide */}
            {currentEvent.kind !== 'WORLD_HEADLINE' && (
              <path
                d={fullArcD}
                fill="none"
                stroke={mainColor}
                strokeWidth={1 / Math.sqrt(targetCamScale)}
                strokeOpacity={0.22}
                strokeDasharray="4 4"
              />
            )}

            {/* Active Glowing Contrail */}
            {currentEvent.kind !== 'WORLD_HEADLINE' && (
              <path
                d={`M ${pStart[0].toFixed(1)} ${pStart[1].toFixed(1)} Q ${(
                  pStart[0] +
                  (pCtrl[0] - pStart[0]) * activeT
                ).toFixed(1)} ${(pStart[1] + (pCtrl[1] - pStart[1]) * activeT).toFixed(1)} ${warheadPos[0].toFixed(
                  1
                )} ${warheadPos[1].toFixed(1)}`}
                fill="none"
                stroke={mainColor}
                strokeWidth={(currentEvent.kind === 'NUCLEAR' ? 3.2 : 2.2) / Math.sqrt(targetCamScale)}
                strokeLinecap="round"
                filter="url(#neonGlowV6)"
              />
            )}

            {/* Multi-Salvo Flying Projectiles / Jets */}
            {!isExploding &&
              currentEvent.kind !== 'WORLD_HEADLINE' &&
              salvoOffsets.map((off, sIdx) => {
                const st = Math.max(0, Math.min(stopT, activeT + off));
                if (st <= 0.01) return null;
                const pos = quadBezierPoint(pStart, pCtrl, pEnd, st);
                return (
                  <g
                    key={`salvo-${sIdx}`}
                    transform={`translate(${pos[0] + sIdx * 2.2}, ${pos[1] - sIdx * 1.8})`}
                    filter="url(#neonGlowV6)"
                  >
                    <circle
                      cx={0}
                      cy={0}
                      r={(sIdx === 1 || salvoOffsets.length === 1 ? 4.2 : 2.8) / Math.sqrt(targetCamScale)}
                      fill="#ffffff"
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={(sIdx === 1 || salvoOffsets.length === 1 ? 8 : 5) / Math.sqrt(targetCamScale)}
                      fill={mainColor}
                      fillOpacity={0.45}
                    />
                  </g>
                );
              })}

            {/* Defender Anti-Ballistic Interceptor */}
            {showInterceptor && (
              <g>
                <line
                  x1={pEnd[0]}
                  y1={pEnd[1]}
                  x2={interceptorPos[0]}
                  y2={interceptorPos[1]}
                  stroke="#34d399"
                  strokeWidth={1.8 / Math.sqrt(targetCamScale)}
                  strokeDasharray="3 2"
                  filter="url(#neonGlowV6)"
                />
                <circle
                  cx={interceptorPos[0]}
                  cy={interceptorPos[1]}
                  r={3.5 / Math.sqrt(targetCamScale)}
                  fill="#6ee7b7"
                />
              </g>
            )}

            {/* Impact Explosion / Shield Intercept / World Event Spotlight */}
            {(isExploding || currentEvent.kind === 'WORLD_HEADLINE') && (
              <g transform={`translate(${impactPos[0]}, ${impactPos[1]}) scale(${1 / Math.sqrt(targetCamScale)})`}>
                {isInterceptScene ? (
                  <>
                    <circle
                      cx={0}
                      cy={0}
                      r={8 + blastProgress * 36}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth={2.8 * (1 - blastProgress * 0.7)}
                      strokeOpacity={1 - blastProgress}
                      filter="url(#neonGlowV6)"
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={14 * (1 - blastProgress * 0.5)}
                      fill="#10b981"
                      fillOpacity={0.4 * (1 - blastProgress)}
                    />
                  </>
                ) : (
                  <>
                    <circle
                      cx={0}
                      cy={0}
                      r={10 + blastProgress * (currentEvent.kind === 'NUCLEAR' ? 72 : 42)}
                      fill="none"
                      stroke={mainColor}
                      strokeWidth={3.2 * (1 - blastProgress * 0.6)}
                      strokeOpacity={Math.max(0.15, 1 - blastProgress)}
                      filter="url(#neonGlowV6)"
                    />
                    <circle
                      cx={0}
                      cy={0}
                      r={6 + blastProgress * (currentEvent.kind === 'NUCLEAR' ? 44 : 24)}
                      fill={mainColor}
                      fillOpacity={0.5 * Math.max(0.1, 1 - blastProgress)}
                    />
                  </>
                )}

                {/* Floating Tactical Outcome Pill */}
                <g transform={`translate(0, ${-20 - blastProgress * 8})`}>
                  <rect
                    x={-96}
                    y={-12}
                    width={192}
                    height={23}
                    rx={8}
                    fill={isInterceptScene ? '#064e3b' : '#0f172a'}
                    fillOpacity={0.95}
                    stroke={isInterceptScene ? '#34d399' : mainColor}
                    strokeWidth={1.1}
                  />
                  <text
                    x={0}
                    y={3.2}
                    textAnchor="middle"
                    fontSize={9.2}
                    fontWeight="bold"
                    fill="#ffffff"
                  >
                    {currentEvent.impactBadgeFa}
                  </text>
                </g>
              </g>
            )}
          </g>
        </svg>

        {/* Interactive Scene Timeline Scrubber */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-[#050c1a]/85 px-3 py-1.5 rounded-full border border-slate-800 backdrop-blur-md">
          {events.map((ev, idx) => (
            <button
              key={ev.id}
              type="button"
              title={ev.headlineFa}
              onClick={() => {
                sound.playClick();
                setCurrentIndex(idx);
                setProgress(0);
              }}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex
                  ? 'w-7 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : idx < currentIndex
                  ? 'w-2 bg-cyan-500/60'
                  : 'w-2 bg-slate-700'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom Live TV Breaking News Chyron + World Headlines Strip */}
      <div className="max-w-6xl w-full mx-auto bg-[#061022]/96 border border-slate-700/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              {currentEvent.attackerId ? (
                <CountryFlag countryId={currentEvent.attackerId} size="md" />
              ) : (
                <span className="px-2 py-1 rounded-lg bg-cyan-500/15 border border-cyan-500/30 text-cyan-200 text-xs font-bold">
                  🌐
                </span>
              )}
              {currentEvent.defenderId && (
                <>
                  <span className="text-slate-400 font-bold">←</span>
                  <CountryFlag countryId={currentEvent.defenderId} size="md" />
                </>
              )}
            </div>
            <div className="text-xs sm:text-sm font-black text-white leading-relaxed">
              {currentEvent.headlineFa}
            </div>
          </div>

          <div className="shrink-0">
            {isInterceptScene ? (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-black flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" /> رهگیری و دفع موفق!
              </span>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-cyan-500/15 border border-cyan-400/40 text-cyan-200 text-xs font-black flex items-center gap-1.5">
                <Flame className="w-4 h-4 text-amber-400" /> {currentEvent.impactBadgeFa}
              </span>
            )}
          </div>
        </div>

        {/* World News Summary Strip */}
        {events.length > 1 && (
          <div className="bg-[#030814] border-t border-slate-800/80 px-3.5 py-1.5 flex items-center gap-3 overflow-x-auto text-[11px] text-slate-400 whitespace-nowrap">
            <span className="text-amber-400 font-black shrink-0">📰 عناوین مهم ماه:</span>
            {events.map((ev, i) => (
              <button
                key={`tk-${ev.id}`}
                type="button"
                onClick={() => {
                  setCurrentIndex(i);
                  setProgress(0);
                }}
                className={`hover:text-white transition ${
                  i === currentIndex ? 'text-emerald-300 font-bold' : 'text-slate-400'
                }`}
              >
                • {ev.headlineFa}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
