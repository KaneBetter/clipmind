import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { VideoFrame } from '../components/VideoFrame';
import { TextOverlay } from '../components/TextOverlay';
import { COLORS } from '../constants';

export const AnalysisScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
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
          src="recordings/analysis.webm"
          url="http://localhost:3000/projects/1/analysis"
        />
      </div>
      <TextOverlay
        title="AI 场景分析"
        subtitle="Gemini 驱动 · 场景识别 · 质量评分 · 情绪标注"
        startFrame={10}
      />
    </div>
  );
};
