import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { VideoFrame } from '../components/VideoFrame';
import { TextOverlay } from '../components/TextOverlay';
import { COLORS } from '../constants';

export const MusicScene: React.FC = () => {
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
          src="recordings/music.webm"
          url="http://localhost:3000/projects/1/music"
        />
      </div>
      <TextOverlay
        title="音乐节拍分析"
        subtitle="BPM 检测 · 节拍对齐 · 音画同步"
        startFrame={10}
      />
    </div>
  );
};
