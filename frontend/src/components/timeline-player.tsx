'use client';

import {
  useState,
  useRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Maximize2,
  Film,
  Clock3,
  Music,
  Captions,
} from 'lucide-react';
import {
  mediaStreamUrl,
  musicStreamUrl,
  type TimelineDetail,
  type TimelineMusicItem,
} from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import {
  buildTimelineClipSegments,
  clampTimelineTime,
  findClipIndexAtTime,
  getTimelineDuration,
} from '@/lib/timeline';

const MEDIA_END_EPSILON = 0.04;
const AUDIO_SYNC_TOLERANCE = 0.35;

export interface TimelinePlayerHandle {
  seekToTime: (time: number) => void;
  seekToClip: (index: number) => void;
  getPosition: () => number;
}

interface TimelinePlayerProps {
  detail: TimelineDetail;
  onPositionChange?: (pos: number) => void;
  compact?: boolean;
}

const TimelinePlayer = forwardRef<TimelinePlayerHandle, TimelinePlayerProps>(
  function TimelinePlayer({ detail, onPositionChange, compact = false }, ref) {
    const { t } = useI18n();
    const [currentClipIndex, setCurrentClipIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [timelinePosition, setTimelinePosition] = useState(0);
    const [musicMuted, setMusicMuted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const stageRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const preloadRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const animFrameRef = useRef<number>(0);
    const pendingSeekTimeRef = useRef<number | null>(null);
    const isPlayingRef = useRef(false);

    const clips = detail.clips;
    const clipSegments = useMemo(
      () => buildTimelineClipSegments(clips),
      [clips]
    );
    const totalDuration = useMemo(
      () => getTimelineDuration(detail.total_duration, clipSegments),
      [detail.total_duration, clipSegments]
    );

    const currentClip = clips[currentClipIndex] ?? null;
    const currentClipSegment = clipSegments[currentClipIndex] ?? null;
    const currentSubtitle = useMemo(
      () =>
        detail.subtitles.find(
          (subtitle) =>
            timelinePosition >= subtitle.start_time &&
            timelinePosition < subtitle.end_time
        ) ?? null,
      [detail.subtitles, timelinePosition]
    );
    const activeMusicTrack = useMemo(
      () =>
        detail.music.find(
          (track) =>
            timelinePosition >= track.start_time &&
            timelinePosition < track.end_time
        ) ?? null,
      [detail.music, timelinePosition]
    );

    const updateTimelinePosition = useCallback(
      (time: number) => {
        const clampedTime = clampTimelineTime(time, totalDuration);
        const clipIndex = findClipIndexAtTime(clipSegments, clampedTime);
        setTimelinePosition(clampedTime);
        setCurrentClipIndex((prev) => (prev === clipIndex ? prev : clipIndex));
        onPositionChange?.(clampedTime);
        return { clipIndex, clampedTime };
      },
      [clipSegments, onPositionChange, totalDuration]
    );

    const seekToTime = useCallback(
      (time: number) => {
        if (clipSegments.length === 0) {
          return;
        }

        const { clipIndex, clampedTime } = updateTimelinePosition(time);
        pendingSeekTimeRef.current = clampedTime;

        const segment = clipSegments[clipIndex];
        const clip = clips[clipIndex];
        const video = videoRef.current;

        if (!segment || !clip || !video) {
          return;
        }

        const nextSrc = mediaStreamUrl(clip.video_id);
        const targetVideoTime = Math.min(
          clip.source_end,
          clip.source_start + Math.max(0, clampedTime - segment.startTime)
        );

        if (video.src === nextSrc) {
          video.currentTime = targetVideoTime;
          pendingSeekTimeRef.current = null;
          if (isPlayingRef.current) {
            video.play().catch(() => {
              setIsPlaying(false);
            });
          }
        }
      },
      [clipSegments, clips, updateTimelinePosition]
    );

    const seekToClip = useCallback(
      (index: number) => {
        const segment = clipSegments[index];
        if (!segment) {
          return;
        }
        seekToTime(segment.startTime);
      },
      [clipSegments, seekToTime]
    );

    const togglePlayback = useCallback(() => {
      if (!clips.length) {
        return;
      }

      setIsPlaying((prev) => {
        const next = !prev;
        if (!next && videoRef.current) {
          videoRef.current.pause();
        }
        return next;
      });
    }, [clips.length]);

    useImperativeHandle(
      ref,
      () => ({
        seekToTime,
        seekToClip,
        getPosition: () => timelinePosition,
      }),
      [seekToClip, seekToTime, timelinePosition]
    );

    useEffect(() => {
      isPlayingRef.current = isPlaying;
    }, [isPlaying]);

    useEffect(() => {
      cancelAnimationFrame(animFrameRef.current);
      pendingSeekTimeRef.current = 0;
      setCurrentClipIndex(0);
      setTimelinePosition(0);
      setIsPlaying(false);
      setIsLoading(false);
      onPositionChange?.(0);

      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute('src');
        videoRef.current.load();
      }

      if (preloadRef.current) {
        preloadRef.current.removeAttribute('src');
        preloadRef.current.load();
      }

      if (audioRef.current) {
        audioRef.current.pause();
      }
    }, [detail.id, onPositionChange]);

    useEffect(() => {
      const video = videoRef.current;
      const clip = currentClip;
      const segment = currentClipSegment;

      if (!video || !clip || !segment) {
        setIsLoading(false);
        return;
      }

      const nextSrc = mediaStreamUrl(clip.video_id);
      const targetTime = pendingSeekTimeRef.current ?? segment.startTime;
      const targetVideoTime = Math.min(
        clip.source_end,
        clip.source_start + Math.max(0, targetTime - segment.startTime)
      );

      const applyPlaybackTime = () => {
        video.currentTime = targetVideoTime;
        setIsLoading(false);
        pendingSeekTimeRef.current = null;

        if (isPlayingRef.current) {
          video.play().catch(() => {
            setIsPlaying(false);
          });
        }
      };

      if (video.src === nextSrc) {
        applyPlaybackTime();
      } else {
        setIsLoading(true);
        video.pause();
        video.src = nextSrc;
        video.load();

        const onCanPlay = () => {
          applyPlaybackTime();
          video.removeEventListener('canplay', onCanPlay);
        };

        video.addEventListener('canplay', onCanPlay);

        const nextClip = clips[currentClipIndex + 1];
        if (nextClip && preloadRef.current) {
          const preloadSrc = mediaStreamUrl(nextClip.video_id);
          if (preloadRef.current.src !== preloadSrc) {
            preloadRef.current.src = preloadSrc;
            preloadRef.current.load();
          }
        }

        return () => {
          video.removeEventListener('canplay', onCanPlay);
        };
      }
    }, [clips, currentClip, currentClipIndex, currentClipSegment]);

    useEffect(() => {
      if (!isPlaying) {
        return;
      }

      const video = videoRef.current;
      if (!video) {
        return;
      }

      video.play().catch(() => {
        setIsPlaying(false);
      });
    }, [currentClipIndex, isPlaying]);

    const tick = useEffectEvent(function tickFrame() {
      const video = videoRef.current;
      const clip = currentClip;
      const segment = currentClipSegment;

      if (!video || !clip || !segment) {
        return;
      }

      const rawTime =
        segment.startTime + Math.max(0, video.currentTime - clip.source_start);
      const nextTimelineTime = Math.min(segment.endTime, rawTime);

      setTimelinePosition(nextTimelineTime);
      onPositionChange?.(nextTimelineTime);

      const clipEnded =
        nextTimelineTime >= segment.endTime - MEDIA_END_EPSILON ||
        video.currentTime >= clip.source_end - MEDIA_END_EPSILON;

      if (clipEnded) {
        if (currentClipIndex < clipSegments.length - 1) {
          const nextSegment = clipSegments[currentClipIndex + 1];
          pendingSeekTimeRef.current = nextSegment.startTime;
          setCurrentClipIndex(currentClipIndex + 1);
          setTimelinePosition(nextSegment.startTime);
          onPositionChange?.(nextSegment.startTime);
        } else {
          const endTime = totalDuration;
          setTimelinePosition(endTime);
          onPositionChange?.(endTime);
          setIsPlaying(false);
          video.pause();
          return;
        }
      }

      if (isPlayingRef.current) {
        animFrameRef.current = requestAnimationFrame(tickFrame);
      }
    });

    useEffect(() => {
      if (isPlaying) {
        animFrameRef.current = requestAnimationFrame(tick);
      }

      return () => {
        cancelAnimationFrame(animFrameRef.current);
      };
    }, [currentClip, currentClipIndex, currentClipSegment, isPlaying, onPositionChange, totalDuration]);

    useEffect(() => {
      const audio = audioRef.current;

      if (!audio || !activeMusicTrack || !isPlaying) {
        audio?.pause();
        return;
      }

      const nextSrc = musicStreamUrl(activeMusicTrack.music_id);
      if (audio.src !== nextSrc) {
        audio.src = nextSrc;
        audio.load();
      }

      const targetMusicTime = Math.max(
        0,
        timelinePosition - activeMusicTrack.start_time
      );

      if (Math.abs(audio.currentTime - targetMusicTime) > AUDIO_SYNC_TOLERANCE) {
        audio.currentTime = targetMusicTime;
      }

      audio.play().catch(() => {
        /* ignore autoplay failures */
      });
    }, [activeMusicTrack, isPlaying, timelinePosition]);

    useEffect(() => {
      const audio = audioRef.current;
      if (!audio) {
        return;
      }

      audio.volume = getMusicVolume(activeMusicTrack, timelinePosition, musicMuted);
    }, [activeMusicTrack, musicMuted, timelinePosition]);

    useEffect(() => {
      const handleKeyDown = (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        const tagName = target?.tagName;

        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') {
          return;
        }

        if (event.code === 'Space') {
          event.preventDefault();
          togglePlayback();
        }

        if (event.code === 'ArrowLeft') {
          event.preventDefault();
          seekToTime(timelinePosition - 5);
        }

        if (event.code === 'ArrowRight') {
          event.preventDefault();
          seekToTime(timelinePosition + 5);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }, [seekToTime, timelinePosition, togglePlayback]);

    const handlePrevClip = useCallback(() => {
      if (currentClipIndex <= 0) {
        seekToTime(0);
        return;
      }
      seekToClip(currentClipIndex - 1);
    }, [currentClipIndex, seekToClip, seekToTime]);

    const handleNextClip = useCallback(() => {
      if (currentClipIndex >= clipSegments.length - 1) {
        seekToTime(totalDuration);
        return;
      }
      seekToClip(currentClipIndex + 1);
    }, [clipSegments.length, currentClipIndex, seekToClip, seekToTime, totalDuration]);

    const handleFullscreen = useCallback(() => {
      stageRef.current?.requestFullscreen?.();
    }, []);

    if (!clips.length) {
      return (
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div className="max-w-sm">
              <Film className="mx-auto mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" />
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t('timeline.noClips')}
              </h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                {t('timeline.noClipsDesc')}
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className={`flex flex-col ${compact ? 'h-full' : 'rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden'} bg-white dark:border-slate-800 dark:bg-slate-900`}>
        <div className={`min-h-0 flex-1 overflow-hidden bg-slate-950 ${compact ? '' : 'px-3 pt-3'}`}>
          <div
            ref={stageRef}
            className={`relative aspect-video w-full overflow-hidden bg-black ${compact ? '' : 'rounded-xl'}`}
          >
            <video
              ref={videoRef}
              className="h-full w-full object-cover"
              playsInline
              preload="auto"
            />
            <video ref={preloadRef} className="hidden" muted preload="auto" />

            <div className="pointer-events-none absolute inset-x-0 top-0 h-14 bg-gradient-to-b from-black/32 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/58 via-black/8 to-transparent" />

            <div className="absolute left-3 top-3 flex flex-wrap items-center gap-1.5">
              <StageChip icon={<Clock3 className="h-3.5 w-3.5" />}>
                {formatDuration(timelinePosition)} / {formatDuration(totalDuration)}
              </StageChip>
            </div>

            <div className="absolute right-3 top-3 flex items-center gap-1.5">
              <StageChip>{`#${currentClipIndex + 1}/${clips.length}`}</StageChip>
            </div>

            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <div className="h-9 w-9 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              </div>
            )}

            {currentSubtitle?.text && (
              <div className="pointer-events-none absolute inset-x-0 bottom-6 flex justify-center px-4">
                <div className="max-w-3xl rounded-xl border border-white/10 bg-black/72 px-4 py-1.5 text-center text-sm leading-relaxed text-white shadow-lg backdrop-blur md:text-base">
                  {currentSubtitle.text}
                </div>
              </div>
            )}

            {!isPlaying && !isLoading && (
              <button
                type="button"
                onClick={togglePlayback}
                className="absolute inset-0 flex items-center justify-center bg-black/5 transition-colors hover:bg-black/15"
                aria-label={t('timeline.play')}
              >
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/20 bg-white/92 shadow-2xl backdrop-blur">
                  <Play className="ml-1 h-7 w-7 text-slate-900" />
                </div>
              </button>
            )}
          </div>
        </div>

        <div className={`shrink-0 border-t border-slate-200/80 bg-white text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100 ${compact ? 'px-2 py-1.5' : 'px-3 py-2.5'}`}>
          <div className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2 sm:gap-3'}`}>
            <ControlButton
              label={t('timeline.previousClip')}
              onClick={handlePrevClip}
            >
              <SkipBack className="h-4 w-4" />
            </ControlButton>
            <ControlButton
              primary
              label={isPlaying ? t('timeline.pause') : t('timeline.play')}
              onClick={togglePlayback}
            >
              {isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </ControlButton>
            <ControlButton
              label={t('timeline.nextClip')}
              onClick={handleNextClip}
            >
              <SkipForward className="h-4 w-4" />
            </ControlButton>

            <div className="min-w-[112px] text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
              {formatDuration(timelinePosition)}
              <span className="mx-1 text-slate-400 dark:text-slate-500">/</span>
              <span className="text-slate-500 dark:text-slate-400">{formatDuration(totalDuration)}</span>
            </div>

            <input
              type="range"
              min={0}
              max={Math.max(totalDuration, 0)}
              step={0.01}
              value={timelinePosition}
              onChange={(event) => seekToTime(Number(event.target.value))}
              className="h-1.5 min-w-[180px] flex-1 rounded-full accent-sky-500"
              aria-label={t('timeline.transport')}
            />

            <ControlButton
              label={musicMuted ? t('timeline.unmuteMusic') : t('timeline.muteMusic')}
              onClick={() => setMusicMuted((prev) => !prev)}
            >
              {musicMuted ? (
                <VolumeX className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </ControlButton>
            <ControlButton
              label={t('timeline.fullscreen')}
              onClick={handleFullscreen}
            >
              <Maximize2 className="h-4 w-4" />
            </ControlButton>
          </div>

          {!compact && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <InlineMeta
                icon={<Film className="h-3.5 w-3.5" />}
                label={currentClip?.filename?.replace(/\.[^.]+$/, '') || `#${currentClip?.video_id ?? '-'}`}
                value={`${formatDuration(currentClipSegment?.startTime ?? 0)} - ${formatDuration(currentClipSegment?.endTime ?? 0)}`}
              />
              <InlineMeta
                icon={<Captions className="h-3.5 w-3.5" />}
                label={currentSubtitle?.text || t('timeline.noActiveSubtitle')}
                value={
                  currentSubtitle
                    ? `${formatDuration(currentSubtitle.start_time)} - ${formatDuration(currentSubtitle.end_time)}`
                    : t('timeline.standby')
                }
              />
              {activeMusicTrack && (
                <InlineMeta
                  icon={<Music className="h-3.5 w-3.5" />}
                  label={activeMusicTrack.title || t('timeline.noActiveMusic')}
                  value={`${formatDuration(activeMusicTrack.start_time)} - ${formatDuration(activeMusicTrack.end_time)}`}
                />
              )}
            </div>
          )}
        </div>

        <audio ref={audioRef} preload="auto" />
      </div>
    );
  }
);

function ControlButton({
  children,
  label,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-colors ${
        primary
          ? 'border-sky-500 bg-sky-500 text-white hover:bg-sky-600'
          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-sky-300 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:text-sky-300'
      }`}
    >
      {children}
    </button>
  );
}

function StageChip({
  children,
  icon,
}: {
  children: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] font-medium text-white/90 backdrop-blur">
      {icon}
      <span className="truncate">{children}</span>
    </div>
  );
}

function InlineMeta({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-1.5">
      <div className="text-slate-400 dark:text-slate-500">
        {icon}
      </div>
      <span className="max-w-[240px] truncate text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <span className="font-mono text-slate-400 dark:text-slate-500">{value}</span>
    </div>
  );
}

function getMusicVolume(
  musicTrack: TimelineMusicItem | null,
  timelinePosition: number,
  musicMuted: boolean
): number {
  if (!musicTrack || musicMuted) {
    return 0;
  }

  const baseVolume = Math.max(0, Math.min(1, musicTrack.volume ?? 0.7));
  const fadeIn = Math.max(0, musicTrack.fade_in || 0);
  const fadeOut = Math.max(0, musicTrack.fade_out || 0);

  if (fadeIn > 0 && timelinePosition < musicTrack.start_time + fadeIn) {
    const fadeProgress = (timelinePosition - musicTrack.start_time) / fadeIn;
    return Math.max(0, Math.min(baseVolume, fadeProgress * baseVolume));
  }

  if (fadeOut > 0 && timelinePosition > musicTrack.end_time - fadeOut) {
    const fadeProgress = (musicTrack.end_time - timelinePosition) / fadeOut;
    return Math.max(0, Math.min(baseVolume, fadeProgress * baseVolume));
  }

  return baseVolume;
}

export default TimelinePlayer;
