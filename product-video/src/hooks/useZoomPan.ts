import { useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const useZoomPan = (
  zoomFrom = 1,
  zoomTo = 1.08,
  panX = -1,
  panY = -0.5,
): { transform: string } => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const scale = interpolate(frame, [0, durationInFrames], [zoomFrom, zoomTo], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const tx = interpolate(frame, [0, durationInFrames], [0, panX], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const ty = interpolate(frame, [0, durationInFrames], [0, panY], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return { transform: `scale(${scale}) translate(${tx}%, ${ty}%)` };
};
