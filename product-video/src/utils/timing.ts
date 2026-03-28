import { FPS, SCENES } from '../constants';
import type { SceneConfig } from '../types';

/** Convert seconds to frames at the project's FPS. */
export function secondsToFrames(seconds: number): number {
  return Math.round(seconds * FPS);
}

/** Convert frames to seconds at the project's FPS. */
export function framesToSeconds(frames: number): number {
  return frames / FPS;
}

/**
 * Get the cumulative start frame for a scene by its index.
 * Scene 0 starts at frame 0, scene 1 starts after scene 0's duration, etc.
 */
export function getSceneStart(sceneIndex: number): number {
  return SCENES.slice(0, sceneIndex).reduce(
    (sum, scene) => sum + scene.durationInFrames,
    0,
  );
}

/**
 * Get the start and end frame range for a scene.
 */
export function getSceneRange(sceneIndex: number): {
  start: number;
  end: number;
  scene: SceneConfig;
} {
  const start = getSceneStart(sceneIndex);
  const scene = SCENES[sceneIndex];
  return {
    start,
    end: start + scene.durationInFrames,
    scene,
  };
}

/**
 * Find which scene is active at a given absolute frame.
 * Returns the scene index and the local frame within that scene.
 */
export function getActiveScene(absoluteFrame: number): {
  index: number;
  localFrame: number;
  scene: SceneConfig;
} {
  let accumulated = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    if (absoluteFrame < accumulated + scene.durationInFrames) {
      return {
        index: i,
        localFrame: absoluteFrame - accumulated,
        scene,
      };
    }
    accumulated += scene.durationInFrames;
  }

  // Past the end — return last scene
  const lastIndex = SCENES.length - 1;
  const lastScene = SCENES[lastIndex];
  return {
    index: lastIndex,
    localFrame: lastScene.durationInFrames,
    scene: lastScene,
  };
}
