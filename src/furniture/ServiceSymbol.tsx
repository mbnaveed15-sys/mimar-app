import type { ReactNode } from 'react';

interface Props {
  kind: string;
  /** Size in plan units; centred on 0,0 with its back (the wall side) at the top. */
  w: number;
  h: number;
  stroke: string;
  /** Line width in plan units. */
  sw: number;
}

/**
 * Plan symbols for Services items, in the usual style of electrical and plumbing drawings: a circle
 * with a cross for a light, a half circle against the wall for a socket, a bow tie for a valve, and a
 * short code in a box or circle where drawings use one (DB, TV, OHT…).
 */
export function ServiceSymbol({ kind, w, h, stroke, sw }: Props) {
  const R = Math.min(w, h) / 2;
  const T = -h / 2;
  const style = { fill: 'none', stroke, strokeWidth: sw, strokeLinecap: 'round' as const };
  const solid = { fill: stroke, stroke, strokeWidth: sw };
  const paper = { fill: 'var(--plan-paper, #fff)', stroke, strokeWidth: sw };
  const text = (t: string, size = 0.42, y = 0) => (
    <text
      x={0}
      y={y}
      fontSize={Math.min(w, h) * size}
      textAnchor="middle"
      dominantBaseline="central"
      style={{ fill: stroke }}
      fontWeight={600}
    >
      {t}
    </text>
  );
  const box = (t?: string, size?: number) => (
    <>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} style={paper} />
      {t && text(t, size ?? (t.length > 2 ? 0.34 : 0.45))}
    </>
  );
  const ring = (t?: string, r = R * 0.9, size?: number) => (
    <>
      <circle r={r} style={paper} />
      {t && text(t, size ?? (t.length > 2 ? 0.3 : 0.42))}
    </>
  );
  const cross = (r: number) => (
    <path
      d={`M${-r * 0.7} ${-r * 0.7}L${r * 0.7} ${r * 0.7}M${r * 0.7} ${-r * 0.7}L${-r * 0.7} ${r * 0.7}`}
      style={style}
    />
  );
  /** A half circle standing off the wall (the back), as for sockets. */
  const half = (filled = false) => (
    <>
      <path d={`M${-R * 0.9} ${T}A${R * 0.9} ${R * 0.9} 0 0 0 ${R * 0.9} ${T}Z`} style={filled ? solid : paper} />
    </>
  );
  // A valve: two triangles tip to tip, with its handle's stem.
  const valve = (
    <>
      <path d={`M${-R} ${-R * 0.6}L${R} ${R * 0.6}L${R} ${-R * 0.6}L${-R} ${R * 0.6}Z`} style={paper} />
      <path d={`M0 0V${-R}M${-R * 0.4} ${-R}H${R * 0.4}`} style={style} />
    </>
  );
  /** A switch: a small circle with an arm and a tick, one way or both. */
  const switchArm = (both: boolean) => {
    const r = R * 0.28;
    const arm = (sx: number) => (
      <path
        d={`M${sx * r * 0.7} ${-r * 0.7}L${sx * R * 0.8} ${-R * 0.8}L${sx * R * 0.8 + sx * R * 0.25} ${-R * 0.55}`}
        style={style}
      />
    );
    return (
      <>
        <circle r={r} style={solid} />
        {arm(1)}
        {both && arm(-1)}
      </>
    );
  };
  const blades = (r: number) =>
    [0, 120, 240].map((a) => (
      <ellipse key={a} cx={0} cy={-r * 0.55} rx={r * 0.18} ry={r * 0.45} transform={`rotate(${a})`} style={paper} />
    ));

  const symbols: Record<string, () => ReactNode> = {
    'light-ceiling': () => (
      <>
        {ring()}
        {cross(R * 0.9)}
      </>
    ),
    downlight: () => (
      <>
        {ring()}
        <circle r={R * 0.35} style={solid} />
      </>
    ),
    pendant: () => (
      <>
        {ring()}
        <circle r={R * 0.5} style={style} />
        {cross(R * 0.9)}
      </>
    ),
    'tube-light': () => (
      <>
        <rect x={-w / 2} y={-h / 4} width={w} height={h / 2} style={paper} />
        <path d={`M${-w / 2} ${-h / 2}V${h / 2}M${w / 2} ${-h / 2}V${h / 2}`} style={style} />
      </>
    ),
    'wall-light': () => (
      <>
        <path d={`M${-w / 2} ${T}H${w / 2}`} style={style} />
        <path d={`M${-R} ${T}A${R} ${R} 0 0 0 ${R} ${T}Z`} style={paper} />
        <path
          d={`M${-R * 0.5} ${T}L${R * 0.5} ${T + R * 0.8}M${R * 0.5} ${T}L${-R * 0.5} ${T + R * 0.8}`}
          style={style}
        />
      </>
    ),
    'garden-light': () => (
      <>
        {ring(undefined, R * 0.6)}
        {cross(R * 0.6)}
        {[0, 90, 180, 270].map((a) => (
          <line key={a} x1={0} y1={-R * 0.7} x2={0} y2={-R} transform={`rotate(${a + 45})`} style={style} />
        ))}
      </>
    ),
    'gate-light': () => (
      <>
        {box()}
        <circle r={R * 0.6} style={style} />
        {cross(R * 0.6)}
      </>
    ),
    'emergency-light': () => box('EL'),
    'switch-1': () => switchArm(false),
    'switch-2': () => switchArm(true),
    'switch-board': () => box('SB'),
    regulator: () => (
      <>
        {ring('R')}
        <path d={`M${-R * 0.6} ${R * 0.6}L${R * 0.6} ${-R * 0.6}`} style={style} />
      </>
    ),
    'bell-push': () => (
      <>
        {ring()}
        <circle r={R * 0.3} style={solid} />
      </>
    ),
    socket: () => (
      <>
        {half()}
        <path d={`M${-R * 0.3} ${T}v${R * 0.45}M${R * 0.3} ${T}v${R * 0.45}`} style={style} />
      </>
    ),
    'socket-power': () => (
      <>
        {half(true)}
        <path d={`M0 ${T + R * 0.9}v${R * 0.5}`} style={style} />
      </>
    ),
    'socket-usb': () => (
      <>
        {half()}
        {text('USB', 0.24, T + R * 0.4)}
      </>
    ),
    'socket-outdoor': () => (
      <>
        {half()}
        {text('WP', 0.3, T + R * 0.4)}
      </>
    ),
    'ac-isolator': () => box('AC'),
    'cooker-point': () => box('CP'),
    db: () => (
      <>
        {box()}
        <path d={`M${-w / 2} ${h / 2}L${w / 2} ${-h / 2}L${w / 2} ${h / 2}Z`} style={solid} />
      </>
    ),
    meter: () => box('kWh'),
    ups: () => box('UPS'),
    'solar-inverter': () => box('INV'),
    changeover: () => box('CO'),
    'earth-pit': () => (
      <>
        {box()}
        <path
          d={`M0 ${-R * 0.7}V0M${-R * 0.6} 0H${R * 0.6}M${-R * 0.4} ${R * 0.25}H${R * 0.4}M${-R * 0.2} ${R * 0.5}H${R * 0.2}`}
          style={style}
        />
      </>
    ),
    chime: () => (
      <>
        <path
          d={`M${-R * 0.7} ${R * 0.4}Q${-R * 0.7} ${-R * 0.8} 0 ${-R * 0.8}Q${R * 0.7} ${-R * 0.8} ${R * 0.7} ${R * 0.4}Z`}
          style={paper}
        />
        <circle cy={R * 0.6} r={R * 0.15} style={solid} />
      </>
    ),
    'fan-ceiling': () => (
      <>
        {blades(R)}
        <circle r={R * 0.12} style={solid} />
      </>
    ),
    'fan-exhaust': () => (
      <>
        {box()}
        {blades(R * 0.85)}
      </>
    ),
    'fan-wall': () => (
      <>
        <path d={`M${-w / 2} ${T}H${w / 2}`} style={style} />
        <circle cy={T + R} r={R * 0.9} style={paper} />
        <g transform={`translate(0 ${T + R})`}>{blades(R * 0.8)}</g>
      </>
    ),
    'ac-split': () => (
      <>
        {box('AC', 0.6)}
        <path d={`M${-w / 2 + R * 0.3} ${h / 2 - R * 0.35}H${w / 2 - R * 0.3}`} style={style} />
      </>
    ),
    'ac-outdoor': () => (
      <>
        {box()}
        <circle cx={-w / 4 + R * 0.1} r={R * 0.75} style={style} />
        {text('ODU', 0.28)}
      </>
    ),
    'ac-window': () => box('WAC', 0.24),
    'ac-cassette': () => (
      <>
        {box()}
        <rect x={-w / 4} y={-h / 4} width={w / 2} height={h / 2} style={style} />
        <path
          d={`M${-w / 2} ${-h / 2}L${-w / 4} ${-h / 4}M${w / 2} ${-h / 2}L${w / 4} ${-h / 4}M${-w / 2} ${h / 2}L${-w / 4} ${h / 4}M${w / 2} ${h / 2}L${w / 4} ${h / 4}`}
          style={style}
        />
      </>
    ),
    'cooler-point': () => (
      <>
        {half()}
        {text('C', 0.4, T + R * 0.4)}
      </>
    ),
    'water-meter': () => ring('WM'),
    'tank-overhead': () => ring('OHT', R * 0.95, 0.18),
    'tank-underground': () => (
      <>
        <rect
          x={-w / 2}
          y={-h / 2}
          width={w}
          height={h}
          style={{ ...paper, strokeDasharray: `${R * 0.15} ${R * 0.1}` }}
        />
        {text('UGT', 0.2)}
      </>
    ),
    pump: () => (
      <>
        {ring()}
        <path d={`M${-R * 0.45} ${R * 0.45}L0 ${-R * 0.55}L${R * 0.45} ${R * 0.45}Z`} style={solid} />
      </>
    ),
    geyser: () => ring('G'),
    'geyser-gas': () => ring('GG'),
    valve: () => valve,
    tap: () => (
      <>
        <path d={`M0 ${T}V${T + R}`} style={style} />
        <circle cy={T + R * 1.2} r={R * 0.35} style={solid} />
      </>
    ),
    mixer: () => (
      <>
        <path d={`M0 ${T}V${T + h * 0.5}`} style={style} />
        <circle cx={-R * 0.6} cy={T + h * 0.2} r={R * 0.25} style={style} />
        <circle cx={R * 0.6} cy={T + h * 0.2} r={R * 0.25} style={solid} />
      </>
    ),
    'shower-head': () => (
      <>
        <path d={`M0 ${T}V${-R * 0.6}`} style={style} />
        <circle r={R * 0.6} style={paper} />
        {[-0.3, 0, 0.3].flatMap((x) =>
          [-0.3, 0, 0.3].map((y) => <circle key={`${x}${y}`} cx={x * R} cy={y * R} r={R * 0.06} style={solid} />),
        )}
      </>
    ),
    'hand-shower': () => (
      <>
        <path d={`M0 ${T}V${T + R * 0.8}`} style={style} />
        <rect x={-R * 0.25} y={T + R * 0.8} width={R * 0.5} height={R} rx={R * 0.2} style={paper} />
      </>
    ),
    'garden-tap': () => (
      <>
        <path d={`M0 ${T}V${T + R}`} style={style} />
        <circle cy={T + R * 1.2} r={R * 0.35} style={paper} />
      </>
    ),
    'washer-point': () => box('WMP', 0.28),
    'water-filter': () => box('F'),
    'floor-trap': () => (
      <>
        {box()}
        <circle r={R * 0.75} style={style} />
        <path d={`M${-R * 0.5} 0H${R * 0.5}M0 ${-R * 0.5}V${R * 0.5}`} style={style} />
      </>
    ),
    'gully-trap': () => (
      <>
        {box()}
        <circle r={R * 0.7} style={style} />
        {text('GT', 0.3)}
      </>
    ),
    manhole: () => (
      <>
        {box()}
        <path d={`M${-w / 2} ${-h / 2}L${w / 2} ${h / 2}M${w / 2} ${-h / 2}L${-w / 2} ${h / 2}`} style={style} />
      </>
    ),
    'septic-tank': () => (
      <>
        {box()}
        <path d={`M${-w / 6} ${-h / 2}V${h / 2}M${w / 6} ${-h / 2}V${h / 2}`} style={style} />
        {text('ST', 0.25, 0)}
      </>
    ),
    'soakage-pit': () => (
      <>
        {ring()}
        <circle r={R * 0.65} style={{ ...style, strokeDasharray: `${R * 0.12} ${R * 0.08}` }} />
        {text('SP', 0.2)}
      </>
    ),
    'rain-outlet': () => (
      <>
        {ring()}
        {cross(R * 0.9)}
        <circle r={R * 0.3} style={solid} />
      </>
    ),
    downpipe: () => (
      <>
        {ring()}
        <circle r={R * 0.45} style={solid} />
      </>
    ),
    'vent-pipe': () => ring('V'),
    'clean-out': () => (
      <>
        {ring()}
        <path d={`M${-R * 0.6} 0H${R * 0.6}`} style={style} />
      </>
    ),
    'gas-meter': () => box('GM'),
    'gas-valve': () => valve,
    'tv-point': () => box('TV'),
    'data-point': () => (
      <>
        <path d={`M${-R} ${T}H${R}L0 ${T + R * 1.6}Z`} style={paper} />
        {text('D', 0.35, T + R * 0.55)}
      </>
    ),
    'phone-point': () => (
      <>
        <path d={`M${-R} ${T}H${R}L0 ${T + R * 1.6}Z`} style={paper} />
        {text('T', 0.35, T + R * 0.55)}
      </>
    ),
    router: () => box('WiFi', 0.3),
    cctv: () => (
      <>
        <rect x={-w / 2} y={-h / 2} width={w * 0.7} height={h * 0.6} style={paper} />
        <path d={`M${w * 0.2} ${-h * 0.35}L${w / 2} ${-h / 2}V${h * 0.1}L${w * 0.2} ${-h * 0.05}Z`} style={solid} />
        <path d={`M${-w * 0.2} ${h * 0.1}V${h / 2}`} style={style} />
      </>
    ),
    intercom: () => box('IC'),
    'video-phone': () => box('VDP'),
    'smoke-detector': () => ring('S'),
    'heat-detector': () => ring('H'),
    extinguisher: () => (
      <>
        <rect x={-w * 0.3} y={-h / 2} width={w * 0.6} height={h} rx={w * 0.2} style={solid} />
        <text
          x={0}
          y={0}
          fontSize={Math.min(w, h) * 0.32}
          textAnchor="middle"
          dominantBaseline="central"
          style={{ fill: 'var(--plan-paper, #fff)' }}
          fontWeight={700}
        >
          FE
        </text>
      </>
    ),
    'call-point': () => (
      <>
        {box()}
        <circle r={R * 0.4} style={solid} />
      </>
    ),
    'fire-bell': () => (
      <>
        {ring()}
        <path
          d={`M${-R * 0.5} ${R * 0.3}Q${-R * 0.5} ${-R * 0.6} 0 ${-R * 0.6}Q${R * 0.5} ${-R * 0.6} ${R * 0.5} ${R * 0.3}Z`}
          style={solid}
        />
      </>
    ),
  };
  return <g data-symbol={kind}>{symbols[kind]?.() ?? ring('?')}</g>;
}
