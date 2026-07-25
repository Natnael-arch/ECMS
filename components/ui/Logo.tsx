import React from 'react';
import { cn } from '@/lib/utils';

interface LogoProps {
  variant?: 'mark' | 'full';
  className?: string;
}

export function Logo({ variant = 'full', className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Icon */}
      <div
        className="flex-shrink-0 flex items-center justify-center relative"
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          backgroundColor: '#0F1C2E',
        }}
      >
        <svg
          width="44"
          height="44"
          viewBox="0 0 44 44"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className="absolute"
        >
          <polygon
            points="22,8 34.12,15 34.12,29 22,36 9.88,29 9.88,15"
            stroke="#F5A623"
            strokeWidth="2"
            fill="none"
          />
          <text
            x="22"
            y="23" /* slightly adjusted for visual vertical centering */
            fill="#F5A623"
            fontFamily="Inter, sans-serif"
            fontWeight="700"
            fontSize="13"
            textAnchor="middle"
            dominantBaseline="central"
          >
            E
          </text>
        </svg>
      </div>

      {/* Wordmark */}
      {variant === 'full' && (
        <div className="flex flex-col justify-center">
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              fontSize: '16px',
              letterSpacing: '3px',
              color: '#F0F4F8',
              lineHeight: 1,
            }}
          >
            ECMS
          </span>
          <span
            style={{
              fontFamily: 'Inter, sans-serif',
              fontWeight: 400,
              fontSize: '8px',
              letterSpacing: '2px',
              color: '#8BA3BE',
              lineHeight: 1,
              marginTop: '4px',
            }}
          >
            CONSTRUCTION MANAGEMENT
          </span>
        </div>
      )}
    </div>
  );
}
