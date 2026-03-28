import type { TimelineClipItem } from './api';

export interface TimelineClipSegment {
  clip: TimelineClipItem;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export function getClipDuration(clip: TimelineClipItem): number {
  return Math.max(0, clip.source_end - clip.source_start);
}

export function buildTimelineClipSegments(
  clips: TimelineClipItem[]
): TimelineClipSegment[] {
  let cursor = 0;

  return clips.map((clip, index) => {
    const duration = getClipDuration(clip);
    const segment: TimelineClipSegment = {
      clip,
      index,
      startTime: cursor,
      endTime: cursor + duration,
      duration,
    };
    cursor += duration;
    return segment;
  });
}

export function getTimelineDuration(
  totalDuration: number,
  segments: TimelineClipSegment[]
): number {
  const computedDuration =
    segments.length > 0 ? segments[segments.length - 1].endTime : 0;

  return Math.max(0, totalDuration, computedDuration);
}

export function clampTimelineTime(time: number, totalDuration: number): number {
  if (!Number.isFinite(time) || !Number.isFinite(totalDuration) || totalDuration <= 0) {
    return 0;
  }

  return Math.min(totalDuration, Math.max(0, time));
}

export function findClipSegmentAtTime(
  segments: TimelineClipSegment[],
  time: number
): TimelineClipSegment | null {
  if (segments.length === 0) {
    return null;
  }

  const clampedTime = Math.max(0, time);

  for (const segment of segments) {
    if (clampedTime >= segment.startTime && clampedTime < segment.endTime) {
      return segment;
    }
  }

  if (clampedTime <= 0) {
    return segments[0];
  }

  return segments[segments.length - 1];
}

export function findClipIndexAtTime(
  segments: TimelineClipSegment[],
  time: number
): number {
  return findClipSegmentAtTime(segments, time)?.index ?? 0;
}
