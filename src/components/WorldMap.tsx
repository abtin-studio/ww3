import React, { useMemo, useRef, useState } from 'react';
import { geoNaturalEarth1, geoPath, GeoPermissibleObjects } from 'd3-geo';
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Eye, EyeOff } from 'lucide-react';
import * as topojson from 'topojson-client';
import worldAtlas from 'world-atlas/countries-110m.json';
import { ChokepointState, CountryId, CountryState, GameOrder, GameRoomState } from '../../shared/types';
import { sound } from '../utils/sound';
import { SHORT_NAME_FA } from './CountryFlag';

interface WorldMapProps {
  room: GameRoomState;
  myCountryId: CountryId | null;
  selectedCountryId: CountryId | null;
  onSelectCountry: (countryId: CountryId) => void;
}

const MAP_W = 1000;
const MAP_H = 510;

export const WorldMap: React.FC<WorldMapProps> = ({
  room,
  myCountryId,
  selectedCountryId,
  onSelectCountry,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showArcs, setShowArcs] = useState(true);
  const dragRef = useRef<{
    pointerDown: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  }>({
    pointerDown: false,
    moved: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  // Build proper spherical projection with antimeridian clipping (zero Russia/Alaska line artifacts!)
  const { projection, features } = useMemo(() => {
    const topo = worldAtlas as unknown as { objects: { countries: unknown } };
    const rawFc = topojson.feature(
      worldAtlas as unknown as Parameters<typeof topojson.feature>[0],
      topo.objects.countries as Parameters<typeof topojson.feature>[1]
    ) as unknown as {
      type: 'FeatureCollection';
      features: Array<{ id?: string | number; type: 'Feature'; geometry: GeoPermissibleObjects; properties: unknown }>;
    };

    const filteredFeatures = rawFc.features.filter((f) => String(f.id) !== '010');
    const cleanFc = { type: 'FeatureCollection' as const, features: filteredFeatures };

    const proj = geoNaturalEarth1().fitExtent(
      [
        [16, 20],
        [MAP_W - 16, MAP_H - 16],
      ],
      cleanFc as unknown as GeoPermissibleObjects
    );
    const pathGen = geoPath(proj);

    return {
      projection: proj,
      features: filteredFeatures.map((f) => ({
        iso: String(f.id ?? '').padStart(3, '0'),
        d: pathGen(f as unknown as GeoPermissibleObjects) || '',
      })),
    };
  }, []);

  const isoMap = useMemo(() => {
    const m = new Map<string, CountryState>();
    for (const c of Object.values(room.countries)) {
      m.set(c.isoNumeric, c);
    }
    return m;
  }, [room.countries]);

  const projectPoint = (coords: [number, number]): [number, number] => {
    const pt = projection(coords);
    return pt ? [Number(pt[0].toFixed(1)), Number(pt[1].toFixed(1))] : [MAP_W / 2, MAP_H / 2];
  };

  const buildCurvedArc = (from: [number, number], to: [number, number]): string => {
    const [x1, y1] = projectPoint(from);
    const [x2, y2] = projectPoint(to);
    const mx = (x1 + x2) / 2;
    const dist = Math.hypot(x2 - x1, y2 - y1);
    const my = (y1 + y2) / 2 - Math.min(95, dist * 0.25);
    return `M ${x1} ${y1} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}`;
  };

  const myCountry = myCountryId ? room.countries[myCountryId] : null;

  const attackedCountriesLastRound = useMemo(() => {
    const s = new Set<CountryId>();
    for (const ev of room.visualEvents) {
      if (ev.kind !== 'TRADE' && ev.kind !== 'RECON') {
        s.add(ev.toCountry);
      }
    }
    return s;
  }, [room.visualEvents]);

  const clampPan = (nx: number, ny: number, z: number) => {
    const maxPanX = MAP_W * (z - 1) + 120;
    const maxPanY = MAP_H * (z - 1) + 90;
    return {
      x: Math.max(-maxPanX, Math.min(120, nx)),
      y: Math.max(-maxPanY, Math.min(90, ny)),
    };
  };

  const applyZoom = (delta: number) => {
    setZoom((prev) => {
      const next = Math.max(1, Math.min(3.5, Number((prev + delta).toFixed(2))));
      if (next === 1) {
        setPan({ x: 0, y: 0 });
      } else {
        const cx = MAP_W / 2;
        const cy = MAP_H / 2;
        const ratio = next / prev;
        setPan((p) =>
          clampPan(cx - (cx - p.x) * ratio, cy - (cy - p.y) * ratio, next)
        );
      }
      return next;
    });
  };

  const focusOnCountry = (cid: CountryId | null) => {
    if (!cid || !room.countries[cid]) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const [cx, cy] = projectPoint(room.countries[cid].coordinates);
    const nextZoom = 2.1;
    setZoom(nextZoom);
    setPan(clampPan(MAP_W / 2 - cx * nextZoom, MAP_H / 2 - cy * nextZoom, nextZoom));
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    applyZoom(e.deltaY < 0 ? 0.25 : -0.25);
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      pointerDown: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.pointerDown) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 6) {
      dragRef.current.moved = true;
      setPan(clampPan(dragRef.current.origX + dx * 0.9, dragRef.current.origY + dy * 0.9, zoom));
    }
  };

  const handlePointerUp = () => {
    dragRef.current.pointerDown = false;
  };

  const handleSelectSafe = (cid: CountryId, e: React.MouseEvent) => {
    e.stopPropagation();
    if (dragRef.current.moved) return;
    sound.playRadarPing();
    onSelectCountry(cid);
  };

  const myPendingOrders: GameOrder[] = myCountry ? myCountry.orders : [];

  return (
    <div className="relative w-full h-full min-h-[360px] sm:min-h-[470px] bg-[#040a16] rounded-2xl border border-slate-800/90 overflow-hidden select-none shadow-2xl">
      {/* Legend */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="px-3 py-1.5 rounded-xl bg-[#071122]/90 border border-slate-700/80 text-[11px] text-slate-200 flex items-center gap-3 backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> کشور شما
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> متحد
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> بازیکن رقیب
          </span>
          <span className="hidden sm:flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" /> کشور زنده AI
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          title="بزرگ‌نمایی"
          onClick={() => applyZoom(0.35)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="کوچک‌نمایی"
          onClick={() => applyZoom(-0.35)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="نمای کامل جهان"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        {myCountryId && (
          <button
            type="button"
            title="تمرکز روی کشور من"
            onClick={() => focusOnCountry(myCountryId)}
            className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 shadow"
          >
            <Crosshair className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          title="نمایش/مخفی کردن خطوط عملیات"
          onClick={() => setShowArcs((v) => !v)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-cyan-300 shadow"
        >
          {showArcs ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Hint + Active Arcs Summary */}
      <div className="absolute bottom-2.5 inset-x-3 z-10 flex items-center justify-between pointer-events-none gap-2">
        <div className="px-3 py-1 rounded-full bg-[#071122]/90 border border-slate-800 text-[11px] text-slate-300">
          🎯 روی هر یک از ۲۰ کشور زنده کلیک کنید: تجارت ۱-کلیکی، حمله با نمایش شانس پیروزی، یا هک و جاسوسی
        </div>
        {room.visualEvents.length > 0 && (
          <div className="hidden sm:block px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/35 text-[11px] text-rose-200 font-bold">
            ⚡ {room.visualEvents.length} عملیات فعال روی نقشه
          </div>
        )}
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onWheel={handleWheel}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <radialGradient id="oceanGlowV2" cx="50%" cy="48%" r="65%">
            <stop offset="0%" stopColor="#0a1933" />
            <stop offset="100%" stopColor="#030711" />
          </radialGradient>
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="url(#oceanGlowV2)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Country Polygons (Mathematically Antimeridian-Clipped by d3-geo!) */}
          {features.map((f, idx) => {
            if (!f.d) return null;
            const gameCountry = isoMap.get(f.iso);
            if (!gameCountry) {
              return (
                <path
                  key={`bg-${idx}`}
                  d={f.d}
                  fill="#0d1a2e"
                  stroke="#182c4d"
                  strokeWidth={0.5}
                />
              );
            }

            const isMine = gameCountry.id === myCountryId;
            const isSelected = gameCountry.id === selectedCountryId;
            const isAlly = Boolean(myCountry?.allies.includes(gameCountry.id));
            const isHumanOther = Boolean(gameCountry.playerId && !isMine);
            const isSanctioned = Boolean(myCountry && gameCountry.sanctionedBy.includes(myCountry.id));

            const fill = isMine
              ? '#059669'
              : isSelected
              ? '#0284c7'
              : isAlly
              ? '#0e7490'
              : isHumanOther
              ? '#b45309'
              : isSanctioned
              ? '#4c1d2e'
              : '#1b3159';

            const stroke = isSelected
              ? '#7dd3fc'
              : isMine
              ? '#34d399'
              : isHumanOther
              ? '#fbbf24'
              : '#36588f';

            return (
              <path
                key={`pwr-${gameCountry.id}-${idx}`}
                d={f.d}
                fill={fill}
                fillOpacity={isSelected ? 0.95 : 0.85}
                stroke={stroke}
                strokeWidth={isSelected || isMine ? 1.25 : 0.75}
                className="cursor-pointer transition-opacity duration-150 hover:opacity-100"
                onClick={(e) => handleSelectSafe(gameCountry.id, e)}
              />
            );
          })}

          {/* Strategic Chokepoints */}
          {Object.values(room.chokepoints).map((cp: ChokepointState) => {
            const [x, y] = projectPoint(cp.coordinates);
            const color =
              cp.status === 'BLOCKADED'
                ? '#ef4444'
                : cp.status === 'RESTRICTED'
                ? '#f59e0b'
                : '#10b981';

            return (
              <g key={cp.id} transform={`translate(${x}, ${y})`}>
                {cp.status !== 'OPEN' && (
                  <circle r={8} fill={color} fillOpacity={0.32} className="radar-ping-ring" />
                )}
                <polygon
                  points="0,-4.4 4.4,0 0,4.4 -4.4,0"
                  fill={color}
                  stroke="#020617"
                  strokeWidth={0.9}
                />
                <title>{`${cp.nameFa}: ${cp.status === 'OPEN' ? 'آزاد' : cp.status === 'RESTRICTED' ? 'بازرسی' : 'مسدود!'}`}</title>
              </g>
            );
          })}

          {/* Resolved Round Visual Trajectories */}
          {showArcs &&
            room.visualEvents.map((ev) => {
              const arc = buildCurvedArc(ev.from, ev.to);
              const strokeColor =
                ev.kind === 'NUCLEAR'
                  ? '#f43f5e'
                  : ev.kind === 'INVASION'
                  ? '#f97316'
                  : ev.kind === 'MISSILE' || ev.kind === 'DRONE'
                  ? '#ef4444'
                  : ev.kind === 'CYBER'
                  ? '#c084fc'
                  : ev.kind === 'TRADE'
                  ? '#10b981'
                  : '#38bdf8';

              return (
                <g key={ev.id}>
                  <path
                    d={arc}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={ev.kind === 'NUCLEAR' ? 2.5 : 1.7}
                    strokeOpacity={ev.intercepted ? 0.45 : 0.92}
                    className="animate-flight-arc"
                  />
                </g>
              );
            })}

          {/* My Queued Operations Live Preview Arcs */}
          {showArcs &&
            myCountry &&
            myPendingOrders.map((ord) => {
              const target = room.countries[ord.targetCountry];
              if (!target) return null;
              const arc = buildCurvedArc(myCountry.coordinates, target.coordinates);
              const color =
                ord.kind === 'MILITARY_OPERATION' ? '#fb7185' : '#c084fc';
              return (
                <path
                  key={ord.id}
                  d={arc}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.9}
                  className="animate-flight-arc"
                />
              );
            })}

          {/* Non-Overlapping Country Anchor Dots, Leader Lines & Pin Badges */}
          {Object.values(room.countries).map((c) => {
            const [ax, ay] = projectPoint(c.coordinates);
            const [dx, dy] = c.labelOffset || [0, 0];
            const bx = ax + dx;
            const by = ay + dy;
            const hasOffset = Math.hypot(dx, dy) > 4;

            const isMine = c.id === myCountryId;
            const isSelected = c.id === selectedCountryId;
            const isHuman = Boolean(c.playerId);
            const wasHit = attackedCountriesLastRound.has(c.id);

            return (
              <g key={`pin-${c.id}`}>
                {/* Capital anchor dot */}
                {wasHit && (
                  <circle cx={ax} cy={ay} r={10} fill="#ef4444" fillOpacity={0.35} className="radar-ping-ring" />
                )}
                {isMine && (
                  <circle cx={ax} cy={ay} r={10} fill="#10b981" fillOpacity={0.25} className="radar-ping-ring" />
                )}
                <circle
                  cx={ax}
                  cy={ay}
                  r={2.2}
                  fill={isMine ? '#34d399' : isHuman ? '#fbbf24' : '#94a3b8'}
                />

                {hasOffset && (
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    stroke={isSelected ? '#7dd3fc' : '#475569'}
                    strokeWidth={0.75}
                    strokeOpacity={0.8}
                  />
                )}

                <g
                  transform={`translate(${bx}, ${by})`}
                  className="cursor-pointer"
                  onClick={(e) => handleSelectSafe(c.id, e)}
                >
                  <rect
                    x={-22}
                    y={-8}
                    width={44}
                    height={16}
                    rx={4.5}
                    fill={
                      isSelected
                        ? '#0284c7'
                        : isMine
                        ? '#065f46'
                        : isHuman
                        ? '#92400e'
                        : '#091326'
                    }
                    fillOpacity={0.94}
                    stroke={
                      isSelected
                        ? '#7dd3fc'
                        : isMine
                        ? '#34d399'
                        : isHuman
                        ? '#fbbf24'
                        : '#334155'
                    }
                    strokeWidth={isSelected || isMine ? 1.15 : 0.7}
                  />
                  <text
                    x={0}
                    y={2.8}
                    textAnchor="middle"
                    fontSize={6.6}
                    fontWeight="bold"
                    fill="#f8fafc"
                  >
                    {SHORT_NAME_FA[c.id]}
                  </text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
