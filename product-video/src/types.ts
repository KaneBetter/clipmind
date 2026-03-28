export interface SceneConfig {
  name: string;
  durationInFrames: number;
  screenshots: string[];
  title: string;
  subtitle: string;
  zoomRegions?: ZoomRegionConfig[];
}

export interface ZoomRegionConfig {
  x: number; // 0-1 relative
  y: number; // 0-1 relative
  width: number; // 0-1 relative
  height: number; // 0-1 relative
  startFrame: number; // relative to scene start
  durationInFrames: number;
}

export interface CursorWaypoint {
  x: number; // 0-1 relative
  y: number; // 0-1 relative
  frame: number; // relative to scene start
  click?: boolean;
}
