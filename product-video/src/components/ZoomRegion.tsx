import React from 'react';
import { useCurrentFrame, interpolate, Img } from 'remotion';

interface ZoomRegionProps {
  src: string;
  region: { x: number; y: number; width: number; height: number };
  startFrame: number;
  durationInFrames: number;
}

export const ZoomRegion: React.FC<ZoomRegionProps> = ({
  src,
  region,
  startFrame,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const endFrame = startFrame + durationInFrames;
  const scale = interpolate(
    frame,
    [startFrame, startFrame + 30, endFrame - 30, endFrame],
    [1, 1 / region.width, 1 / region.width, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const tx = interpolate(
    frame,
    [startFrame, startFrame + 30, endFrame - 30, endFrame],
    [0, -region.x * 100, -region.x * 100, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );
  const ty = interpolate(
    frame,
    [startFrame, startFrame + 30, endFrame - 30, endFrame],
    [0, -region.y * 100, -region.y * 100, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
  );

  return (
    <div style={{ overflow: 'hidden', width: '100%', height: '100%' }}>
      <Img
        src={src}
        style={{
          width: '100%',
          transform: `scale(${scale}) translate(${tx}%, ${ty}%)`,
          transformOrigin: 'top left',
        }}
      />
    </div>
  );
};
