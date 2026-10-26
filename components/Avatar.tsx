// Pixel-art critter generated from a name, so every agent gets a stable face.

const NAMED: Record<string, number> = {
  red: 0, orange: 28, yellow: 48, green: 140, cyan: 185, blue: 220, purple: 265, pink: 320,
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function agentHue(name: string, color?: string) {
  if (color && NAMED[color] != null) return NAMED[color];
  return hash(name) % 360;
}

export default function Avatar({ name, color, size = 52 }: { name: string; color?: string; size?: number }) {
  const h = hash(name);
  const hue = agentHue(name, color);
  const body = `hsl(${hue} 70% 68%)`;
  const shade = `hsl(${hue} 55% 48%)`;
  const ink = `hsl(${hue} 40% 14%)`;

  // 8x8 grid, mirrored left/right. Ears + head + face are templated, extras come from the hash.
  const px: [number, number, string][] = [];
  const set = (x: number, y: number, c: string) => {
    px.push([x, y, c]);
    if (x !== 7 - x) px.push([7 - x, y, c]);
  };
  const ears = h % 3;
  if (ears === 0) { set(1, 0, shade); set(1, 1, body); }
  if (ears === 1) { set(0, 1, shade); set(1, 1, body); }
  if (ears === 2) { set(2, 0, shade); set(2, 1, body); }
  for (let y = 2; y <= 6; y++) for (let x = 1; x <= 3; x++) set(x, y, body);
  set(0, 3, body); set(0, 4, body);
  for (let x = 1; x <= 3; x++) set(x, 7, shade);
  // eyes
  const eyeY = 3 + ((h >> 3) % 2);
  set(2, eyeY, ink);
  // cheeks or mouth
  if ((h >> 5) % 2) set(1, eyeY + 1, `hsl(${(hue + 330) % 360} 80% 72%)`);
  set(3, eyeY + 2, ink);
  // white muzzle
  if ((h >> 7) % 2) set(3, eyeY + 1, "#fff");

  return (
    <div className="avatar" style={{ width: size, height: size, background: `hsl(${hue} 30% 22%)` }}>
      <svg viewBox="-1 -1 10 10" width={size * 0.8} height={size * 0.8} shapeRendering="crispEdges" aria-hidden>
        {px.map(([x, y, c], i) => (
          <rect key={i} x={x} y={y} width={1.02} height={1.02} fill={c} />
        ))}
      </svg>
    </div>
  );
}
