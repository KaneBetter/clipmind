'use client';

import Link from 'next/link';
import {
  use,
  useState,
  useCallback,
  useRef,
  useMemo,
  type ReactNode,
} from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchVideos,
  fetchUsableSegments,
  fetchTimelines,
  fetchTimelineDetail,
  deleteTimeline,
  thumbnailUrl,
  type TimelineListItem,
  type TimelineClipItem,
  type TimelineDetail,
  type TimelineMusicItem,
  type TimelineSubtitleItem,
  type UsableSegmentsMap,
  type Video,
} from '@/lib/api';
import {
  Layers,
  Loader2,
  Film,
  Music,
  Clock3,
  MapPin,
  RefreshCw,
  Trash2,
  ZoomIn,
  ZoomOut,
  ChevronDown,
  Captions,
  ExternalLink,
  Sparkles,
  Star,
  Tag,
} from 'lucide-react';
import { formatDuration, moodEmoji, qualityColor } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';
import TimelinePlayer, { type TimelinePlayerHandle } from '@/components/timeline-player';
import {
  buildTimelineClipSegments,
  clampTimelineTime,
  findClipIndexAtTime,
  getTimelineDuration,
  type TimelineClipSegment,
} from '@/lib/timeline';

const MIN_PPS = 6;
const MAX_PPS = 72;
const DEFAULT_PPS = 14;
const MIN_CLIP_WIDTH = 36;
const TRACK_LABEL_WIDTH = 96;
const MIN_TIMELINE_WIDTH = 720;

export default function TimelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id, 10);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedTimelineId, setSelectedTimelineId] = useState<number | null>(null);
  const [playheadPos, setPlayheadPos] = useState(0);
  const [pps, setPps] = useState(DEFAULT_PPS);
  const playerRef = useRef<TimelinePlayerHandle>(null);

  const {
    data: timelines,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => fetchTimelines(projectId),
  });

  const effectiveSelectedTimelineId = useMemo(() => {
    if (!timelines || timelines.length === 0) {
      return null;
    }

    if (
      selectedTimelineId !== null &&
      timelines.some((timeline) => timeline.id === selectedTimelineId)
    ) {
      return selectedTimelineId;
    }

    return timelines[0].id;
  }, [selectedTimelineId, timelines]);

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['timeline-detail', projectId, effectiveSelectedTimelineId],
    queryFn: () => fetchTimelineDetail(projectId, effectiveSelectedTimelineId!),
    enabled: effectiveSelectedTimelineId !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: (timelineId: number) => deleteTimeline(timelineId),
    onSuccess: async (_, deletedId) => {
      if (selectedTimelineId === deletedId) {
        setSelectedTimelineId(null);
        setPlayheadPos(0);
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['timelines', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['timeline-detail', projectId] }),
      ]);
    },
  });

  const selectedTimelineSummary = useMemo(
    () =>
      timelines?.find((timeline) => timeline.id === effectiveSelectedTimelineId) ?? null,
    [effectiveSelectedTimelineId, timelines]
  );

  const clipSegments = useMemo(
    () => (detail ? buildTimelineClipSegments(detail.clips) : []),
    [detail]
  );
  const playbackDuration = useMemo(
    () => (detail ? getTimelineDuration(detail.total_duration, clipSegments) : 0),
    [clipSegments, detail]
  );
  const viewDuration = useMemo(() => {
    if (!detail) {
      return 0;
    }

    const subtitleEnd = detail.subtitles.reduce(
      (maxEnd, subtitle) => Math.max(maxEnd, subtitle.end_time),
      0
    );
    const musicEnd = detail.music.reduce(
      (maxEnd, track) => Math.max(maxEnd, track.end_time),
      0
    );

    return Math.max(playbackDuration, subtitleEnd, musicEnd);
  }, [detail, playbackDuration]);

  const activeClipIndex = useMemo(() => {
    if (!detail || clipSegments.length === 0) {
      return 0;
    }

    return findClipIndexAtTime(clipSegments, playheadPos);
  }, [clipSegments, detail, playheadPos]);

  const activeSubtitle = useMemo(
    () =>
      detail?.subtitles.find(
        (subtitle) =>
          playheadPos >= subtitle.start_time && playheadPos < subtitle.end_time
      ) ?? null,
    [detail, playheadPos]
  );
  const activeMusicTrack = useMemo(
    () =>
      detail?.music.find(
        (track) => playheadPos >= track.start_time && playheadPos < track.end_time
      ) ?? null,
    [detail, playheadPos]
  );
  const activeVideoId = detail?.clips[activeClipIndex]?.video_id ?? null;

  const { data: projectVideos, isLoading: projectVideosLoading } = useQuery({
    queryKey: ['videos', projectId, 'timeline-inspector'],
    queryFn: () =>
      fetchVideos(projectId, {
        page_size: 1000,
        show_hidden: true,
      }),
    enabled: Boolean(detail),
    staleTime: 5 * 60 * 1000,
  });

  const { data: usableSegmentsMap, isLoading: usableSegmentsLoading } = useQuery({
    queryKey: ['usable-segments', projectId, 'timeline-inspector'],
    queryFn: () => fetchUsableSegments(projectId),
    enabled: Boolean(detail),
    staleTime: 5 * 60 * 1000,
  });

  const timelineVideoEntries = useMemo(() => {
    if (!detail) {
      return [];
    }

    const videosById = new Map(
      (projectVideos?.items ?? []).map((video) => [video.id, video] as const)
    );
    const segmentsByVideoId = new Map<
      number,
      {
        firstClip: TimelineClipItem;
        clipCount: number;
        usedDuration: number;
        timelineRanges: Array<{ start: number; end: number }>;
      }
    >();

    clipSegments.forEach((segment) => {
      const existing = segmentsByVideoId.get(segment.clip.video_id);
      if (existing) {
        existing.clipCount += 1;
        existing.usedDuration += segment.duration;
        existing.timelineRanges.push({
          start: segment.startTime,
          end: segment.endTime,
        });
      } else {
        segmentsByVideoId.set(segment.clip.video_id, {
          firstClip: segment.clip,
          clipCount: 1,
          usedDuration: segment.duration,
          timelineRanges: [
            {
              start: segment.startTime,
              end: segment.endTime,
            },
          ],
        });
      }
    });

    return Array.from(segmentsByVideoId.entries())
      .map(([videoId, item]) => ({
        videoId,
        video: videosById.get(videoId) ?? null,
        stability: usableSegmentsMap?.[String(videoId)] ?? null,
        ...item,
      }))
      .sort((left, right) => left.firstClip.position - right.firstClip.position);
  }, [clipSegments, detail, projectVideos?.items, usableSegmentsMap]);

  const handlePositionChange = useCallback((pos: number) => {
    setPlayheadPos(pos);
  }, []);

  const handleClipClick = useCallback(
    (clipIndex: number) => {
      const segment = clipSegments[clipIndex];
      if (!segment) {
        return;
      }

      playerRef.current?.seekToTime(segment.startTime);
    },
    [clipSegments]
  );

  const handleTimelineClick = useCallback(
    (timePos: number) => {
      playerRef.current?.seekToTime(timePos);
    },
    []
  );

  const handleDelete = useCallback(() => {
    if (!effectiveSelectedTimelineId) {
      return;
    }

    if (confirm(t('timeline.deleteConfirm'))) {
      deleteMutation.mutate(effectiveSelectedTimelineId);
    }
  }, [deleteMutation, effectiveSelectedTimelineId, t]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (!timelines || timelines.length === 0) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.08),transparent_40%)] p-4">
        <div className="flex flex-1 items-center justify-center rounded-[28px] border border-slate-200/70 bg-white/90 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
          <div className="max-w-md px-6 text-center">
            <Layers className="mx-auto mb-4 h-12 w-12 text-slate-300 dark:text-slate-600" />
            <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
              {t('timeline.noTimelines')}
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              {t('timeline.noTimelinesDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 p-3 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="grid min-h-0 flex-1 gap-3 grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {detail ? (
          <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-black shadow-sm dark:border-slate-800">
            <TimelinePlayer
              detail={detail}
              ref={playerRef}
              onPositionChange={handlePositionChange}
              compact
            />
          </div>
        ) : (
          <LoadingSurface />
        )}

        <InfoPanel
          projectId={projectId}
          detail={detail}
          selectedTimelineSummary={selectedTimelineSummary}
          playbackDuration={playbackDuration}
          activeVideoId={activeVideoId}
          timelineVideoEntries={timelineVideoEntries}
          isVideoListLoading={projectVideosLoading || usableSegmentsLoading}
          isRefetching={isRefetching}
          isDeleting={deleteMutation.isPending}
          onDelete={handleDelete}
          onRefresh={() => {
            void refetch();
          }}
        />
      </div>

      <div className="mt-3 shrink-0">
        {detail ? (
          <TimelineWorkspace
            detail={detail}
            selectedTimelineId={effectiveSelectedTimelineId}
            timelines={timelines}
            clipSegments={clipSegments}
            playbackDuration={playbackDuration}
            viewDuration={viewDuration}
            pps={pps}
            playheadPos={playheadPos}
            activeClipIndex={activeClipIndex}
            activeSubtitle={activeSubtitle}
            activeMusicTrack={activeMusicTrack}
            onClipClick={handleClipClick}
            onTimeClick={handleTimelineClick}
            onZoomIn={() => setPps((prev) => Math.min(MAX_PPS, prev * 1.35))}
            onZoomOut={() => setPps((prev) => Math.max(MIN_PPS, prev / 1.35))}
            onZoomReset={() => setPps(DEFAULT_PPS)}
            onSelectTimeline={(timelineId) => {
              setSelectedTimelineId(timelineId);
              setPlayheadPos(0);
              setPps(DEFAULT_PPS);
            }}
          />
        ) : detailLoading ? (
          <LoadingSurface />
        ) : null}
      </div>
    </div>
  );
}

type TimelineVideoEntry = {
  videoId: number;
  video: Video | null;
  stability: UsableSegmentsMap[string] | null;
  firstClip: TimelineClipItem;
  clipCount: number;
  usedDuration: number;
  timelineRanges: Array<{ start: number; end: number }>;
};

function InfoPanel({
  projectId,
  detail,
  selectedTimelineSummary,
  playbackDuration,
  activeVideoId,
  timelineVideoEntries,
  isVideoListLoading,
  isRefetching,
  isDeleting,
  onDelete,
  onRefresh,
}: {
  projectId: number;
  detail: TimelineDetail | undefined;
  selectedTimelineSummary: TimelineListItem | null;
  playbackDuration: number;
  activeVideoId: number | null;
  timelineVideoEntries: TimelineVideoEntry[];
  isVideoListLoading: boolean;
  isRefetching: boolean;
  isDeleting: boolean;
  onDelete: () => void;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const activeStatus = detail?.status || selectedTimelineSummary?.status || 'draft';
  const activeLocation =
    detail?.location_cluster || selectedTimelineSummary?.location_cluster || null;
  const activeClipCount = detail?.clips.length ?? selectedTimelineSummary?.clip_count ?? 0;
  const activeSubtitleCount =
    detail?.subtitles.length ?? selectedTimelineSummary?.subtitle_count ?? 0;
  const activeMusicCount = detail?.music.length ?? selectedTimelineSummary?.music_count ?? 0;

  return (
    <aside className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="shrink-0 border-b border-slate-200/70 px-4 py-3 dark:border-slate-800">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {detail?.name || selectedTimelineSummary?.name || t('timeline.title')}
            </h2>
            <StatusBadge status={activeStatus} compact />
            {activeLocation && (
              <SurfacePill icon={<MapPin className="h-3 w-3" />}>
                {activeLocation}
              </SurfacePill>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <IconButton
              label={t('timeline.refresh')}
              onClick={onRefresh}
              loading={isRefetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? 'animate-spin' : ''}`} />
            </IconButton>
            <IconButton
              label={t('timeline.delete')}
              onClick={onDelete}
              loading={isDeleting}
              destructive
            >
              <Trash2 className="h-3.5 w-3.5" />
            </IconButton>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <span><span className="font-semibold text-slate-900 dark:text-slate-100">{activeClipCount}</span> {t('timeline.clips')}</span>
          <span><span className="font-semibold text-slate-900 dark:text-slate-100">{activeSubtitleCount}</span> {t('timeline.subtitles')}</span>
          <span><span className="font-semibold text-slate-900 dark:text-slate-100">{activeMusicCount}</span> {t('timeline.music')}</span>
          <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">{formatDuration(playbackDuration)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-200/70 px-4 py-2 dark:border-slate-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
          <Sparkles className="h-3.5 w-3.5 text-sky-500 dark:text-sky-300" />
          {t('timeline.videoList')}
        </div>
        <SurfacePill>{String(timelineVideoEntries.length)}</SurfacePill>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {isVideoListLoading ? (
          <div className="space-y-2">
            <VideoListSkeleton />
            <VideoListSkeleton />
            <VideoListSkeleton />
          </div>
        ) : timelineVideoEntries.length > 0 ? (
          <div className="space-y-2">
            {timelineVideoEntries.map((entry) => (
              <TimelineVideoListItem
                key={entry.videoId}
                entry={entry}
                projectId={projectId}
                isActive={activeVideoId === entry.videoId}
              />
            ))}
          </div>
        ) : (
          <EmptyPanelState label={t('timeline.noClipsDesc')} />
        )}
      </div>
    </aside>
  );
}

function TimelineWorkspace({
  detail,
  selectedTimelineId,
  timelines,
  clipSegments,
  playbackDuration,
  viewDuration,
  pps,
  playheadPos,
  activeClipIndex,
  activeSubtitle,
  activeMusicTrack,
  onClipClick,
  onTimeClick,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  onSelectTimeline,
}: {
  detail: TimelineDetail;
  selectedTimelineId: number | null;
  timelines: TimelineListItem[];
  clipSegments: TimelineClipSegment[];
  playbackDuration: number;
  viewDuration: number;
  pps: number;
  playheadPos: number;
  activeClipIndex: number;
  activeSubtitle: TimelineSubtitleItem | null;
  activeMusicTrack: TimelineMusicItem | null;
  onClipClick: (clipIndex: number) => void;
  onTimeClick: (timePos: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  onSelectTimeline: (timelineId: number) => void;
}) {
  const { t } = useI18n();
  const safeViewDuration = Math.max(1, viewDuration || playbackDuration || 1);
  const timelineWidth = Math.max(safeViewDuration * pps, MIN_TIMELINE_WIDTH);
  const playheadLeft =
    (clampTimelineTime(playheadPos, safeViewDuration) / safeViewDuration) * timelineWidth;
  const rulerInterval = getRulerInterval(pps);
  const rulerMarks = [];
  for (let mark = 0; mark <= safeViewDuration + 0.001; mark += rulerInterval) {
    rulerMarks.push(Number(mark.toFixed(2)));
  }

  const laneStyle = useMemo(
    () => ({
      width: timelineWidth,
      backgroundImage:
        'linear-gradient(to right, rgba(148,163,184,0.08) 1px, transparent 1px), linear-gradient(to right, rgba(148,163,184,0.18) 1px, transparent 1px)',
      backgroundSize: `${Math.max(pps, 24)}px 100%, ${Math.max(pps * rulerInterval, 120)}px 100%`,
    }),
    [pps, rulerInterval, timelineWidth]
  );

  const handleSeek = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const unclampedTime = (x / timelineWidth) * safeViewDuration;
      onTimeClick(clampTimelineTime(unclampedTime, playbackDuration));
    },
    [onTimeClick, playbackDuration, safeViewDuration, timelineWidth]
  );

  return (
    <section className="flex h-[360px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/70 px-4 py-2 dark:border-slate-800">
        <div className="relative min-w-[280px] flex-1 max-w-[520px]">
          <Layers className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sky-500 dark:text-sky-300" />
          <select
            value={selectedTimelineId ?? ''}
            onChange={(event) => onSelectTimeline(Number(event.target.value))}
            aria-label={t('timeline.selectTimeline')}
            className="h-10 w-full appearance-none rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-900 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-sky-500 dark:focus:border-sky-400"
          >
            {timelines.map((timeline) => (
              <option key={timeline.id} value={timeline.id} className="text-slate-900">
                {timeline.name} ({timeline.clip_count} {t('timeline.clips')} · {formatDuration(timeline.total_duration)})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SurfacePill>
            {Math.round(pps)} px/s
          </SurfacePill>
          <ZoomButton label={t('timeline.zoomOut')} onClick={onZoomOut}>
            <ZoomOut className="h-4 w-4" />
          </ZoomButton>
          <ZoomButton label={t('timeline.zoomReset')} onClick={onZoomReset}>
            <span className="text-xs font-semibold">1:1</span>
          </ZoomButton>
          <ZoomButton label={t('timeline.zoomIn')} onClick={onZoomIn}>
            <ZoomIn className="h-4 w-4" />
          </ZoomButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="min-w-max">
          <div className="sticky top-0 z-20 grid grid-cols-[96px_auto] border-b border-slate-200/70 bg-white dark:border-slate-800 dark:bg-slate-900">
            <TrackLabel
              icon={<Clock3 className="h-4 w-4" />}
              label={t('timeline.time')}
              secondary={formatDuration(playbackDuration)}
              sticky
            />
            <div
              className="relative h-10 cursor-pointer"
              style={{ width: timelineWidth }}
              onClick={handleSeek}
            >
              <Playhead left={playheadLeft} topOffset={0} showCap />
              {rulerMarks.map((mark) => (
                <div
                  key={mark}
                  className="absolute top-0 h-full"
                  style={{ left: `${(mark / safeViewDuration) * timelineWidth}px` }}
                >
                  <div className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
                  <span className="mt-1 block -translate-x-1/2 text-[10px] font-mono text-slate-400 dark:text-slate-500">
                    {formatDuration(mark)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <TimelineRow
            label={t('timeline.video')}
            secondary={`${detail.clips.length}`}
            icon={<Film className="h-4 w-4" />}
          >
            <div
              className="relative h-[120px] cursor-pointer px-2 py-2"
              style={laneStyle}
              onClick={handleSeek}
            >
              <Playhead left={playheadLeft} />
              {clipSegments.map((segment) => {
                const left = (segment.startTime / safeViewDuration) * timelineWidth;
                const width = Math.max(
                  (segment.duration / safeViewDuration) * timelineWidth,
                  MIN_CLIP_WIDTH
                );
                const thumb = thumbnailUrl(segment.clip.thumbnail_path);
                const isActive = segment.index === activeClipIndex;

                return (
                  <button
                    key={segment.clip.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onClipClick(segment.index);
                    }}
                    className={`absolute top-2 h-[104px] overflow-hidden rounded-xl border text-left transition-all ${
                      isActive
                        ? 'border-sky-400 ring-1 ring-sky-200 dark:ring-sky-900'
                        : 'border-slate-200/80 hover:border-sky-300 dark:border-slate-700 dark:hover:border-sky-500'
                    }`}
                    style={{ left, width }}
                    title={`${segment.clip.filename || `#${segment.clip.video_id}`} · ${formatDuration(segment.duration)}`}
                  >
                    {thumb ? (
                      <div
                        className="absolute inset-0 bg-cover bg-center"
                        style={{ backgroundImage: `url(${thumb})` }}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-slate-200 dark:bg-slate-800" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/5 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 px-2 py-1">
                      <div className="truncate text-xs font-semibold text-white">
                        {segment.clip.filename?.replace(/\.[^.]+$/, '') || `#${segment.clip.video_id}`}
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/80">
                        <span className="font-mono">{formatDuration(segment.duration)}</span>
                        {segment.clip.transition !== 'cut' && (
                          <span className="rounded-full bg-black/30 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-white">
                            {segment.clip.transition}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </TimelineRow>

          <TimelineRow
            label={t('timeline.text')}
            secondary={`${detail.subtitles.length}`}
            icon={<Captions className="h-4 w-4" />}
          >
            <div
              className="relative h-[40px] cursor-pointer px-1 py-1"
              style={laneStyle}
              onClick={handleSeek}
            >
              <Playhead left={playheadLeft} />
              {detail.subtitles.map((subtitle) => {
                const left = (subtitle.start_time / safeViewDuration) * timelineWidth;
                const width = Math.max(
                  ((subtitle.end_time - subtitle.start_time) / safeViewDuration) * timelineWidth,
                  MIN_CLIP_WIDTH
                );
                const isActive = activeSubtitle?.id === subtitle.id;

                return (
                  <div
                    key={subtitle.id}
                    className={`absolute top-1 flex h-7 items-center overflow-hidden rounded-md border px-1.5 text-[10px] ${
                      isActive
                        ? 'border-amber-400 bg-amber-100 text-amber-950 dark:bg-amber-950/40 dark:text-amber-100'
                        : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-200'
                    }`}
                    style={{ left, width }}
                    title={subtitle.text}
                  >
                    <span className="truncate">{subtitle.text}</span>
                  </div>
                );
              })}
            </div>
          </TimelineRow>

          <TimelineRow
            label={t('timeline.music')}
            secondary={`${detail.music.length}`}
            icon={<Music className="h-4 w-4" />}
          >
            <div
              className="relative h-[48px] cursor-pointer px-1 py-1"
              style={laneStyle}
              onClick={handleSeek}
            >
              <Playhead left={playheadLeft} />
              {detail.music.map((track) => {
                const left = (track.start_time / safeViewDuration) * timelineWidth;
                const width = Math.max(
                  ((track.end_time - track.start_time) / safeViewDuration) * timelineWidth,
                  MIN_CLIP_WIDTH
                );
                const bars = buildWaveBars(width, track.id);
                const isActive = activeMusicTrack?.id === track.id;

                return (
                  <div
                    key={track.id}
                    className={`absolute top-1 bottom-1 flex flex-col justify-center overflow-hidden rounded-lg border px-2 ${
                      isActive
                        ? 'border-emerald-400 bg-emerald-100 dark:bg-emerald-950/40'
                        : 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20'
                    }`}
                    style={{ left, width }}
                    title={track.title || `${t('timeline.music')} #${track.music_id}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <div className="truncate text-[10px] font-medium text-emerald-900 dark:text-emerald-200">
                        {track.title || `${t('timeline.music')} #${track.music_id}`}
                      </div>
                      <span className="shrink-0 text-[9px] text-emerald-600/70 dark:text-emerald-400/70">
                        {Math.round((track.volume ?? 0.7) * 100)}%
                      </span>
                    </div>
                    <div className="mt-0.5 flex h-2.5 items-end gap-[2px] overflow-hidden">
                      {bars.map((height, index) => (
                        <div
                          key={index}
                          className="w-[3px] rounded-full bg-emerald-500/80 dark:bg-emerald-400/80"
                          style={{ height: `${height}%` }}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </TimelineRow>
        </div>
      </div>
    </section>
  );
}

function TimelineRow({
  label,
  secondary,
  icon,
  children,
}: {
  label: string;
  secondary: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[96px_auto] border-b border-slate-200/70 last:border-b-0 dark:border-slate-800">
      <TrackLabel icon={icon} label={label} secondary={secondary} />
      <div>{children}</div>
    </div>
  );
}

function TrackLabel({
  icon,
  label,
  secondary,
  sticky = false,
}: {
  icon: ReactNode;
  label: string;
  secondary: string;
  sticky?: boolean;
}) {
  return (
    <div
      className={`flex h-full items-center gap-2 border-r border-slate-200/70 bg-slate-50 px-3 dark:border-slate-800 dark:bg-slate-950 ${
        sticky ? 'sticky left-0 z-10' : 'sticky left-0 z-10'
      }`}
      style={{ width: TRACK_LABEL_WIDTH }}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200/70 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
          {label}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{secondary}</div>
      </div>
    </div>
  );
}

function Playhead({
  left,
  topOffset = 8,
  showCap = false,
}: {
  left: number;
  topOffset?: number;
  showCap?: boolean;
}) {
  return (
    <div
      className="pointer-events-none absolute bottom-0 z-10"
      style={{ left, top: topOffset }}
    >
      {showCap && (
        <div className="absolute -top-2 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-rose-500 shadow-[0_0_0_4px_rgba(244,63,94,0.12)]" />
      )}
      <div className="h-full w-px bg-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.18)]" />
    </div>
  );
}

function IconButton({
  children,
  label,
  onClick,
  loading = false,
  destructive = false,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  loading?: boolean;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
        destructive
          ? 'border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/50 dark:text-red-400 dark:hover:bg-red-950/30'
          : 'border-slate-200 text-slate-500 hover:border-sky-300 hover:text-sky-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-sky-500 dark:hover:text-sky-300'
      }`}
    >
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : children}
    </button>
  );
}

function ZoomButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="inline-flex h-10 min-w-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 text-slate-700 transition-colors hover:border-sky-300 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-sky-500 dark:hover:text-sky-300"
    >
      {children}
    </button>
  );
}


function TimelineVideoListItem({
  entry,
  projectId,
  isActive,
}: {
  entry: TimelineVideoEntry;
  projectId: number;
  isActive: boolean;
}) {
  const { t } = useI18n();
  const thumb = thumbnailUrl(
    entry.video?.thumbnail_path ?? entry.firstClip.thumbnail_path ?? null
  );
  const title = (
    entry.video?.filename ??
    entry.firstClip.filename ??
    `#${entry.videoId}`
  ).replace(/\.[^.]+$/, '');

  const issues =
    entry.video?.issues && entry.video.issues !== 'none'
      ? entry.video.issues.split(',').map((i) => i.trim()).filter(Boolean).slice(0, 2)
      : [];

  return (
    <article
      className={`rounded-xl border p-2.5 transition-colors ${
        isActive
          ? 'border-sky-300 bg-sky-50/70 dark:border-sky-700 dark:bg-sky-950/20'
          : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/40 dark:hover:border-slate-700'
      }`}
    >
      <div className="flex gap-2.5">
        <div className="w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800">
          {thumb ? (
            <div
              className="aspect-video w-full bg-cover bg-center"
              style={{ backgroundImage: `url(${thumb})` }}
            />
          ) : (
            <div className="flex aspect-video items-center justify-center text-slate-400 dark:text-slate-500">
              <Film className="h-4 w-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1.5">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </span>
              {entry.video?.is_highlight && (
                <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />
              )}
            </div>
            <Link
              href={`/projects/${projectId}/videos/${entry.videoId}`}
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 transition-colors hover:text-sky-600 dark:text-slate-500 dark:hover:text-sky-300"
              title={t('timeline.openVideo')}
            >
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            <span>{entry.clipCount} {t('timeline.clips')} · {formatDuration(entry.usedDuration)}</span>
            {entry.video?.duration != null && (
              <span className="font-mono">{formatDuration(entry.video.duration)}</span>
            )}
            {entry.video?.people_count != null && entry.video.people_count > 0 && (
              <span>{entry.video.people_count} ppl</span>
            )}
          </div>
        </div>
      </div>

      {entry.video?.description && (
        <p className="mt-1.5 line-clamp-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
          {entry.video.description}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        {entry.video?.quality_score != null && (
          <span className={`rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold dark:bg-slate-800 ${qualityColor(entry.video.quality_score)}`}>
            {entry.video.quality_score.toFixed(1)}
          </span>
        )}
        {entry.stability && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-slate-800 dark:text-emerald-400">
            S{entry.stability.overall_score.toFixed(0)}
          </span>
        )}
        {entry.video?.scene_category && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Tag className="mr-0.5 inline h-2.5 w-2.5" />
            {entry.video.scene_category}
          </span>
        )}
        {entry.video?.mood && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {moodEmoji(entry.video.mood)} {entry.video.mood}
          </span>
        )}
        {entry.video?.audio_type && entry.video.audio_type !== 'none' && (
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {entry.video.audio_type}
          </span>
        )}
        {issues.map((issue) => (
          <span key={issue} className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:bg-red-950/30 dark:text-red-400">
            {issue}
          </span>
        ))}
      </div>

      {entry.stability && entry.stability.usable_segments.length > 0 && (
        <StabilityStrip
          duration={entry.video?.duration || entry.firstClip.source_end || entry.usedDuration}
          segments={entry.stability.usable_segments}
        />
      )}
    </article>
  );
}


function EmptyPanelState({
  label,
}: {
  label: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-400">
      {label}
    </div>
  );
}

function VideoListSkeleton() {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/40">
      <div className="h-8 w-14 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-2.5 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

function StabilityStrip({
  duration,
  segments,
}: {
  duration: number;
  segments: Array<{ start: number; end: number; avg_shake: number }>;
}) {
  const safeDuration = Math.max(duration, 0.01);
  const points: string[] = [];
  const w = 100;
  const h = 16;

  if (segments.length === 0) {
    return null;
  }

  points.push(`0,${h}`);
  for (const seg of segments) {
    const x1 = (seg.start / safeDuration) * w;
    const x2 = (seg.end / safeDuration) * w;
    const shake = Math.min(seg.avg_shake ?? 0, 20);
    const y = h - (shake / 20) * h;
    points.push(`${x1.toFixed(1)},${y.toFixed(1)}`);
    points.push(`${x2.toFixed(1)},${y.toFixed(1)}`);
  }
  points.push(`${w},${h}`);

  return (
    <div className="mt-1.5">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-4 w-full" preserveAspectRatio="none">
        <rect width={w} height={h} className="fill-slate-100 dark:fill-slate-800" rx="2" />
        {segments.map((seg, i) => {
          const x = (seg.start / safeDuration) * w;
          const segW = ((seg.end - seg.start) / safeDuration) * w;
          return (
            <rect
              key={i}
              x={x}
              y={0}
              width={segW}
              height={h}
              className="fill-emerald-200/60 dark:fill-emerald-900/40"
            />
          );
        })}
        <polyline
          points={points.join(' ')}
          fill="none"
          className="stroke-emerald-500 dark:stroke-emerald-400"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function SurfacePill({
  children,
  icon,
}: {
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
      {icon}
      {children}
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: string;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const isFinalized = status === 'finalized';
  return (
    <div
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
        isFinalized
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300'
      } ${compact ? 'py-1' : ''}`}
    >
      {isFinalized ? t('timeline.finalized') : t('timeline.draft')}
    </div>
  );
}

function LoadingSurface() {
  return (
    <div className="min-h-[280px] animate-pulse rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/70" />
  );
}

function getRulerInterval(pps: number): number {
  const candidates = [1, 2, 5, 10, 15, 30, 60];
  return candidates.find((candidate) => candidate * pps >= 110) ?? 60;
}

function buildWaveBars(width: number, seed: number): number[] {
  const count = Math.max(8, Math.min(28, Math.floor(width / 12)));
  return Array.from({ length: count }, (_, index) => {
    const value =
      32 +
      (Math.sin((seed + 1) * (index + 1) * 0.57) + 1) * 16 +
      (Math.cos((seed + 3) * (index + 2) * 0.21) + 1) * 8;
    return Math.round(Math.max(22, Math.min(88, value)));
  });
}
