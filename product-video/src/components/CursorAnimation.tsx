import React from 'react';
import { useCurrentFrame, useVideoConfig, interpolate, Easing } from 'remotion';
import type { CursorWaypoint } from '../types';
import { COLORS } from '../constants';

interface CursorAnimationProps {
  waypoints: CursorWaypoint[];
}

export const CursorAnimation: React.FC<CursorAnimationProps> = ({
  waypoints,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  if (waypoints.length === 0) return null;

  // Find the two surrounding waypoints for interpolation
  const currentIdx = waypoints.findIndex((wp) => wp.frame > frame);
  const fromIdx = currentIdx <= 0 ? 0 : currentIdx - 1;
  const toIdx = currentIdx < 0 ? waypoints.length - 1 : currentIdx;

  const from = waypoints[fromIdx];
  const to = waypoints[toIdx];

  const x =
    fromIdx === toIdx
      ? from.x * width
      : interpolate(frame, [from.frame, to.frame], [from.x * width, to.x * width], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.inOut(Easing.ease),
        });

  const y =
    fromIdx === toIdx
      ? from.y * height
      : interpolate(frame, [from.frame, to.frame], [from.y * height, to.y * height], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.inOut(Easing.ease),
        });

  // Check if we're near a click waypoint
  const clickWaypoint = waypoints.find(
    (wp) => wp.click && Math.abs(frame - wp.frame) < 10,
  );

  const clickScale = clickWaypoint
    ? interpolate(
        Math.abs(frame - clickWaypoint.frame),
        [0, 5, 10],
        [1.5, 0.8, 0],
        { extrapolateRight: 'clamp' },
      )
    : 0;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 20 }}>
      {/* Cursor arrow */}
      <svg
        width={24}
        height={28}
        viewBox="0 0 24 28"
        style={{
          position: 'absolute',
          left: x,
          top: y,
          filter: 'drop-shadow(1px 2px 3px rgba(0,0,0,0.5))',
        }}
      >
        <path
          d="M2 2 L2 22 L8 16 L14 26 L18 24 L12 14 L20 14 Z"
          fill={COLORS.white}
          stroke={COLORS.bg}
          strokeWidth={1.5}
        />
      </svg>
      {/* Click pulse */}
      {clickScale > 0 && (
        <div
          style={{
            position: 'absolute',
            left: x - 15,
            top: y - 15,
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `2px solid ${COLORS.accent}`,
            opacity: clickScale * 0.6,
            transform: `scale(${1 + clickScale})`,
          }}
        />
      )}
    </div>
  );
};
