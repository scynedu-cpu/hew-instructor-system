// 막대그래프를 원통형(위·아래 타원 + 몸통)으로 그리는 recharts Bar 커스텀 shape.
// recharts 의 BarShapeProps 타입 선언에는 fill 이 빠져 있지만 실제로는 항상
// 전달되므로(Cell 로 지정한 색 포함), 이 컴포넌트 자체 prop 타입으로 받는다.

function shade(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent * 100);
  const clamp = (v: number) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt);
  const g = clamp(((num >> 8) & 0x00ff) + amt);
  const b = clamp((num & 0x0000ff) + amt);
  return `#${(0x1000000 + r * 0x10000 + g * 0x100 + b).toString(16).slice(1)}`;
}

export interface CylinderBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}

export function CylinderBar({ x = 0, y = 0, width = 0, height = 0, fill = "#2563eb" }: CylinderBarProps) {
  if (width <= 0 || height <= 0) return null;
  const rx = width / 2;
  const ry = Math.min(width * 0.28, height / 2, 10);
  const cx = x + rx;

  return (
    <g>
      <rect x={x} y={y + ry} width={width} height={Math.max(height - ry, 0)} fill={fill} />
      <ellipse cx={cx} cy={y + height} rx={rx} ry={ry} fill={shade(fill, -0.2)} />
      <ellipse cx={cx} cy={y + ry} rx={rx} ry={ry} fill={shade(fill, 0.25)} />
    </g>
  );
}
