import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { VideoFrame } from '../components/VideoFrame';
import { TextOverlay } from '../components/TextOverlay';
import { COLORS } from '../constants';

export const SmartClipsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
  const fadeIn = interpolate(frame, [0, 15], [0, 1], clamp);

  // Extraction badge appears midway
  const badgeOpacity = interpolate(frame, [90, 105], [0, 1], clamp);
  const badgeScale = interpolate(frame, [90, 110], [0.9, 1], clamp);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn,
      }}
    >
      <div style={{ width: '92%' }}>
        <VideoFrame
          src="recordings/videos.webm"
          url="http://localhost:3000/projects/1/videos"
        >
          {/* Extraction badge overlay */}
          <div
            style={{
              position: 'absolute',
              top: 20,
              right: 20,
              opacity: badgeOpacity,
              transform: `scale(${badgeScale})`,
              background: `${COLORS.badge}e0`,
              borderRadius: 10,
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ fontSize: 20 }}>{'✂'}</span>
            <span
              style={{
                color: COLORS.white,
                fontSize: 16,
                fontWeight: 600,
                fontFamily: '"PingFang SC", Inter, sans-serif',
              }}
            >
              AI 提取最佳片段
            </span>
          </div>
        </VideoFrame>
      </div>
      <TextOverlay
        title="智能片段提取"
        subtitle="AI 分析 + 稳定性 = 最佳可用片段"
        startFrame={10}
      />
    </div>
  );
};
