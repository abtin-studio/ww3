import React, { useEffect, useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
import { SkipForward, Pause, Play, FastForward, Radio, ShieldCheck, Flame } from 'lucide-react';
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
    const filtered = rawFc.features.filter((f) => String(f.id) !== '010');
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
      sound.playMissileLaunch();
    }
  }, [currentIndex, currentEvent, onFinish]);

  useEffect(() => {
    if (paused || !currentEvent) return;
    let rafId = 0;
    let lastTime = performance.now();
    const durationMs = 2300 / speedMult;

    const tick = (now: number) => {
      const dt = now - lastTime;
      lastTime = now;
      setProgress((prev) => {
        const next = prev + dt / durationMs;
        if (next >= 0.62 && soundPlayedRef.current.impact !== currentIndex) {
          soundPlayedRef.current.impact = currentIndex;
          if (currentEvent.intercepted) {
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
            setTimeout(() => onFinish(), 180);
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
  const pEnd =
    currentEvent.kind === 'ASAT'
      ? ([project(currentEvent.to)[0], Math.max(28, project(currentEvent.to)[1] - 42)] as [number, number])
      : project(currentEvent.to);

  const dx = pEnd[0] - pStart[0];
  const dy = pEnd[1] - pStart[1];
  const dist = Math.max(1, Math.hypot(dx, dy));
  const arcLift = currentEvent.kind === 'NUCLEAR' || currentEvent.kind === 'ASAT' ? Math.min(130, dist * 0.36) : Math.min(85, dist * 0.24);
  const pCtrl: [number, number] = [(pStart[0] + pEnd[0]) / 2, Math.max(16, (pStart[1] + pEnd[1]) / 2 - arcLift)];

  // Flight stops at 0.72 along the curve if intercepted mid-air!
  const stopT = currentEvent.intercepted ? 0.72 : 1.0;
  const flightPhase = Math.min(1, progress / 0.62);
  const activeT = flightPhase * stopT;
  const warheadPos = quadBezierPoint(pStart, pCtrl, pEnd, activeT);
  const impactPos = quadBezierPoint(pStart, pCtrl, pEnd, stopT);

  // Defender interceptor missile flies from pEnd -> impactPos during 0.25..0.62!
  const showInterceptor = currentEvent.intercepted && progress >= 0.22 && progress <= 0.66;
  const interceptorT = Math.min(1, Math.max(0, (progress - 0.22) / 0.4));
  const interceptorPos: [number, number] = [
    pEnd[0] + (impactPos[0] - pEnd[0]) * interceptorT,
    pEnd[1] + (impactPos[1] - pEnd[1]) * interceptorT,
  ];

  const isExploding = progress >= 0.62;
  const blastProgress = isExploding ? Math.min(1, (progress - 0.62) / 0.38) : 0;

  const mainColor =
    currentEvent.kind === 'NUCLEAR'
      ? '#f43f5e'
      : currentEvent.kind === 'ASAT'
      ? '#38bdf8'
      : currentEvent.kind === 'SECRET_AMBUSH'
      ? '#10b981'
      : currentEvent.kind === 'AIR'
      ? '#60a5fa'
      : currentEvent.kind === 'NAVAL'
      ? '#06b6d4'
      : currentEvent.kind === 'PROXY'
      ? '#c084fc'
      : '#fb923c';

  const fullArcD = `M ${pStart[0].toFixed(1)} ${pStart[1].toFixed(1)} Q ${pCtrl[0].toFixed(1)} ${pCtrl[1].toFixed(1)} ${pEnd[0].toFixed(1)} ${pEnd[1].toFixed(1)}`;

  return (
    <div className="fixed inset-0 z-50 bg-[#02050c]/95 backdrop-blur-xl flex flex-col justify-between p-3 sm:p-5 select-none animate-panel-in">
      {/* Top Broadcast Header */}
      <div className="max-w-6xl w-full mx-auto flex flex-wrap items-center justify-between gap-2 bg-[#071124]/90 border border-slate-700/80 rounded-2xl px-4 py-2.5 shadow-2xl">
        <div className="flex items-center gap-2.5">
          <span className="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-xs font-black flex items-center gap-1.5 animate-pulse">
            <Radio className="w-3.5 h-3.5" /> پخش زنده ماهواره‌ای نبردها
          </span>
          <span className="text-xs sm:text-sm font-black text-white">
            پرونده عملیات‌های ماه {roundNumber} ({monthLabelFa})
          </span>
          <span className="text-xs font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 rounded-md">
            صحنه {currentIndex + 1} از {events.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
            رد کردن و گزارش کامل
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Widescreen Satellite Theater */}
      <div className="max-w-6xl w-full mx-auto flex-1 my-3 relative rounded-3xl border border-slate-800 bg-[#030917] overflow-hidden flex items-center justify-center shadow-2xl">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full max-h-[66vh]">
          <defs>
            <radialGradient id="theaterOcean" cx="50%" cy="50%" r="65%">
              <stop offset="0%" stopColor="#091d3a" />
              <stop offset="100%" stopColor="#02060f" />
            </radialGradient>
            <filter id="neonGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {spherePath && <path d={spherePath} fill="url(#theaterOcean)" stroke="#163057" strokeWidth={1} />}

          {landPaths.map((lp) => (
            <path
              key={lp.key}
              d={lp.d}
              fill="#0d1c34"
              stroke="#1e3a66"
              strokeWidth={0.55}
            />
          ))}

          {/* Origin Launch Pulse */}
          <g transform={`translate(${pStart[0]}, ${pStart[1]})`}>
            <circle cx={0} cy={0} r={10} fill={mainColor} fillOpacity={0.22} />
            <circle cx={0} cy={0} r={4} fill={mainColor} stroke="#ffffff" strokeWidth={1} />
          </g>

          {/* Target City Marker */}
          <g transform={`translate(${pEnd[0]}, ${pEnd[1]})`}>
            <circle cx={0} cy={0} r={5} fill="#0f172a" stroke="#94a3b8" strokeWidth={1.2} />
            {currentEvent.kind === 'ASAT' && (
              <text x={0} y={-10} textAnchor="middle" fontSize={11}>
                🛰️
              </text>
            )}
          </g>

          {/* Ghost Ballistic Trajectory Guide */}
          <path
            d={fullArcD}
            fill="none"
            stroke={mainColor}
            strokeWidth={1.2}
            strokeOpacity={0.22}
            strokeDasharray="5 5"
          />

          {/* Active Glowing Trail up to Current Warhead Position */}
          <path
            d={`M ${pStart[0].toFixed(1)} ${pStart[1].toFixed(1)} Q ${(
              pStart[0] +
              (pCtrl[0] - pStart[0]) * activeT
            ).toFixed(1)} ${(pStart[1] + (pCtrl[1] - pStart[1]) * activeT).toFixed(1)} ${warheadPos[0].toFixed(
              1
            )} ${warheadPos[1].toFixed(1)}`}
            fill="none"
            stroke={mainColor}
            strokeWidth={currentEvent.kind === 'NUCLEAR' ? 3.5 : 2.5}
            strokeLinecap="round"
            filter="url(#neonGlow)"
          />

          {/* Live Flying Warhead / Jet */}
          {!isExploding && (
            <g transform={`translate(${warheadPos[0]}, ${warheadPos[1]})`} filter="url(#neonGlow)">
              <circle cx={0} cy={0} r={currentEvent.kind === 'NUCLEAR' ? 6 : 4.5} fill="#ffffff" />
              <circle cx={0} cy={0} r={9} fill={mainColor} fillOpacity={0.45} />
            </g>
          )}

          {/* Defender Anti-Ballistic Interceptor Missile Rising to Meet Threat! */}
          {showInterceptor && (
            <g>
              <line
                x1={pEnd[0]}
                y1={pEnd[1]}
                x2={interceptorPos[0]}
                y2={interceptorPos[1]}
                stroke="#34d399"
                strokeWidth={2}
                strokeDasharray="3 2"
                filter="url(#neonGlow)"
              />
              <circle cx={interceptorPos[0]} cy={interceptorPos[1]} r={3.8} fill="#6ee7b7" />
            </g>
          )}

          {/* Impact Explosion OR Mid-Air Shield Intercept Shockwave */}
          {isExploding && (
            <g transform={`translate(${impactPos[0]}, ${impactPos[1]})`}>
              {currentEvent.intercepted ? (
                <>
                  <circle
                    cx={0}
                    cy={0}
                    r={8 + blastProgress * 34}
                    fill="none"
                    stroke="#34d399"
                    strokeWidth={2.8 * (1 - blastProgress * 0.7)}
                    strokeOpacity={1 - blastProgress}
                    filter="url(#neonGlow)"
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
                    r={10 + blastProgress * (currentEvent.kind === 'NUCLEAR' ? 68 : 42)}
                    fill="none"
                    stroke={currentEvent.kind === 'ASAT' ? '#38bdf8' : '#f43f5e'}
                    strokeWidth={3.2 * (1 - blastProgress * 0.6)}
                    strokeOpacity={1 - blastProgress}
                    filter="url(#neonGlow)"
                  />
                  <circle
                    cx={0}
                    cy={0}
                    r={6 + blastProgress * (currentEvent.kind === 'NUCLEAR' ? 42 : 24)}
                    fill={currentEvent.kind === 'ASAT' ? '#38bdf8' : '#fb923c'}
                    fillOpacity={0.55 * (1 - blastProgress)}
                  />
                </>
              )}

              {/* Floating Tactical Impact Badge */}
              <g transform={`translate(0, ${-18 - blastProgress * 10})`}>
                <rect
                  x={-88}
                  y={-12}
                  width={176}
                  height={22}
                  rx={8}
                  fill={currentEvent.intercepted ? '#064e3b' : '#4c0519'}
                  fillOpacity={0.94}
                  stroke={currentEvent.intercepted ? '#34d399' : '#fb7185'}
                  strokeWidth={1}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={9.5}
                  fontWeight="bold"
                  fill="#ffffff"
                >
                  {currentEvent.impactBadgeFa}
                </text>
              </g>
            </g>
          )}
        </svg>

        {/* Step Progress Dots */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
          {events.map((ev, idx) => (
            <button
              key={ev.id}
              type="button"
              onClick={() => {
                setCurrentIndex(idx);
                setProgress(0);
              }}
              className={`h-2 rounded-full transition-all ${
                idx === currentIndex
                  ? 'w-7 bg-emerald-400'
                  : idx < currentIndex
                  ? 'w-2 bg-slate-500'
                  : 'w-2 bg-slate-800'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Bottom Live TV News Chyron */}
      <div className="max-w-6xl w-full mx-auto bg-[#071124]/95 border border-slate-700/80 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 shrink-0">
            {currentEvent.attackerId ? (
              <CountryFlag countryId={currentEvent.attackerId} size="md" />
            ) : (
              <span className="px-2 py-1 rounded bg-purple-500/20 text-purple-200 text-xs font-bold">🕵️</span>
            )}
            <span className="text-slate-400 font-bold">←</span>
            {currentEvent.defenderId && <CountryFlag countryId={currentEvent.defenderId} size="md" />}
          </div>
          <div>
            <div className="text-xs sm:text-sm font-black text-white leading-relaxed">
              {currentEvent.headlineFa}
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {currentEvent.intercepted ? (
            <span className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-400/50 text-emerald-300 text-xs font-black flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4" /> دفع و رهگیری در آسمان!
            </span>
          ) : (
            <span className="px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-400/50 text-rose-300 text-xs font-black flex items-center gap-1.5">
              <Flame className="w-4 h-4" /> اجرای موفق عملیات!
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
