import {
  AbsoluteFill,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from 'remotion';
import { TransitionSeries, springTiming, linearTiming } from '@remotion/transitions';
import { slide } from '@remotion/transitions/slide';
import { fade } from '@remotion/transitions/fade';
import { HookScene } from './scenes/HookScene';
import { IntroScene } from './scenes/IntroScene';
import { ImportScene } from './scenes/ImportScene';
import { MapScene } from './scenes/MapScene';
import { AnalysisScene } from './scenes/AnalysisScene';
import { StabilityScene } from './scenes/StabilityScene';
import { SmartClipsScene } from './scenes/SmartClipsScene';
import { ClaudeCLIScene } from './scenes/ClaudeCLIScene';
import { TimelineScene } from './scenes/TimelineScene';
import { MusicScene } from './scenes/MusicScene';
import { ExportScene } from './scenes/ExportScene';
import { OutroScene } from './scenes/OutroScene';
import { SCENES, FPS, COLORS } from './constants';

const sceneComponents = [
  HookScene,       // 0: Hook
  IntroScene,      // 1: Logo
  ImportScene,     // 2: Import
  MapScene,        // 3: Map
  AnalysisScene,   // 4: Analysis
  StabilityScene,  // 5: Stability
  SmartClipsScene, // 6: SmartClips
  ClaudeCLIScene,  // 7: Claude CLI
  TimelineScene,   // 8: Timeline
  MusicScene,      // 9: Music
  ExportScene,     // 10: Export
  OutroScene,      // 11: Outro
];

/**
 * Transition config per gap: alternate between fade and slide-push.
 * 'fade' for text-heavy → screen or screen → text-heavy transitions.
 * 'slide' for screen → screen transitions.
 */
type TransitionType =
  | { kind: 'fade' }
  | { kind: 'slide'; direction: 'from-left' | 'from-right' };

const TRANSITIONS: TransitionType[] = [
  { kind: 'fade' },                          // Hook → Intro
  { kind: 'fade' },                          // Intro → Import
  { kind: 'slide', direction: 'from-right' }, // Import → Map
  { kind: 'slide', direction: 'from-left' },  // Map → Analysis
  { kind: 'slide', direction: 'from-right' }, // Analysis → Stability
  { kind: 'slide', direction: 'from-left' },  // Stability → SmartClips
  { kind: 'fade' },                          // SmartClips → ClaudeCLI
  { kind: 'fade' },                          // ClaudeCLI → Timeline
  { kind: 'slide', direction: 'from-left' },  // Timeline → Music
  { kind: 'fade' },                          // Music → Export
  { kind: 'fade' },                          // Export → Outro
];

const TRANSITION_DURATION = 18; // frames (~0.6s)

export const ClipMindDemo: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Background music volume
  const volume = (f: number) => {
    const fadeIn = interpolate(f, [0, FPS * 2], [0, 0.35], {
      extrapolateRight: 'clamp',
    });
    const fadeOut = interpolate(
      f,
      [durationInFrames - FPS * 3, durationInFrames],
      [0.35, 0],
      { extrapolateLeft: 'clamp' },
    );
    return Math.min(fadeIn, fadeOut);
  };

  const progress = (frame / durationInFrames) * 100;

  // Build transition series
  const elements: React.ReactNode[] = [];
  sceneComponents.forEach((Scene, i) => {
    elements.push(
      <TransitionSeries.Sequence
        key={`scene-${i}`}
        durationInFrames={SCENES[i].durationInFrames}
      >
        <Scene />
      </TransitionSeries.Sequence>,
    );

    if (i < sceneComponents.length - 1) {
      const t = TRANSITIONS[i];
      const presentation =
        t.kind === 'fade'
          ? fade()
          : slide({ direction: t.direction });
      const timing =
        t.kind === 'fade'
          ? linearTiming({ durationInFrames: TRANSITION_DURATION })
          : springTiming({
              config: { damping: 22, stiffness: 90 },
              durationInFrames: TRANSITION_DURATION,
            });

      elements.push(
        <TransitionSeries.Transition
          key={`trans-${i}`}
          presentation={presentation}
          timing={timing}
        />,
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg }}>
      <TransitionSeries>
        {elements}
      </TransitionSeries>
      <Audio src={staticFile('music/background.mp3')} volume={volume} />
      {/* Subtle progress bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: '100%',
          height: 2,
          background: 'rgba(0,0,0,0.06)',
          zIndex: 10,
        }}
      >
        <div
          style={{
            width: `${progress}%`,
            height: '100%',
            background: COLORS.accent,
            opacity: 0.6,
          }}
        />
      </div>
    </AbsoluteFill>
  );
};
