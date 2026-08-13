import React from 'react';

type Point = { x: number; y: number };

function buildCurve(points: Point[], width: number, height: number, pad: number) {
  const maxX = Math.max(...points.map((p) => p.x), 1);
  const maxY = Math.max(...points.map((p) => p.y), 1);
  const scaled = points.map((p) => ({
    x: pad + (p.x / maxX) * (width - pad * 2),
    y: height - pad - (p.y / maxY) * (height - pad * 2),
  }));
  if (scaled.length < 2) return '';
  return scaled.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

const planned = Array.from({ length: 13 }, (_, i) => ({ x: i, y: Math.round(100 * (1 - Math.pow(1 - i / 12, 2.2))) }));
const actual = Array.from({ length: 9 }, (_, i) => ({ x: i, y: [0, 4, 9, 16, 24, 33, 41, 47, 52][i] }));

export function SCurve({ height = 240, className }: { height?: number; className?: string }) {
  const width = 560;
  const pad = 28;
  const plannedPath = buildCurve(planned, width, height, pad);
  const actualPath = buildCurve(actual, width, height, pad);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className} role="img" aria-label="Planned vs actual progress curve">
      <defs>
        <linearGradient id="scurve-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--ecms-amber, #f59e0b)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--ecms-amber, #f59e0b)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }, (_, i) => {
        const y = pad + (i * (height - pad * 2)) / 4;
        return <line key={i} x1={pad} y1={y} x2={width - pad} y2={y} stroke="var(--ecms-border, #26334a)" strokeWidth="1" />;
      })}
      {Array.from({ length: 5 }, (_, i) => {
        const x = pad + (i * (width - pad * 2)) / 4;
        return <line key={`v${i}`} x1={x} y1={pad} x2={x} y2={height - pad} stroke="var(--ecms-border, #26334a)" strokeWidth="1" />;
      })}
      <path d={`${plannedPath} L${width - pad},${height - pad} L${pad},${height - pad} Z`} fill="url(#scurve-fill)" />
      <path d={plannedPath} fill="none" stroke="var(--ecms-muted, #8b94a7)" strokeWidth="1.5" strokeDasharray="5 4" />
      <path d={actualPath} fill="none" stroke="var(--ecms-amber, #f59e0b)" strokeWidth="2.5" strokeLinecap="round" />
      <text x={width - 60} y={pad - 8} fontSize="11" fill="var(--ecms-muted, #8b94a7)">Planned</text>
      <text x={width - 90} y={height - 12} fontSize="11" fill="var(--ecms-amber, #f59e0b)">Actual</text>
    </svg>
  );
}
