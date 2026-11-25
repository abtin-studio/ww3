import React, { useMemo, useRef, useState } from 'react';
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
const MAP_H = 480;

export function projectCoord([lng, lat]: [number, number]): [number, number] {
  const x = ((lng + 180) / 360) * MAP_W;
  // Slightly cropped polar regions (-58 to +82 lat) so Eurasia, Middle East, Americas & East Asia look large & proportional
  const clampedLat = Math.max(-58, Math.min(82, lat));
  const y = ((82 - clampedLat) / (82 - -58)) * MAP_H;
  return [Number(x.toFixed(1)), Number(y.toFixed(1))];
}

function ringToSvgPath(ring: number[][]): string {
  if (!ring.length) return '';
  let d = '';
  for (let i = 0; i < ring.length; i++) {
    const [lng, lat] = ring[i];
    const [x, y] = projectCoord([lng, lat]);
    if (i === 0) {
      d += `M${x},${y}`;
    } else {
      const prevLng = ring[i - 1][0];
      if (Math.abs(lng - prevLng) > 170) {
        d += `M${x},${y}`;
      } else {
        d += `L${x},${y}`;
      }
    }
  }
  return d + 'Z';
}

function geometryToPath(geom: { type: string; coordinates: unknown }): string {
  if (!geom) return '';
  if (geom.type === 'Polygon') {
    return (geom.coordinates as number[][][]).map(ringToSvgPath).join(' ');
  }
  if (geom.type === 'MultiPolygon') {
    return (geom.coordinates as number[][][][])
      .map((poly) => poly.map(ringToSvgPath).join(' '))
      .join(' ');
  }
  return '';
}

function buildCurvedArc(from: [number, number], to: [number, number]): string {
  const [x1, y1] = projectCoord(from);
  const [x2, y2] = projectCoord(to);
  const mx = (x1 + x2) / 2;
  const dist = Math.hypot(x2 - x1, y2 - y1);
  const my = (y1 + y2) / 2 - Math.min(95, dist * 0.26);
  return `M ${x1} ${y1} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}`;
}

export const WorldMap: React.FC<WorldMapProps> = ({
  room,
  myCountryId,
  selectedCountryId,
  onSelectCountry,
}) => {
  const [zoom, setZoom] = useState(1.15);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: -60, y: -15 });
  const [showArcs, setShowArcs] = useState(true);
  const dragRef = useRef<{ active: boolean; startX: number; startY: number; origX: number; origY: number }>({
    active: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });

  const isoMap = useMemo(() => {
    const m = new Map<string, CountryState>();
    for (const c of Object.values(room.countries)) {
      m.set(c.isoNumeric, c);
    }
    return m;
  }, [room.countries]);

  const geoFeatures = useMemo(() => {
    const topo = worldAtlas as unknown as {
      objects: { countries: unknown };
    };
    const fc = topojson.feature(
      worldAtlas as unknown as Parameters<typeof topojson.feature>[0],
      topo.objects.countries as Parameters<typeof topojson.feature>[1]
    ) as unknown as {
      features: Array<{ id?: string | number; geometry: { type: string; coordinates: unknown } }>;
    };
    return fc.features
      .filter((f) => String(f.id) !== '010') // Skip Antarctica for cleaner tactical map
      .map((f) => ({
        iso: String(f.id ?? '').padStart(3, '0'),
        path: geometryToPath(f.geometry),
      }));
  }, []);

  const myCountry = myCountryId ? room.countries[myCountryId] : null;

  const focusOnCountry = (cid: CountryId | null) => {
    if (!cid || !room.countries[cid]) {
      setZoom(1.1);
      setPan({ x: 0, y: 0 });
      return;
    }
    const [cx, cy] = projectCoord(room.countries[cid].coordinates);
    const nextZoom = 2.0;
    setZoom(nextZoom);
    setPan({
      x: MAP_W / 2 - cx * nextZoom,
      y: MAP_H / 2 - cy * nextZoom,
    });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({
      x: Math.max(-MAP_W * zoom * 0.75, Math.min(MAP_W * 0.5, dragRef.current.origX + dx * 0.85)),
      y: Math.max(-MAP_H * zoom * 0.75, Math.min(MAP_H * 0.5, dragRef.current.origY + dy * 0.85)),
    });
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  // Queued orders from my country as live preview trajectories
  const myPendingOrders: GameOrder[] = myCountry
    ? myCountry.orders.filter((o) => o.targetCountry && o.targetCountry !== myCountry.id)
    : [];

  return (
    <div className="relative w-full h-full min-h-[340px] sm:min-h-[460px] bg-[#040a15] rounded-2xl border border-slate-800/90 overflow-hidden select-none shadow-2xl">
      {/* Top Map Overlay Legend */}
      <div className="absolute top-3 right-3 z-10 flex flex-wrap items-center gap-2 pointer-events-none">
        <div className="px-2.5 py-1 rounded-lg bg-[#081121]/90 border border-slate-700/80 text-[11px] text-slate-300 flex items-center gap-3 backdrop-blur">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> کشور شما
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 inline-block" /> متحد
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" /> بازیکن رقیب
          </span>
          <span className="hidden sm:flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400/70 inline-block" /> کشور هوشمند
          </span>
        </div>
      </div>

      {/* Map Zoom & Layer Controls */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <button
          type="button"
          title="بزرگ‌نمایی"
          onClick={() => setZoom((z) => Math.min(3.4, Number((z + 0.35).toFixed(2))))}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="کوچک‌نمایی"
          onClick={() => setZoom((z) => Math.max(1, Number((z - 0.35).toFixed(2))))}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-slate-200 shadow"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="بازنشانی نمای جهان"
          onClick={() => {
            setZoom(1.05);
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
          title="نمایش/مخفی کردن خطوط پرواز و موشک"
          onClick={() => setShowArcs((v) => !v)}
          className="p-2 rounded-xl bg-[#0b1528]/90 hover:bg-slate-800 border border-slate-700 text-cyan-300 shadow"
        >
          {showArcs ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
        </button>
      </div>

      {/* Bottom Helper Hint */}
      <div className="absolute bottom-2.5 right-3 z-10 pointer-events-none">
        <div className="px-3 py-1 rounded-full bg-[#081121]/85 border border-slate-800 text-[11px] text-slate-300">
          💡 روی هر کشور کلیک کنید تا پنل دیپلماسی، تجارت، پرواز، ویروس یا حمله باز شود
        </div>
      </div>

      <svg
        viewBox={`0 0 ${MAP_W} ${MAP_H}`}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <defs>
          <radialGradient id="oceanGlow" cx="50%" cy="45%" r="65%">
            <stop offset="0%" stopColor="#09172e" />
            <stop offset="100%" stopColor="#030710" />
          </radialGradient>
        </defs>

        <rect width={MAP_W} height={MAP_H} fill="url(#oceanGlow)" />

        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Latitude / Longitude Tactical Grid Lines */}
          {[90, 180, 270, 360].map((gy) => (
            <line
              key={`lat-${gy}`}
              x1={0}
              y1={gy}
              x2={MAP_W}
              y2={gy}
              stroke="#11223d"
              strokeWidth={0.5}
              strokeDasharray="3 5"
            />
          ))}
          {[166, 333, 500, 666, 833].map((gx) => (
            <line
              key={`lng-${gx}`}
              x1={gx}
              y1={0}
              x2={gx}
              y2={MAP_H}
              stroke="#11223d"
              strokeWidth={0.5}
              strokeDasharray="3 5"
            />
          ))}

          {/* World Landmass & Active Powers Polygons */}
          {geoFeatures.map((f, idx) => {
            const gameCountry = isoMap.get(f.iso);
            if (!gameCountry) {
              return (
                <path
                  key={`bg-${idx}`}
                  d={f.path}
                  fill="#0d192b"
                  stroke="#182b49"
                  strokeWidth={0.45}
                />
              );
            }

            const isMine = gameCountry.id === myCountryId;
            const isSelected = gameCountry.id === selectedCountryId;
            const isAlly = Boolean(myCountry?.allies.includes(gameCountry.id));
            const isHumanOther = Boolean(gameCountry.playerId && !isMine);

            const fill = isMine
              ? '#059669'
              : isSelected
              ? '#0284c7'
              : isAlly
              ? '#0e7490'
              : isHumanOther
              ? '#b45309'
              : '#172b4d';

            const stroke = isSelected
              ? '#38bdf8'
              : isMine
              ? '#34d399'
              : isHumanOther
              ? '#fbbf24'
              : '#2b4c7e';

            return (
              <path
                key={`pwr-${gameCountry.id}-${idx}`}
                d={f.path}
                fill={fill}
                fillOpacity={isSelected ? 0.92 : 0.8}
                stroke={stroke}
                strokeWidth={isSelected || isMine ? 1.2 : 0.7}
                className="cursor-pointer transition-colors duration-150 hover:brightness-125"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playRadarPing();
                  onSelectCountry(gameCountry.id);
                }}
              />
            );
          })}

          {/* Strategic Maritime Chokepoints */}
          {Object.values(room.chokepoints).map((cp: ChokepointState) => {
            const [x, y] = projectCoord(cp.coordinates);
            const color =
              cp.status === 'BLOCKADED'
                ? '#ef4444'
                : cp.status === 'RESTRICTED'
                ? '#f59e0b'
                : '#10b981';

            return (
              <g key={cp.id} transform={`translate(${x}, ${y})`}>
                {cp.status !== 'OPEN' && (
                  <circle r={7} fill={color} fillOpacity={0.28} className="radar-ping-ring" />
                )}
                <polygon
                  points="0,-4.2 4.2,0 0,4.2 -4.2,0"
                  fill={color}
                  stroke="#020617"
                  strokeWidth={0.8}
                />
                <title>{`${cp.nameFa} (${cp.status === 'OPEN' ? 'باز' : cp.status === 'RESTRICTED' ? 'بازرسی' : 'مسدود!'})`}</title>
              </g>
            );
          })}

          {/* Last Round Resolved Visual Events (Flights, Missiles, Cyber, Trade) */}
          {showArcs &&
            room.visualEvents.map((ev) => {
              const arc = buildCurvedArc(ev.from, ev.to);
              const strokeColor =
                ev.kind === 'NUCLEAR'
                  ? '#f43f5e'
                  : ev.kind === 'MISSILE' || ev.kind === 'DRONE'
                  ? '#ef4444'
                  : ev.kind === 'CYBER'
                  ? '#a855f7'
                  : ev.kind === 'TRADE'
                  ? '#10b981'
                  : '#38bdf8';

              return (
                <g key={ev.id}>
                  <path
                    d={arc}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={ev.kind === 'NUCLEAR' ? 2.4 : 1.5}
                    strokeOpacity={ev.intercepted ? 0.45 : 0.9}
                    className="animate-flight-arc"
                  />
                </g>
              );
            })}

          {/* My Pending Queued Orders Live Preview Arcs */}
          {showArcs &&
            myCountry &&
            myPendingOrders.map((ord) => {
              const target = ord.targetCountry ? room.countries[ord.targetCountry] : null;
              if (!target) return null;
              const arc = buildCurvedArc(myCountry.coordinates, target.coordinates);
              const color =
                ord.kind === 'MILITARY_STRIKE'
                  ? '#fb7185'
                  : ord.kind === 'CYBER_ATTACK'
                  ? '#c084fc'
                  : ord.kind === 'ESPIONAGE_OP'
                  ? '#fbbf24'
                  : '#22d3ee';
              return (
                <path
                  key={ord.id}
                  d={arc}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.6}
                  className="animate-flight-arc"
                />
              );
            })}

          {/* Interactive Country Pin Badges (Easy Touch Targets on Mobile & Desktop!) */}
          {Object.values(room.countries).map((c) => {
            const [x, y] = projectCoord(c.coordinates);
            const isMine = c.id === myCountryId;
            const isSelected = c.id === selectedCountryId;
            const isHuman = Boolean(c.playerId);

            return (
              <g
                key={`pin-${c.id}`}
                transform={`translate(${x}, ${y})`}
                className="cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  sound.playRadarPing();
                  onSelectCountry(c.id);
                }}
              >
                {isMine && (
                  <circle r={11} fill="#10b981" fillOpacity={0.22} className="radar-ping-ring" />
                )}
                {c.incomingAlertActive && (
                  <circle r={14} fill="#ef4444" fillOpacity={0.35} className="radar-ping-ring" />
                )}
                <rect
                  x={-21}
                  y={-8.5}
                  width={42}
                  height={17}
                  rx={5}
                  fill={isSelected ? '#0284c7' : isMine ? '#065f46' : isHuman ? '#78350f' : '#091324'}
                  fillOpacity={0.93}
                  stroke={isSelected ? '#7dd3fc' : isMine ? '#34d399' : isHuman ? '#fbbf24' : '#334155'}
                  strokeWidth={isSelected || isMine ? 1.1 : 0.7}
                />
                <text
                  x={0}
                  y={3}
                  textAnchor="middle"
                  fontSize={6.8}
                  fontWeight="bold"
                  fill="#f8fafc"
                >
                  {SHORT_NAME_FA[c.id]}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
};
