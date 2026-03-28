import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { VideoFrame } from '../components/VideoFrame';
import { TextOverlay } from '../components/TextOverlay';
import { COLORS } from '../constants';

export const ImportScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  // Fade in the video frame
  const fadeIn = interpolate(frame, [0, 15], [0, 1], clamp);

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
          src="recordings/dashboard.webm"
          url="http://localhost:3000/projects/1"
        />
      </div>
      <TextOverlay
        title="智能导入"
        subtitle="一键导入 · GPS 自动聚类 · AI 元数据提取"
        startFrame={10}
      />
    </div>
  );
};
