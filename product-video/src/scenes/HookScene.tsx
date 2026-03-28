import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';

export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const line1Opacity = interpolate(frame, [5, 20], [0, 1], clamp);
  const line1Y = interpolate(frame, [5, 20], [24, 0], clamp);

  const line2Opacity = interpolate(frame, [30, 48], [0, 1], clamp);
  const line2Y = interpolate(frame, [30, 48], [18, 0], clamp);

  const fadeOut = interpolate(frame, [70, 90], [1, 0], clamp);

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
          opacity: line1Opacity,
          transform: `translateY(${line1Y}px)`,
          fontSize: 44,
          fontWeight: 400,
          color: COLORS.textSecondary,
          fontFamily: '"SF Pro Display", "PingFang SC", -apple-system, sans-serif',
          textAlign: 'center',
          letterSpacing: -0.3,
        }}
      >
        100+ 小时的旅行素材
      </div>

      <div
        style={{
          opacity: line2Opacity,
          transform: `translateY(${line2Y}px)`,
          fontSize: 56,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: '"SF Pro Display", "PingFang SC", -apple-system, sans-serif',
          marginTop: 20,
          textAlign: 'center',
          letterSpacing: -0.5,
        }}
      >
        如何变成
        <span style={{ color: COLORS.accent }}>精彩视频</span>
        ？
      </div>
    </div>
  );
};
