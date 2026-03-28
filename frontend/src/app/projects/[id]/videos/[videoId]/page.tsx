'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchVideo,
  fetchVideos,
  fetchModels,
  analyzeSingleVideo,
  fetchStability,
  triggerStabilitySingle,
  saveStabilitySegments,
  updateVideoComment,
  updateVideoHidden,
  thumbnailUrl,
  mediaStreamUrl,
} from '@/lib/api';
import type { StabilityResult, StabilitySegment, ShakeCurvePoint } from '@/lib/api';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
} from 'recharts';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import VideoCard from '@/components/video-card';
import {
  formatDuration,
  qualityColor,
  qualityBgColor,
  moodEmoji,
} from '@/lib/utils';
import {
  Star,
  MapPin,
  Clock,
  Film,
  Loader2,
  Eye,
  Music,
  AlertTriangle,
  Users,
  Tag,
  Sparkles,
  Play,
  ChevronDown,
  Activity,
  Save,
  Check,
  ExternalLink,
  MessageSquare,
  EyeOff,
} from 'lucide-react';

const MiniMap = dynamic(() => import('@/components/mini-map'), { ssr: false });

export default function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string; videoId: string }>;
}) {
  const { id, videoId } = use(params);
  const projectId = parseInt(id);
  const videoIdNum = parseInt(videoId);
  const queryClient = useQueryClient();

  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [commentDraft, setCommentDraft] = useState<string | null>(null);
  const [commentSaved, setCommentSaved] = useState(false);

  const { data: video, isLoading } = useQuery({
    queryKey: ['video', videoIdNum],
    queryFn: () => fetchVideo(videoIdNum),
  });

  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
  } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  });

  const { data: similarVideos } = useQuery({
    queryKey: ['videos', projectId, 'similar', video?.location_label],
    queryFn: () =>
      fetchVideos(projectId, {
        location_label: video?.location_label ?? undefined,
        page_size: 6,
      }),
    enabled: !!video?.location_label,
  });

  const analyzeMutation = useMutation({
    mutationFn: (model?: string) => analyzeSingleVideo(videoIdNum, model),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoIdNum] });
      setShowModelPicker(false);
    },
  });

  const hiddenMutation = useMutation({
    mutationFn: (isHidden: boolean) => updateVideoHidden(videoIdNum, isHidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoIdNum] });
      queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
      queryClient.invalidateQueries({ queryKey: ['locations', projectId] });
    },
  });

  // Comment
  const commentMutation = useMutation({
    mutationFn: (comment: string) => updateVideoComment(videoIdNum, comment),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['video', videoIdNum] });
      setCommentSaved(true);
      setTimeout(() => setCommentSaved(false), 2000);
    },
  });

  const handleCommentSave = () => {
    if (commentDraft !== null && commentDraft !== (video?.user_comment ?? '')) {
      commentMutation.mutate(commentDraft);
    }
  };

  // Stability
  const [shakeThreshold, setShakeThreshold] = useState(1.5);

  const { data: stability } = useQuery({
    queryKey: ['stability', videoIdNum],
    queryFn: () => fetchStability(videoIdNum),
  });

  // Sync threshold selector with existing analysis result on first load
  useEffect(() => {
    if (stability?.threshold) {
      setShakeThreshold(stability.threshold);
    }
  }, [stability?.threshold]);

  const stabilityMutation = useMutation({
    mutationFn: (threshold: number) => triggerStabilitySingle(videoIdNum, threshold),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stability', videoIdNum] });
    },
  });

  // When curve exists, recompute segments locally from threshold (no re-analysis needed)
  const localSegments = useMemo(() => {
    if (!stability?.shake_curve || stability.shake_curve.length < 2) return null;
    return reclassifySegments(stability.shake_curve, shakeThreshold, 1.0);
  }, [stability?.shake_curve, shakeThreshold]);

  // Use local segments if threshold changed, otherwise use server data
  const displayStable = localSegments?.stable ?? stability?.stable_segments ?? [];
  const displayShaky = localSegments?.shaky ?? stability?.shaky_segments ?? [];
  const displayRatio = localSegments
    ? localSegments.stableRatio
    : stability?.stable_ratio ?? 0;
  const displayScore = localSegments
    ? localSegments.score
    : stability?.overall_score ?? 0;

  // Whether current view differs from saved DB state
  const hasUnsavedChanges = stability && shakeThreshold !== stability.threshold;

  const saveMutation = useMutation({
    mutationFn: () =>
      saveStabilitySegments(
        videoIdNum,
        shakeThreshold,
        displayStable,
        displayShaky,
        displayScore,
        displayRatio
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['stability', videoIdNum] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!video) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Video not found</p>
      </div>
    );
  }

  const thumbUrl = thumbnailUrl(video.thumbnail_path);
  const hasAnalysis = video.quality_score !== null || video.description;

  return (
    <div className="p-4 max-w-full overflow-y-auto h-full">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Video Player */}
        <div className="lg:col-span-2">
         <div className="max-w-[100%] mx-auto space-y-3">
          {/* Media Player */}
          <div className="bg-black rounded-xl overflow-hidden relative">
            {video.media_type === 'photo' ? (
              <img
                src={`${mediaStreamUrl(video.id)}?fmt=jpeg`}
                alt={video.filename}
                className="w-full aspect-video object-contain"
                onError={(e) => {
                  if (thumbUrl)
                    (e.target as HTMLImageElement).src = thumbUrl;
                }}
              />
            ) : (
              <video
                src={mediaStreamUrl(video.id)}
                poster={thumbUrl || undefined}
                controls
                className="w-full aspect-video"
                preload="metadata"
              >
                Your browser does not support the video tag.
              </video>
            )}
            {/* Stability segments overlay bar */}
            {video.media_type === 'video' && (displayStable.length > 0 || displayShaky.length > 0) && video.duration > 0 && (
              <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-gray-800/50">
                {displayStable.map((seg, i) => (
                  <div
                    key={`os-${i}`}
                    className="absolute top-0 h-full bg-teal-400/80"
                    style={{
                      left: `${(seg.start / video.duration) * 100}%`,
                      width: `${((seg.end - seg.start) / video.duration) * 100}%`,
                    }}
                    title={`Stable: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
                  />
                ))}
                {displayShaky.map((seg, i) => (
                  <div
                    key={`ok-${i}`}
                    className="absolute top-0 h-full bg-red-400/80"
                    style={{
                      left: `${(seg.start / video.duration) * 100}%`,
                      width: `${((seg.end - seg.start) / video.duration) * 100}%`,
                    }}
                    title={`Shaky: ${seg.start.toFixed(1)}s - ${seg.end.toFixed(1)}s`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Video Info + Note — two columns */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 grid grid-cols-2 gap-3">
            {/* Left: file info */}
            <div>
              <div className="flex items-start gap-2">
                <h1 className="text-sm font-bold text-gray-900 dark:text-gray-100">{video.filename}</h1>
                {video.is_highlight && (
                  <Star className="w-5 h-5 text-yellow-400 fill-yellow-400 shrink-0 mt-0.5" />
                )}
                <button
                  type="button"
                  onClick={() => hiddenMutation.mutate(!video.is_hidden)}
                  className={`ml-auto inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    video.is_hidden
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300'
                      : 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300'
                  }`}
                >
                  {video.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                  {video.is_hidden ? '取消屏蔽' : '屏蔽'}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                {video.media_type === 'photo' ? (
                  <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded font-medium">PHOTO</span>
                ) : (
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatDuration(video.duration)}
                  </span>
                )}
                {video.width && video.height && <span>{video.width}x{video.height}</span>}
                {video.captured_at && <span>{new Date(video.captured_at).toLocaleString()}</span>}
                {video.location_label && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {video.location_label}
                  </span>
                )}
                <span className="text-gray-400 dark:text-gray-500 truncate max-w-[200px]" title={video.path}>
                  {video.path.split('/').slice(-2).join('/')}
                </span>
                {video.is_hidden && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                    Hidden in browser list
                  </span>
                )}
              </div>
            </div>
            {/* Right: note */}
            <div className="border-l border-gray-100 dark:border-gray-800 pl-4 flex flex-col">
              <div className="flex items-center gap-1.5 mb-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Note</span>
                {commentSaved && (
                  <span className="text-[11px] text-green-600 flex items-center gap-0.5">
                    <Check className="w-3 h-3" /> Saved
                  </span>
                )}
              </div>
              <textarea
                value={commentDraft ?? video.user_comment ?? ''}
                onChange={(e) => setCommentDraft(e.target.value)}
                onBlur={handleCommentSave}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) (e.target as HTMLTextAreaElement).blur(); }}
                placeholder="为 AI 剪辑添加备注... e.g. '爸妈在金门大桥合影，必须保留'"
                rows={2}
                className="flex-1 text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 border border-gray-200 dark:border-gray-700 focus:border-blue-400 focus:outline-none resize-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
              />
            </div>
          </div>

          {/* Similar Videos row */}
          {similarVideos && similarVideos.items.filter((v) => v.id !== video.id).length > 0 && (
            <div>
              <h2 className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                More from {video.location_label}
              </h2>
              <div className="grid grid-cols-5 gap-2">
                {similarVideos.items
                  .filter((v) => v.id !== video.id)
                  .slice(0, 5)
                  .map((v) => (
                    <VideoCard key={v.id} video={v} projectId={projectId} />
                  ))}
              </div>
            </div>
          )}
         </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-3">
          {/* AI Analysis Card (includes quality score) */}
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                AI Analysis
              </h3>
              <div className="relative">
                <button
                  onClick={() => setShowModelPicker(!showModelPicker)}
                  disabled={analyzeMutation.isPending}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    analyzeMutation.isPending
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : hasAnalysis
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'bg-purple-600 text-white hover:bg-purple-700'
                  }`}
                >
                  {analyzeMutation.isPending ? (
                    <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing...</>
                  ) : (
                    <><Play className="w-3 h-3" /> {hasAnalysis ? 'Re-analyze' : 'Analyze'} <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
                {showModelPicker && !analyzeMutation.isPending && (
                  <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-10 w-56 overflow-hidden">
                    <div className="max-h-60 overflow-y-auto p-1">
                      {modelsLoading && (
                        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          Loading models...
                        </div>
                      )}
                      {modelsError && (
                        <div className="px-3 py-2 text-xs text-red-600 dark:text-red-400">
                          Failed to load models.
                        </div>
                      )}
                      {!modelsLoading && !modelsError && models?.length === 0 && (
                        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                          No models available.
                        </div>
                      )}
                      {models?.map((m) => (
                        <button
                          key={m.id}
                          onClick={() => { setSelectedModel(m.id); analyzeMutation.mutate(m.id); }}
                          className="flex items-center justify-between w-full px-3 py-1.5 text-xs text-left rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                        >
                          <span className="font-medium text-gray-900 dark:text-gray-100">{m.label}</span>
                          <span className="text-gray-400 dark:text-gray-500">{m.standard_free ? 'Free' : `$${m.input_per_million}/M`}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {analyzeMutation.isError && (
              <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs text-red-700 dark:text-red-400">
                Analysis failed: {(analyzeMutation.error as Error).message}
              </div>
            )}

            {hasAnalysis ? (
              <>
                {/* Quality score inline */}
                {video.quality_score !== null && (
                  <div className="flex items-center gap-2">
                    <span className={`text-2xl font-bold ${qualityColor(video.quality_score)}`}>
                      {video.quality_score.toFixed(1)}
                    </span>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                        <div
                          className={`${qualityBgColor(video.quality_score)} h-2 rounded-full`}
                          style={{ width: `${(video.quality_score / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-xs text-gray-400 dark:text-gray-500">/10</span>
                  </div>
                )}

                {video.description && (
                  <p className="text-sm text-gray-800 dark:text-gray-200">{video.description}</p>
                )}

                {/* Tags row — scene, mood, highlight, audio, people inline */}
                <div className="flex flex-wrap gap-1.5">
                  {video.scene_category && (
                    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs capitalize">
                      <Tag className="w-3 h-3" /> {video.scene_category}
                    </span>
                  )}
                  {video.mood && (
                    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs capitalize">
                      {moodEmoji(video.mood)} {video.mood}
                    </span>
                  )}
                  {video.is_highlight && (
                    <span className="inline-flex items-center gap-1 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 px-2 py-0.5 rounded text-xs border border-yellow-200 dark:border-yellow-800">
                      <Star className="w-3 h-3 fill-yellow-400" /> Highlight
                    </span>
                  )}
                  {video.audio_type && (
                    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs capitalize">
                      <Music className="w-3 h-3" /> {video.audio_type}
                    </span>
                  )}
                  {video.people_count !== null && video.people_count !== undefined && (
                    <span className="inline-flex items-center gap-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded text-xs">
                      <Users className="w-3 h-3" /> {video.people_count}
                    </span>
                  )}
                  {video.issues && video.issues !== 'none' && video.issues.split(',').map((issue) => (
                    <span
                      key={issue.trim()}
                      className="inline-flex items-center gap-1 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 px-2 py-0.5 rounded text-xs border border-orange-200 dark:border-orange-800"
                    >
                      <AlertTriangle className="w-3 h-3" /> {issue.trim()}
                    </span>
                  ))}
                </div>

                {/* Timeline Segments */}
                {video.segments && video.segments.length > 0 && (
                  <div className="space-y-0.5">
                    {video.segments.map((seg, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-purple-600 font-mono shrink-0">
                          {seg.start_sec.toFixed(1)}s - {seg.end_sec.toFixed(1)}s
                        </span>
                        <span className="text-gray-600 dark:text-gray-400 truncate">{seg.label}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Model + tokens footer */}
                {(video.model_version || video.cost_tokens) && (
                  <div className="flex items-center gap-3 text-[11px] text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-800">
                    {video.model_version && <span>{video.model_version}</span>}
                    {video.cost_tokens && <span>{video.cost_tokens.toLocaleString()} tokens</span>}
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-3">
                <Sparkles className="w-6 h-6 text-gray-200 dark:text-gray-600 mx-auto mb-1" />
                <p className="text-xs text-gray-400 dark:text-gray-500">No analysis yet</p>
              </div>
            )}
          </div>

          {/* Stability Analysis Card */}
          {video.media_type === 'video' && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  Stability
                </h3>
                <button
                  onClick={() => stabilityMutation.mutate(shakeThreshold)}
                  disabled={stabilityMutation.isPending}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    stabilityMutation.isPending
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                      : stability
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        : 'bg-teal-600 text-white hover:bg-teal-700'
                  }`}
                >
                  {stabilityMutation.isPending ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Activity className="w-3 h-3" />
                      {stability ? 'Re-analyze' : 'Analyze'}
                    </>
                  )}
                </button>
              </div>

              {/* Shake Threshold Slider */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs text-gray-400 dark:text-gray-500">Shake Threshold</p>
                  <span className="text-xs font-mono text-teal-600 dark:text-teal-400 font-medium">
                    {shakeThreshold.toFixed(1)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={shakeThreshold}
                  onChange={(e) => setShakeThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-teal-500"
                />
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">0.1 (strict)</span>
                  <span className="text-[10px] text-gray-400">10.0 (loose)</span>
                </div>
                {/* Quick presets */}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {THRESHOLD_LEVELS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setShakeThreshold(opt.value)}
                      title={opt.desc}
                      className={`px-1.5 py-0.5 text-[10px] rounded border transition-colors ${
                        Math.abs(shakeThreshold - opt.value) < 0.05
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/30 text-teal-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {/* Show original analysis threshold */}
                {stability && (
                  <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                    Analyzed with threshold: {stability.threshold.toFixed(1)}
                    {hasUnsavedChanges && (
                      <span className="text-amber-500 ml-1">(unsaved changes)</span>
                    )}
                  </p>
                )}
              </div>

              {stabilityMutation.isError && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-2 text-xs text-red-700 dark:text-red-400">
                  Analysis failed: {(stabilityMutation.error as Error).message}
                </div>
              )}

              {stability ? (
                <>
                  {/* Score + Ratio */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-3xl font-bold ${
                        displayScore >= 80
                          ? 'text-green-600'
                          : displayScore >= 50
                            ? 'text-amber-600'
                            : 'text-red-600'
                      }`}
                    >
                      {displayScore.toFixed(0)}
                    </div>
                    <div className="flex-1">
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                        <div
                          className={`h-2.5 rounded-full transition-all ${
                            displayScore >= 80
                              ? 'bg-green-500'
                              : displayScore >= 50
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${displayScore}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {(displayRatio * 100).toFixed(0)}% stable
                        {' · '}
                        {thresholdLabel(shakeThreshold)}
                        {' · '}
                        {stability.analysis_time_ms}ms
                      </p>
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">/100</span>
                  </div>

                  {/* Timeline Bar */}
                  <div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Timeline</p>
                    <StabilityTimeline
                      duration={video.duration}
                      stableSegments={displayStable}
                      shakySegments={displayShaky}
                    />
                  </div>

                  {/* Shake Curve Chart */}
                  {stability.shake_curve && stability.shake_curve.length > 1 && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">Shake Magnitude</p>
                      <div className="h-28 -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={stability.shake_curve}>
                            {/* Shaky zones as red background */}
                            {displayShaky.map((seg, i) => (
                              <ReferenceArea
                                key={i}
                                x1={seg.start}
                                x2={seg.end}
                                fill="#fecaca"
                                fillOpacity={0.5}
                              />
                            ))}
                            <XAxis
                              dataKey="t"
                              tick={{ fontSize: 10 }}
                              tickFormatter={(v) => `${v}s`}
                              interval="preserveStartEnd"
                            />
                            <YAxis
                              tick={{ fontSize: 10 }}
                              width={30}
                              domain={[0, 'auto']}
                            />
                            <Tooltip
                              contentStyle={{ fontSize: 12 }}
                              formatter={(v) => [Number(v).toFixed(2), 'Shake']}
                              labelFormatter={(t) => `${t}s`}
                            />
                            <ReferenceLine
                              y={shakeThreshold}
                              stroke="#ef4444"
                              strokeDasharray="4 4"
                              label={{ value: 'Threshold', fontSize: 10, fill: '#ef4444', position: 'right' }}
                            />
                            <Line
                              type="monotone"
                              dataKey="v"
                              stroke="#14b8a6"
                              strokeWidth={1.5}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Stable Segments */}
                  {displayStable.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                        Stable Segments ({displayStable.length})
                      </p>
                      <div className="space-y-1">
                        {displayStable.map((seg, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs bg-teal-50 dark:bg-teal-900/30 rounded px-2 py-1"
                          >
                            <span className="text-teal-700 font-mono shrink-0">
                              {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                            </span>
                            <span className="text-teal-600">
                              ({(seg.end - seg.start).toFixed(1)}s, shake={seg.avg_shake})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Shaky Segments */}
                  {displayShaky.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mb-1">
                        Shaky Segments ({displayShaky.length})
                      </p>
                      <div className="space-y-1">
                        {displayShaky.map((seg, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs bg-red-50 dark:bg-red-900/30 rounded px-2 py-1"
                          >
                            <span className="text-red-700 dark:text-red-400 font-mono shrink-0">
                              {seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s
                            </span>
                            <span className="text-red-600 dark:text-red-400">
                              ({(seg.end - seg.start).toFixed(1)}s, shake={seg.avg_shake})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Save Button — only when threshold changed */}
                  {hasUnsavedChanges && (
                    <button
                      onClick={() => saveMutation.mutate()}
                      disabled={saveMutation.isPending}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      {saveMutation.isPending ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                      ) : saveMutation.isSuccess ? (
                        <><Check className="w-4 h-4" /> Saved</>
                      ) : (
                        <><Save className="w-4 h-4" /> Save Segments</>
                      )}
                    </button>
                  )}
                </>
              ) : (
                <div className="text-center py-4">
                  <Activity className="w-8 h-8 text-gray-200 dark:text-gray-600 mx-auto mb-2" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">
                    No stability analysis yet. Click the button above to analyze.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Location Card */}
          {video.lat !== null && video.lon !== null && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Location
              </h3>
              <div className="rounded-lg overflow-hidden" style={{ height: 200 }}>
                <MiniMap lat={video.lat} lon={video.lon} />
              </div>
              <a
                href={`https://www.google.com/maps?q=${video.lat},${video.lon}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-1 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg"
              >
                <ExternalLink className="w-3 h-3" /> Open in Google Maps
              </a>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// --- Stability Timeline Bar ---

function StabilityTimeline({
  duration,
  stableSegments,
  shakySegments,
}: {
  duration: number;
  stableSegments: StabilitySegment[];
  shakySegments: StabilitySegment[];
}) {
  if (duration <= 0) return null;
  return (
    <div className="relative w-full h-5 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
      {/* Shaky segments (red) */}
      {shakySegments.map((seg, i) => {
        const left = (seg.start / duration) * 100;
        const width = ((seg.end - seg.start) / duration) * 100;
        return (
          <div
            key={`shaky-${i}`}
            className="absolute top-0 h-full bg-red-300"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Shaky: ${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s (shake=${seg.avg_shake})`}
          />
        );
      })}
      {/* Stable segments (green) */}
      {stableSegments.map((seg, i) => {
        const left = (seg.start / duration) * 100;
        const width = ((seg.end - seg.start) / duration) * 100;
        return (
          <div
            key={`stable-${i}`}
            className="absolute top-0 h-full bg-teal-400"
            style={{ left: `${left}%`, width: `${width}%` }}
            title={`Stable: ${seg.start.toFixed(1)}s-${seg.end.toFixed(1)}s (shake=${seg.avg_shake})`}
          />
        );
      })}
      {/* Time labels */}
      <div className="absolute inset-0 flex items-center justify-between px-1.5 pointer-events-none">
        <span className="text-[9px] text-gray-600 dark:text-gray-400 font-mono">0s</span>
        <span className="text-[9px] text-gray-600 dark:text-gray-400 font-mono">{duration.toFixed(1)}s</span>
      </div>
    </div>
  );
}

const THRESHOLD_LEVELS: { value: number; label: string; desc: string }[] = [
  { value: 0.5, label: 'Strict', desc: 'Only very stable' },
  { value: 1.0, label: 'Normal', desc: 'Default' },
  { value: 1.5, label: 'Tolerant', desc: 'Allow slight shake' },
  { value: 3.0, label: 'Loose', desc: 'Allow more shake' },
];

function thresholdLabel(value: number): string {
  const match = THRESHOLD_LEVELS.find((l) => l.value === value);
  return match ? `${match.label} (${value})` : `Threshold ${value}`;
}

/**
 * Reclassify segments from shake curve data on the client side.
 * No re-analysis needed — just re-threshold the existing curve.
 */
function reclassifySegments(
  curve: ShakeCurvePoint[],
  threshold: number,
  minSegSec: number,
): {
  stable: StabilitySegment[];
  shaky: StabilitySegment[];
  stableRatio: number;
  score: number;
} {
  if (curve.length < 2) {
    return { stable: [], shaky: [], stableRatio: 0, score: 0 };
  }

  const totalDuration = curve[curve.length - 1].t - curve[0].t;
  if (totalDuration <= 0) {
    return { stable: [], shaky: [], stableRatio: 0, score: 0 };
  }

  // Classify each point
  const segments: StabilitySegment[] = [];
  const labels: ('stable' | 'shaky')[] = [];
  let currentLabel: 'stable' | 'shaky' = curve[0].v <= threshold ? 'stable' : 'shaky';
  let segStart = 0;

  for (let i = 1; i < curve.length; i++) {
    const label = curve[i].v <= threshold ? 'stable' : 'shaky';
    if (label !== currentLabel || i === curve.length - 1) {
      const endIdx = label !== currentLabel ? i : i + 1;
      const segPoints = curve.slice(segStart, endIdx);
      const duration = segPoints[segPoints.length - 1].t - segPoints[0].t;
      if (duration >= minSegSec) {
        const avgShake = segPoints.reduce((s, p) => s + p.v, 0) / segPoints.length;
        segments.push({
          start: Math.round(segPoints[0].t * 100) / 100,
          end: Math.round(segPoints[segPoints.length - 1].t * 100) / 100,
          avg_shake: Math.round(avgShake * 100) / 100,
        });
        labels.push(currentLabel);
      }
      currentLabel = label;
      segStart = i;
    }
  }

  const stable: StabilitySegment[] = [];
  const shaky: StabilitySegment[] = [];
  segments.forEach((seg, i) => {
    if (labels[i] === 'stable') stable.push(seg);
    else shaky.push(seg);
  });

  const stableDuration = stable.reduce((s, seg) => s + (seg.end - seg.start), 0);
  const stableRatio = stableDuration / totalDuration;

  const avgStableShake = stable.length > 0
    ? stable.reduce((s, seg) => s + seg.avg_shake, 0) / stable.length
    : 0;
  const shakeBonus = Math.max(0, 10 - avgStableShake) * 2;
  const score = Math.min(100, stableRatio * 80 + shakeBonus);

  return {
    stable,
    shaky,
    stableRatio: Math.round(stableRatio * 1000) / 1000,
    score: Math.round(score * 10) / 10,
  };
}
