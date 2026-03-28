import axios from 'axios';

// When NEXT_PUBLIC_API_URL is empty string, use relative URLs (same-origin).
// Next.js rewrites in next.config.ts proxy /api/* to the backend.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '';

const api = axios.create({
  baseURL: API_BASE_URL,
});

export interface Video {
  id: number;
  project_id: number;
  filename: string;
  path: string;
  media_type: 'video' | 'photo';
  duration: number;
  width: number | null;
  height: number | null;
  lat: number | null;
  lon: number | null;
  captured_at: string | null;
  location_label: string | null;
  timeline_id: string | null;
  thumbnail_path: string | null;
  user_comment: string | null;
  is_ingested: boolean;
  is_hidden: boolean;
  scene_category: string | null;
  quality_score: number | null;
  is_highlight: boolean | null;
  mood: string | null;
  description: string | null;
  people_count: number | null;
  audio_type: string | null;
  issues: string | null;
  segments: Array<{ start_sec: number; end_sec: number; label: string }> | null;
  model_version: string | null;
  cost_tokens: number | null;
}

export const resolveFolder = (
  filename: string,
  relativePath: string
): Promise<{ path?: string; error?: string }> =>
  api
    .post('/api/resolve-folder', { filename, relative_path: relativePath })
    .then((r) => r.data);

export interface Project {
  id: number;
  name: string;
  video_dir: string | null;
  photo_dir: string | null;
  music_dir: string | null;
  description: string | null;
  created_at: string;
  video_count: number;
  analyzed_count: number;
}

export interface PaginatedVideos {
  items: Video[];
  total: number;
  page: number;
  page_size: number;
  pages: number;
}

export interface VideoFilters {
  location_label?: string;
  min_quality?: number;
  max_quality?: number;
  scene_category?: string;
  mood?: string;
  is_highlight?: boolean;
  min_duration?: number;
  max_duration?: number;
  has_gps?: boolean;
  show_hidden?: boolean;
  media_type?: string;
  search?: string;
  page?: number;
  page_size?: number;
  sort_by?: string;
  sort_order?: string;
}

export interface LocationGroup {
  label: string;
  count: number;
}

export interface AnalysisEstimate {
  video_count: number;
  total_duration_seconds: number;
  total_estimated_input_tokens: number;
  total_estimated_output_tokens: number;
  total_estimated_cost_usd: number;
  model?: string;
  standard_free?: boolean;
}

export const fetchProjects = (): Promise<Project[]> =>
  api.get<Project[]>('/api/projects').then((r) => r.data);

export const fetchProject = (id: number): Promise<Project> =>
  api.get<Project>(`/api/projects/${id}`).then((r) => r.data);

export const createProject = (data: {
  name: string;
  video_dir?: string;
  photo_dir?: string;
  music_dir?: string;
}): Promise<Project> =>
  api.post<Project>('/api/projects', data).then((r) => r.data);

export const updateProject = (
  id: number,
  data: {
    name?: string;
    video_dir?: string;
    photo_dir?: string;
    music_dir?: string;
    description?: string;
  }
): Promise<Project> =>
  api.put<Project>(`/api/projects/${id}`, data).then((r) => r.data);

export const fetchVideos = (
  projectId: number,
  filters: VideoFilters = {}
): Promise<PaginatedVideos> => {
  const params = { project_id: projectId, ...filters };
  return api.get<PaginatedVideos>('/api/videos', { params }).then((r) => r.data);
};

export const fetchVideo = (id: number): Promise<Video> =>
  api.get<Video>(`/api/videos/${id}`).then((r) => r.data);

export const updateVideoComment = (
  videoId: number,
  comment: string
): Promise<{ video_id: number; user_comment: string | null }> =>
  api
    .put(`/api/videos/${videoId}/comment`, null, {
      params: { comment },
    })
    .then((r) => r.data);

export const updateVideoHidden = (
  videoId: number,
  isHidden: boolean
): Promise<{ video_id: number; is_hidden: boolean }> =>
  api
    .put(`/api/videos/${videoId}/hidden`, null, {
      params: { is_hidden: isHidden },
    })
    .then((r) => r.data);

export const syncVideos = (
  projectId: number
): Promise<{ checked_count: number; hidden_count: number }> =>
  api.post(`/api/videos/sync/${projectId}`).then((r) => r.data);

export const fetchLocations = (
  projectId: number
): Promise<LocationGroup[]> =>
  api
    .get<LocationGroup[]>(`/api/videos/locations/${projectId}`)
    .then((r) => r.data);

export const triggerIngest = (
  projectId: number
): Promise<{ message: string; status: string }> =>
  api.post(`/api/ingest/${projectId}`).then((r) => r.data);

export interface IngestProgress {
  status: 'idle' | 'running' | 'completed' | 'error';
  done?: number;
  total?: number;
  percent?: number;
  phase?: string;
  error?: string;
  errors?: number;
}

export const fetchIngestProgress = (
  projectId: number
): Promise<IngestProgress> =>
  api.get(`/api/ingest/progress/${projectId}`).then((r) => r.data);

export const triggerAnalysis = (
  projectId: number,
  limit?: number
): Promise<{ message: string }> =>
  api
    .post(`/api/analysis/run/${projectId}`, null, {
      params: limit ? { limit } : {},
    })
    .then((r) => r.data);

export const estimateAnalysis = (
  projectId: number
): Promise<AnalysisEstimate> =>
  api.post(`/api/analysis/estimate/${projectId}`).then((r) => r.data);

// --- Copywriting ---

export interface Narration {
  video_id: number;
  text: string;
  timing: string;
}

export interface CopywriteResult {
  id: number;
  style: string;
  overall_script: string;
  narrations: Narration[];
}

export interface CopywriteDetail {
  id: number;
  project_id: number;
  style: string;
  language: string;
  video_ids: number[];
  narrations: Narration[];
  overall_script: string;
  generated_by: string;
  custom_prompt: string | null;
  created_at: string | null;
}

export interface CopywriteListItem {
  id: number;
  style: string;
  language: string;
  video_count: number;
  generated_by: string;
  created_at: string | null;
}

export const fetchCopywrite = (id: number): Promise<CopywriteDetail> =>
  api.get(`/api/copywrite/${id}`).then((r) => r.data);

export const fetchCopywrites = (
  projectId: number
): Promise<CopywriteListItem[]> =>
  api.get(`/api/copywrite/project/${projectId}`).then((r) => r.data);

export const deleteCopywrite = (id: number): Promise<{ deleted: number }> =>
  api.delete(`/api/copywrite/${id}`).then((r) => r.data);

// --- Export ---

export interface ExportResult {
  id: number;
  status: string;
  output_path: string | null;
  format: string;
}

export interface ExportListItem {
  id: number;
  format: string;
  status: string;
  video_count: number;
  created_at: string;
}

export const createExport = (
  projectId: number,
  videoIds: number[],
  format: string = 'capcut',
  draftName: string = '',
  musicPath?: string,
  copywriteId?: number
): Promise<ExportResult> =>
  api
    .post(`/api/export/${projectId}`, null, {
      params: {
        video_ids: videoIds,
        format,
        draft_name: draftName,
        ...(musicPath ? { music_path: musicPath } : {}),
        ...(copywriteId ? { copywrite_id: copywriteId } : {}),
      },
      paramsSerializer: { indexes: null },
    })
    .then((r) => r.data);

export const fetchExport = (id: number): Promise<ExportResult> =>
  api.get(`/api/export/${id}`).then((r) => r.data);

export const fetchExports = (projectId: number): Promise<ExportListItem[]> =>
  api.get(`/api/export/project/${projectId}`).then((r) => r.data);

// --- Analysis Status ---

export interface AnalysisStatus {
  project_id: number;
  total_videos: number;
  analyzed_videos: number;
  unanalyzed_videos: number;
  progress_percent: number;
}

export const fetchAnalysisStatus = (
  projectId: number,
  location?: string
): Promise<AnalysisStatus> =>
  api.get(`/api/analysis/status/${projectId}`, {
    params: location ? { location } : {},
  }).then((r) => r.data);

// --- Analysis Models & Stats ---

export interface GeminiModel {
  id: string;
  label: string;
  input_per_million: number;
  output_per_million: number;
  standard_free: boolean;
  recommended: boolean;
  deprecated: string | null;
}

export interface AnalysisStats {
  scene_distribution: Record<string, number>;
  quality_distribution: Record<string, number>;
  mood_distribution: Record<string, number>;
  audio_distribution: Record<string, number>;
  highlight_count: number;
  issues_summary: Record<string, number>;
  avg_quality: number;
  total_analyzed: number;
  total_cost_tokens: number;
  total_cost_usd: number;
  cost_by_model: Record<string, number>;
  model_usage: Record<string, number>;
}

export interface AnalysisRunResult {
  message: string;
  status: string;
}

export interface AnalysisRunProgress {
  status: string;  // idle | running | completed | error
  done?: number;
  total?: number;
  errors?: number;
  percent?: number;
  error?: string;
  last_error?: string;
}

export interface AnalysisStorageUsage {
  file_count: number;
  total_bytes: number;
  quota_bytes: number;
  usage_percent: number;
}

export interface AnalysisStorageClearResult extends AnalysisStorageUsage {
  deleted: number;
  failed: number;
}

export const fetchModels = (): Promise<GeminiModel[]> =>
  api.get<GeminiModel[]>('/api/analysis/models').then((r) => r.data);

export const fetchAnalysisStats = (
  projectId: number
): Promise<AnalysisStats> =>
  api.get<AnalysisStats>(`/api/analysis/stats/${projectId}`).then((r) => r.data);

export const estimateAnalysisWithModel = (
  projectId: number,
  model?: string
): Promise<any> =>
  api
    .post(`/api/analysis/estimate/${projectId}`, null, {
      params: model ? { model } : {},
    })
    .then((r) => r.data);

export const triggerAnalysisWithModel = (
  projectId: number,
  model?: string,
  limit?: number,
  location?: string,
  workers?: number,
): Promise<AnalysisRunResult> =>
  api
    .post(`/api/analysis/run/${projectId}`, null, {
      params: {
        ...(model ? { model } : {}),
        ...(limit ? { limit } : {}),
        ...(location ? { location } : {}),
        ...(workers ? { workers } : {}),
      },
    })
    .then((r) => r.data);

export const analyzeSingleVideo = (
  videoId: number,
  model?: string
): Promise<AnalysisRunResult> =>
  api
    .post(`/api/analysis/run-single/${videoId}`, null, {
      params: model ? { model } : {},
    })
    .then((r) => r.data);

export const fetchAnalysisRunProgress = (
  projectId: number
): Promise<AnalysisRunProgress> =>
  api.get(`/api/analysis/run-progress/${projectId}`).then((r) => r.data);

export const fetchAnalysisStorageUsage = (): Promise<AnalysisStorageUsage> =>
  api.get('/api/analysis/storage/usage').then((r) => r.data);

export const clearAnalysisStorage = (): Promise<AnalysisStorageClearResult> =>
  api.post('/api/analysis/storage/clear').then((r) => r.data);

// --- Stability ---

export interface StabilityStatus {
  project_id: number;
  total_videos: number;
  analyzed_videos: number;
  unanalyzed_videos: number;
  progress_percent: number;
}

export interface StabilitySegment {
  start: number;
  end: number;
  avg_shake: number;
}

export interface ShakeCurvePoint {
  t: number;
  v: number;
}

export interface StabilityResult {
  id: number;
  video_id: number;
  overall_score: number;
  is_stable: boolean;
  stable_ratio: number;
  stable_segments: StabilitySegment[];
  shaky_segments: StabilitySegment[];
  shake_curve: ShakeCurvePoint[];
  threshold: number;
  total_frames: number;
  fps: number;
  analysis_time_ms: number;
  created_at: string | null;
}

export interface StabilityStats {
  total_analyzed: number;
  avg_score: number;
  stable_count: number;
  shaky_count: number;
  avg_stable_ratio: number;
  score_distribution: Record<string, number>;
  total_usable_duration: number;
}

export interface StabilityRunResult {
  message: string;
  status: string;
}

export interface StabilityRunProgress {
  status: string;  // idle | running | completed | error
  done?: number;
  total?: number;
  errors?: number;
  skipped?: number;
  percent?: number;
  error?: string;
}

export interface UsableSegmentsMap {
  [videoId: string]: {
    filename: string;
    thumbnail_path: string | null;
    duration: number;
    overall_score: number;
    usable_segments: StabilitySegment[];
    usable_ratio: number;
    total_usable_duration: number;
  };
}

export const fetchStabilityStatus = (
  projectId: number,
  location?: string
): Promise<StabilityStatus> =>
  api.get(`/api/stability/status/${projectId}`, {
    params: location ? { location } : {},
  }).then((r) => r.data);

export const fetchStabilityStats = (
  projectId: number
): Promise<StabilityStats> =>
  api.get(`/api/stability/stats/${projectId}`).then((r) => r.data);

export const fetchStability = (
  videoId: number
): Promise<StabilityResult | null> =>
  api.get(`/api/stability/${videoId}`).then((r) => r.data).catch((e) => {
    if (e.response?.status === 404) return null;
    throw e;
  });

export const triggerStabilityBatch = (
  projectId: number,
  limit?: number,
  threshold?: number,
  workers?: number,
  location?: string
): Promise<StabilityRunResult> =>
  api
    .post(`/api/stability/run/${projectId}`, null, {
      params: {
        ...(limit ? { limit } : {}),
        ...(threshold ? { threshold } : {}),
        ...(workers ? { workers } : {}),
        ...(location ? { location } : {}),
      },
    })
    .then((r) => r.data);

export const fetchStabilityRunProgress = (
  projectId: number
): Promise<StabilityRunProgress> =>
  api.get(`/api/stability/run-progress/${projectId}`).then((r) => r.data);

export interface BatchReclassifyResult {
  reclassified: number;
  mode: string;
  score_range: [number, number];
}

export const batchReclassify = (
  projectId: number,
  params: {
    min_score: number;
    max_score: number;
    mode: 'fixed' | 'auto_avg' | 'target_segments' | 'target_ratio';
    threshold?: number;
    target_segments?: number;
    target_ratio?: number;
    max_stable_ratio?: number;
  }
): Promise<BatchReclassifyResult> =>
  api
    .post(`/api/stability/batch-reclassify/${projectId}`, null, { params })
    .then((r) => r.data);

export const fetchReclassifyProgress = (
  projectId: number
): Promise<StabilityRunProgress> =>
  api.get(`/api/stability/reclassify-progress/${projectId}`).then((r) => r.data);

export const triggerStabilitySingle = (
  videoId: number,
  threshold?: number
): Promise<StabilityResult> =>
  api
    .post(`/api/stability/run-single/${videoId}`, null, {
      params: threshold ? { threshold } : {},
    })
    .then((r) => r.data);

export const saveStabilitySegments = (
  videoId: number,
  threshold: number,
  stableSegments: StabilitySegment[],
  shakySegments: StabilitySegment[],
  overallScore: number,
  stableRatio: number
): Promise<{ video_id: number; threshold: number }> =>
  api
    .put(`/api/stability/save-segments/${videoId}`, null, {
      params: {
        threshold,
        stable_segments: JSON.stringify(stableSegments),
        shaky_segments: JSON.stringify(shakySegments),
        overall_score: overallScore,
        stable_ratio: stableRatio,
      },
    })
    .then((r) => r.data);

export const fetchUsableSegments = (
  projectId: number,
  minDuration?: number
): Promise<UsableSegmentsMap> =>
  api
    .get(`/api/stability/usable-segments/${projectId}`, {
      params: minDuration ? { min_duration: minDuration } : {},
    })
    .then((r) => r.data);

// --- Music ---

export interface MusicItem {
  id: number;
  title: string;
  artist: string | null;
  path: string;
  duration: number;
  bpm: number | null;
  mood_tags: string | null;
  beats: number[] | null;
  onsets: number[] | null;
  sections: Array<{ start: number; end: number; index: number }> | null;
  created_at: string | null;
}

export interface MusicAnalysisResult {
  id: number;
  bpm: number;
  beats: number[];
  onsets: number[];
  strength_curve: Array<{ t: number; v: number }>;
  sections: Array<{ start: number; end: number; index: number }>;
  duration: number;
}

export const scanMusic = (
  projectId: number
): Promise<{ imported: number; scan_dir: string }> =>
  api.post(`/api/music/scan/${projectId}`).then((r) => r.data);

export const uploadMusic = (
  projectId: number,
  file: File
): Promise<{ id: number; title: string; path: string; duration: number }> => {
  const formData = new FormData();
  formData.append('file', file);
  return api
    .post(`/api/music/upload/${projectId}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const fetchMusicList = (projectId: number): Promise<MusicItem[]> =>
  api.get(`/api/music/project/${projectId}`).then((r) => r.data);

export const fetchMusic = (musicId: number): Promise<MusicItem> =>
  api.get(`/api/music/${musicId}`).then((r) => r.data);

export const analyzeMusic = (
  musicId: number
): Promise<MusicAnalysisResult> =>
  api.post(`/api/music/${musicId}/analyze`).then((r) => r.data);

export const deleteMusic = (
  musicId: number
): Promise<{ deleted: number }> =>
  api.delete(`/api/music/${musicId}`).then((r) => r.data);

// --- Timeline (DB-backed) ---

export interface TimelineClipItem {
  id: number;
  clip_id: number | null;
  video_id: number;
  position: number;
  source_start: number;
  source_end: number;
  transition: string;
  thumbnail_path: string | null;
  filename: string | null;
}

export interface TimelineSubtitleItem {
  id: number;
  text: string;
  start_time: number;
  end_time: number;
  style: string;
}

export interface TimelineMusicItem {
  id: number;
  music_id: number;
  start_time: number;
  end_time: number;
  volume: number;
  fade_in: number;
  fade_out: number;
  title: string | null;
}

export interface TimelineListItem {
  id: number;
  name: string;
  location_cluster: string | null;
  status: string;
  total_duration: number;
  clip_count: number;
  subtitle_count: number;
  music_count: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface TimelineDetail {
  id: number;
  project_id: number;
  name: string;
  location_cluster: string | null;
  status: string;
  total_duration: number;
  created_at: string | null;
  updated_at: string | null;
  clips: TimelineClipItem[];
  subtitles: TimelineSubtitleItem[];
  music: TimelineMusicItem[];
}

export const fetchTimelines = (
  projectId: number
): Promise<TimelineListItem[]> =>
  api.get(`/api/timelines/${projectId}`).then((r) => r.data);

export const fetchTimelineDetail = (
  projectId: number,
  timelineId: number
): Promise<TimelineDetail> =>
  api.get(`/api/timelines/${projectId}/${timelineId}`).then((r) => r.data);

export const deleteTimeline = (timelineId: number): Promise<{ deleted: number }> =>
  api.delete(`/api/timelines/${timelineId}`).then((r) => r.data);

// --- Thumbnails ---

export const regenerateThumbnail = (videoId: number): Promise<{ thumbnail_path: string }> =>
  api.post(`/api/ingest/regenerate-thumbnail/${videoId}`).then((r) => r.data);

export const regenerateThumbnails = (projectId: number): Promise<{ regenerated: number; failed: number; total: number }> =>
  api.post(`/api/ingest/regenerate-thumbnails/${projectId}`).then((r) => r.data);

// --- Helpers ---

export const thumbnailUrl = (thumbnailPath: string | null, bustCache?: number): string => {
  if (!thumbnailPath) {
    return '';
  }
  const base = `${API_BASE_URL}/thumbnails/${thumbnailPath}`;
  return bustCache ? `${base}?v=${bustCache}` : base;
};

export const mediaStreamUrl = (videoId: number): string =>
  `${API_BASE_URL}/api/media/${videoId}/stream`;

export const musicStreamUrl = (musicId: number): string =>
  `${API_BASE_URL}/api/music/${musicId}/stream`;
