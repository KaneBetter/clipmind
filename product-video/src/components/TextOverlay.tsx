import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';

interface TextOverlayProps {
  title: string;
  subtitle?: string;
  startFrame: number;
}

/**
 * Apple-style text overlay with frosted glass backdrop at the bottom.
 */
export const TextOverlay: React.FC<TextOverlayProps> = ({ title, subtitle, startFrame }) => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const bgOpacity = interpolate(frame, [startFrame, startFrame + 15], [0, 1], clamp);
  const titleOpacity = interpolate(frame, [startFrame + 5, startFrame + 25], [0, 1], clamp);
  const titleY = interpolate(frame, [startFrame + 5, startFrame + 25], [16, 0], clamp);
  const subtitleOpacity = interpolate(frame, [startFrame + 18, startFrame + 38], [0, 1], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        opacity: bgOpacity,
        background: 'linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.85) 50%, rgba(255,255,255,0) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        padding: '72px 64px 40px 64px',
      }}
    >
      <div
        style={{
          opacity: titleOpacity,
          transform: `translateY(${titleY}px)`,
          fontSize: 44,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: '"SF Pro Display", "PingFang SC", -apple-system, sans-serif',
          letterSpacing: -0.5,
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            opacity: subtitleOpacity,
            fontSize: 22,
            color: COLORS.textSecondary,
            fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
            marginTop: 8,
            fontWeight: 400,
            letterSpacing: 0.2,
          }}
        >
          {subtitle}
        </div>
      )}
    </div>
  );
};
