import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';
import { COLORS } from '../constants';

export const IntroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 14, stiffness: 80 } });
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const taglineOpacity = interpolate(frame, [30, 50], [0, 1], clamp);
  const taglineY = interpolate(frame, [30, 50], [14, 0], clamp);

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
      }}
    >
      <div
        style={{
          transform: `scale(${titleScale})`,
          fontSize: 88,
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
          opacity: taglineOpacity,
          transform: `translateY(${taglineY}px)`,
          fontSize: 24,
          color: COLORS.textSecondary,
          fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
          marginTop: 12,
          fontWeight: 400,
        }}
      >
        AI 驱动的视频编辑助手
      </div>
    </div>
  );
};
