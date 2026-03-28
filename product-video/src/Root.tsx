import React from 'react';
import { Composition } from 'remotion';
import { ClipMindDemo } from './Video';
import { FPS, WIDTH, HEIGHT, SCENES } from './constants';

const TRANSITION_DURATION = 18;
const NUM_TRANSITIONS = SCENES.length - 1;
const totalDuration =
  SCENES.reduce((sum, s) => sum + s.durationInFrames, 0) -
  NUM_TRANSITIONS * TRANSITION_DURATION;

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="ClipMindDemo"
      component={ClipMindDemo}
      durationInFrames={totalDuration}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
    />
  );
};
