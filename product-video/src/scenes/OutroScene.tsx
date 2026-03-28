import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS } from '../constants';

export const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const subtitleOpacity = interpolate(frame, [30, 50], [0, 1], clamp);
  const badgeOpacity = interpolate(frame, [50, 70], [0, 1], clamp);
  const badgeY = interpolate(frame, [50, 70], [12, 0], clamp);
  const techOpacity = interpolate(frame, [70, 85], [0, 1], clamp);
  const fadeOut = interpolate(frame, [110, 150], [1, 0], clamp);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
      }}
    >
      <div
        style={{
          transform: `scale(${titleScale})`,
          fontSize: 80,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: '"SF Pro Display", -apple-system, sans-serif',
          letterSpacing: -2,
        }}
      >
        ClipMind
      </div>

      <div
        style={{
          opacity: subtitleOpacity,
          fontSize: 22,
          color: COLORS.textSecondary,
          fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
          marginTop: 14,
        }}
      >
        开始你的 AI 视频创作
      </div>

      <div
        style={{
          opacity: badgeOpacity,
          transform: `translateY(${badgeY}px)`,
          marginTop: 28,
          padding: '8px 22px',
          borderRadius: 20,
          background: COLORS.accent,
          color: COLORS.white,
          fontSize: 16,
          fontWeight: 600,
          fontFamily: '"SF Pro Text", -apple-system, sans-serif',
        }}
      >
        Built with AI
      </div>

      <div
        style={{
          opacity: techOpacity,
          marginTop: 16,
          color: COLORS.textTertiary,
          fontSize: 15,
          fontFamily: '"SF Mono", ui-monospace, monospace',
        }}
      >
        FastAPI + Next.js + Claude CLI
      </div>
    </div>
  );
};
