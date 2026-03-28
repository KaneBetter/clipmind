'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchProject,
  fetchVideos,
  fetchAnalysisStatus,
  fetchAnalysisStats,
  fetchMusicList,
  fetchStabilityStatus,
  fetchStabilityStats,
  fetchTimelines,
  triggerIngest,
  fetchIngestProgress,
  syncVideos,
} from '@/lib/api';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';
import { formatDuration } from '@/lib/utils';
import {
  Tooltip,
  XAxis, YAxis, ResponsiveContainer,
  CartesianGrid, Line, Area, ComposedChart, ReferenceLine, PieChart, Pie, Cell,
} from 'recharts';
import SettingsModal from '@/components/settings-modal';
import {
  EditableName,
  StatCard,
  MiniRing,
  DetailStat,
} from '@/components/dashboard-widgets';
import {
  Video,
  Brain,
  Activity,
  Layers,
  Music,
  Upload,
  Sparkles,
  FileOutput,
  Settings,
  Loader2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';

export default function ProjectDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  const { data: project, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId),
  });

  const { data: videoCount } = useQuery({
    queryKey: ['videos', projectId, 'count-video'],
    queryFn: () => fetchVideos(projectId, { media_type: 'video', page_size: 1 }),
  });

  const { data: photoCount } = useQuery({
    queryKey: ['videos', projectId, 'count-photo'],
    queryFn: () => fetchVideos(projectId, { media_type: 'photo', page_size: 1 }),
  });

  const { data: analysisStatus } = useQuery({
    queryKey: ['analysis-status', projectId],
    queryFn: () => fetchAnalysisStatus(projectId),
  });

  const { data: analysisStats } = useQuery({
    queryKey: ['analysis-stats', projectId],
    queryFn: () => fetchAnalysisStats(projectId),
    enabled: (analysisStatus?.analyzed_videos ?? 0) > 0,
  });

  const { data: stabilityStatus } = useQuery({
    queryKey: ['stability-status', projectId],
    queryFn: () => fetchStabilityStatus(projectId),
  });

  const { data: stabilityStats } = useQuery({
    queryKey: ['stability-stats', projectId],
    queryFn: () => fetchStabilityStats(projectId),
    enabled: (stabilityStatus?.analyzed_videos ?? 0) > 0,
  });

  const { data: timelines } = useQuery({
    queryKey: ['timelines', projectId],
    queryFn: () => fetchTimelines(projectId),
  });

  const { data: musicList } = useQuery({
    queryKey: ['music', projectId],
    queryFn: () => fetchMusicList(projectId),
  });

  const { data: ingestProgress } = useQuery({
    queryKey: ['ingest-progress', projectId],
    queryFn: () => fetchIngestProgress(projectId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'running') return 1000;
      return false;
    },
  });

  const isIngesting = ingestProgress?.status === 'running';

  const ingestMutation = useMutation({
    mutationFn: () => triggerIngest(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ingest-progress', projectId] });
    },
    onError: () => {
      setActionMessage({ text: 'Import failed', type: 'error' });
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncVideos(projectId),
    onSuccess: (data) => {
      if (data.hidden_count > 0) {
        setActionMessage({
          text: t('dashboard.syncHidden').replace('{count}', String(data.hidden_count)),
          type: 'success',
        });
        queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
        queryClient.invalidateQueries({ queryKey: ['project', projectId] });
        queryClient.invalidateQueries({ queryKey: ['analysis-status', projectId] });
        queryClient.invalidateQueries({ queryKey: ['stability-status', projectId] });
      } else {
        setActionMessage({ text: t('dashboard.syncOk'), type: 'success' });
      }
    },
    onError: () => {
      setActionMessage({ text: 'Sync failed', type: 'error' });
    },
  });

  if (ingestProgress?.status === 'completed' && !actionMessage) {
    setActionMessage({
      text: `Import completed: ${ingestProgress.done} files imported`,
      type: 'success',
    });
    queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">{t('dashboard.projectNotFound')}</p>
      </div>
    );
  }

  const videos = videoCount?.total ?? 0;
  const photos = photoCount?.total ?? 0;
  const analyzed = analysisStatus?.analyzed_videos ?? 0;
  const stabilityAnalyzed = stabilityStatus?.analyzed_videos ?? 0;
  const musicCount = musicList?.length ?? 0;
  const timelineCount = timelines?.length ?? 0;
  const analysisPct = videos > 0 ? Math.round((analyzed / videos) * 100) : 0;
  const stabilityPct = videos > 0 ? Math.round((stabilityAnalyzed / videos) * 100) : 0;

  const topMood = analysisStats?.mood_distribution
    ? Object.entries(analysisStats.mood_distribution).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '-'
    : '-';

  const totalTimelineClips = timelines?.reduce((sum, tl) => sum + tl.clip_count, 0) ?? 0;
  const totalTimelineDuration = timelines?.reduce((sum, tl) => sum + tl.total_duration, 0) ?? 0;

  return (
    <div className="p-4 md:p-5 max-w-full">
      <div className="flex items-center justify-between mb-4">
        <EditableName projectId={projectId} name={project.name} />
        <div className="flex items-center gap-1">
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={t('dashboard.syncFiles')}
          >
            <RefreshCw className={`w-5 h-5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Project Settings"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`mb-4 p-3 rounded-lg flex items-center gap-2 text-sm ${
            actionMessage.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {actionMessage.text}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 mb-4">
        <StatCard
          href={`/projects/${projectId}/videos`}
          icon={<Video className="w-5 h-5 text-blue-500" />}
          label="Media"
          value={videos + photos}
          subtitle={`${videos} videos · ${photos} photos`}
          hoverColor="hover:border-blue-400"
        />
        <StatCard
          href={`/projects/${projectId}/analysis`}
          icon={<Brain className="w-5 h-5 text-purple-500" />}
          label="AI Analyzed"
          value={`${analyzed}/${videos}`}
          hoverColor="hover:border-purple-400"
          progress={analysisPct}
          progressColor="bg-purple-500"
        />
        <StatCard
          href={`/projects/${projectId}/stability`}
          icon={<Activity className="w-5 h-5 text-teal-500" />}
          label="Stability"
          value={`${stabilityAnalyzed}/${videos}`}
          hoverColor="hover:border-teal-400"
          progress={stabilityPct}
          progressColor="bg-teal-500"
        />
        <StatCard
          href={`/projects/${projectId}/timeline`}
          icon={<Layers className="w-5 h-5 text-indigo-500" />}
          label="Timelines"
          value={timelineCount}
          hoverColor="hover:border-indigo-400"
        />
        <StatCard
          href={`/projects/${projectId}/music`}
          icon={<Music className="w-5 h-5 text-pink-500" />}
          label={t('music.title')}
          value={musicCount}
          hoverColor="hover:border-pink-400"
        />
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 mb-4">
        {/* AI Analysis Card */}
        <Link
          href={`/projects/${projectId}/analysis`}
          className="xl:col-span-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-purple-400 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Brain className="w-4 h-4 text-purple-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">AI Analysis</h3>
            </div>
            <MiniRing pct={analysisPct} color="stroke-purple-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DetailStat label="Analyzed" value={analyzed} />
            <DetailStat label="Avg Quality" value={analysisStats?.avg_quality ? analysisStats.avg_quality.toFixed(1) : '-'} />
            <DetailStat label="Highlights" value={analysisStats?.highlight_count ?? 0} />
            <DetailStat label="Top Mood" value={topMood} />
          </div>
        </Link>

        {/* Stability Card */}
        <Link
          href={`/projects/${projectId}/stability`}
          className="xl:col-span-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-teal-400 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-teal-100 dark:bg-teal-900/30 flex items-center justify-center">
                <Activity className="w-4 h-4 text-teal-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Stability</h3>
            </div>
            <MiniRing pct={stabilityPct} color="stroke-teal-500" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <DetailStat label="Analyzed" value={stabilityStats?.total_analyzed ?? 0} />
            <DetailStat label="Avg Score" value={stabilityStats?.avg_score ? stabilityStats.avg_score.toFixed(1) : '-'} />
            <DetailStat label="Stable Ratio" value={stabilityStats?.avg_stable_ratio ? `${(stabilityStats.avg_stable_ratio * 100).toFixed(0)}%` : '-'} />
            <DetailStat label="Usable" value={stabilityStats?.total_usable_duration ? formatDuration(stabilityStats.total_usable_duration) : '-'} />
          </div>
        </Link>

        {/* Timeline Card */}
        <Link
          href={`/projects/${projectId}/timeline`}
          className="xl:col-span-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-indigo-400 transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Layers className="w-4 h-4 text-indigo-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Timelines</h3>
            </div>
            <span className="text-base font-bold text-indigo-500">{timelineCount}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <DetailStat label="Total Clips" value={totalTimelineClips} />
            <DetailStat label="Duration" value={totalTimelineDuration > 0 ? formatDuration(totalTimelineDuration) : '-'} />
          </div>
          {timelines && timelines.length > 0 && (
            <div className="space-y-1">
              {timelines.slice(0, 3).map((tl) => (
                <div
                  key={tl.id}
                  className="text-xs text-gray-500 dark:text-gray-400 truncate px-2 py-1 bg-gray-50 dark:bg-gray-800 rounded"
                >
                  {tl.name}
                </div>
              ))}
              {timelines.length > 3 && (
                <div className="text-xs text-gray-400 dark:text-gray-500 px-2">
                  +{timelines.length - 3} more
                </div>
              )}
            </div>
          )}
        </Link>
      </div>
      {analysisStats && analysisStats.total_analyzed > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-12 gap-3 mb-4 xl:auto-rows-fr">
          {/* Mood Pie Chart */}
          <DashboardChart title="Mood Distribution" className="xl:col-span-3">
            <MoodPieChart data={analysisStats.mood_distribution} />
          </DashboardChart>
          {/* Scene Bar Chart */}
          <DashboardChart title="Scene Categories" className="xl:col-span-4">
            <SceneBarChart data={analysisStats.scene_distribution} />
          </DashboardChart>
          {stabilityStats && stabilityStats.total_analyzed > 0 && (
            <DashboardChart title="Stability Score Trend" className="xl:col-span-5">
              <StabilityTrendChart stats={stabilityStats} />
            </DashboardChart>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <button
          onClick={() => ingestMutation.mutate()}
          disabled={isIngesting || ingestMutation.isPending}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-blue-400 rounded-xl p-4 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            {isIngesting ? (
              <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
            ) : (
              <Upload className="w-5 h-5 text-blue-500 group-hover:scale-110 transition-transform" />
            )}
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.importMedia')}</h3>
          </div>
          {isIngesting ? (
            <div>
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>
                  {ingestProgress?.phase === 'scanning'
                    ? 'Scanning...'
                    : `${ingestProgress?.done ?? 0} / ${ingestProgress?.total ?? '?'}`}
                </span>
                <span>{ingestProgress?.percent ?? 0}%</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${ingestProgress?.percent ?? 0}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.importDesc')}</p>
          )}
        </button>

        <Link
          href={`/projects/${projectId}/analysis`}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-purple-400 rounded-xl p-4 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <Brain className="w-5 h-5 text-purple-500 group-hover:scale-110 transition-transform" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.aiAnalysis')}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.aiAnalysisDesc')}</p>
        </Link>

        <Link
          href={`/projects/${projectId}/copywrite`}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-amber-400 rounded-xl p-4 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.aiCopywrite')}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.aiCopywriteDesc')}</p>
        </Link>

        <Link
          href={`/projects/${projectId}/skills`}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-green-400 rounded-xl p-4 text-left transition-all group"
        >
          <div className="flex items-center gap-3 mb-2">
            <FileOutput className="w-5 h-5 text-green-500 group-hover:scale-110 transition-transform" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('dashboard.exportCapcut')}</h3>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">{t('dashboard.exportDesc')}</p>
        </Link>
      </div>
      {/* Settings Modal */}
      <SettingsModal
        projectId={projectId}
        name={project.name}
        description={project.description}
        videoDir={project.video_dir}
        photoDir={project.photo_dir}
        musicDir={project.music_dir}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
}

const CHART_COLORS = ['#0f766e', '#14b8a6', '#2dd4bf', '#99f6e4', '#7c3aed', '#a78bfa', '#0f172a', '#475569'];
const DASHBOARD_SCENE_BADGES: Record<string, string> = {
  landscape: 'bg-blue-50 text-blue-700',
  people: 'bg-amber-50 text-amber-700',
  food: 'bg-red-50 text-red-700',
  transport: 'bg-gray-100 text-gray-700',
  accommodation: 'bg-purple-50 text-purple-700',
  activity: 'bg-green-50 text-green-700',
  cityscape: 'bg-cyan-50 text-cyan-700',
  wildlife: 'bg-lime-50 text-lime-700',
  other: 'bg-gray-50 text-gray-500',
};
const DASHBOARD_MOOD_BADGES: Record<string, string> = {
  epic: 'bg-red-50 text-red-700',
  warm: 'bg-orange-50 text-orange-700',
  joyful: 'bg-yellow-50 text-yellow-700',
  calm: 'bg-blue-50 text-blue-700',
  tense: 'bg-gray-100 text-gray-700',
  melancholy: 'bg-purple-50 text-purple-700',
  adventurous: 'bg-emerald-50 text-emerald-700',
  other: 'bg-gray-50 text-gray-500',
};

function DashboardChart({
  title,
  children,
  className = '',
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900 ${className}`}>
      <h3 className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</h3>
      <div className="min-h-0 flex-1 overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function MoodPieChart({ data }: { data: Record<string, number> }) {
  const items = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }));

  if (items.length === 0) return <p className="text-xs text-gray-400">No data</p>;

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const lead = items[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-white p-3 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">{total} tagged videos</p>
        <div className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          {items.length} moods
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[156px_minmax(0,1fr)] items-center gap-2.5 overflow-hidden">
        <div className="flex h-full min-h-[156px] items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-800">
          <ResponsiveContainer width="100%" height={156}>
            <PieChart>
              <Pie
                data={items}
                dataKey="value"
                nameKey="name"
                innerRadius={34}
                outerRadius={58}
                paddingAngle={2}
                stroke="rgba(255,255,255,0.9)"
                strokeWidth={2}
              >
                {items.map((item, index) => (
                  <Cell key={item.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [`${value} videos`, 'Count']}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.2)',
                  boxShadow: '0 12px 40px rgba(15,23,42,0.12)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 space-y-1.5 overflow-hidden">
          <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Lead Mood</p>
            <div className="mt-1 flex items-end justify-between gap-2">
              <div>
                <div className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${DASHBOARD_MOOD_BADGES[lead.name] || DASHBOARD_MOOD_BADGES.other}`}>
                  {lead.name}
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  {Math.round((lead.value / total) * 100)}% share of visible tags
                </p>
              </div>
              <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{lead.value}</p>
            </div>
          </div>

          <div className="space-y-1">
            {items.slice(0, 4).map((item, index) => {
              const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
              return (
                <div key={item.name} className="rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${DASHBOARD_MOOD_BADGES[item.name] || DASHBOARD_MOOD_BADGES.other}`}>
                        {item.name}
                      </span>
                    </div>
                    <span className="text-[11px] font-semibold text-gray-900 dark:text-gray-100">
                      {item.value} <span className="font-normal text-gray-400">{pct}%</span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneBarChart({ data }: { data: Record<string, number> }) {
  const items = Object.entries(data)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, value]) => ({ name, value }));

  if (items.length === 0) return <p className="text-xs text-gray-400">No data</p>;

  const total = items.reduce((sum, item) => sum + item.value, 0);
  const peak = items[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-white p-3 dark:bg-gray-900">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Top categories in descending frequency</p>
        <div className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
          Top 6
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_160px] gap-2.5 overflow-hidden">
        <div className="overflow-hidden rounded-lg bg-gray-50 p-2 dark:bg-gray-800">
          <ResponsiveContainer width="100%" height={164}>
            <ComposedChart data={items} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="sceneArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#7c3aed" stopOpacity={0.24} />
                  <stop offset="100%" stopColor="#7c3aed" stopOpacity={0.03} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.16)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={34} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: '#7c3aed', strokeDasharray: '4 4' }}
                contentStyle={{
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.2)',
                  boxShadow: '0 12px 40px rgba(15,23,42,0.12)',
                }}
                formatter={(value) => [`${value} tags`, 'Count']}
              />
              <Area type="monotone" dataKey="value" fill="url(#sceneArea)" stroke="none" />
              <Line type="monotone" dataKey="value" stroke="#7c3aed" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#ffffff' }} activeDot={{ r: 5, fill: '#8b5cf6' }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        <div className="min-h-0 space-y-1.5 overflow-hidden">
          <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500 dark:text-gray-400">Peak Scene</p>
            <div className={`mt-1 inline-block rounded px-2 py-0.5 text-xs font-medium ${DASHBOARD_SCENE_BADGES[peak.name] || DASHBOARD_SCENE_BADGES.other}`}>
              {peak.name}
            </div>
            <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
              {Math.round((peak.value / total) * 100)}% of visible scene tags
            </p>
            <p className="mt-1.5 text-xl font-semibold text-gray-900 dark:text-gray-100">{peak.value}</p>
          </div>

          {items.slice(0, 3).map((item, index) => {
            const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
            return (
              <div key={item.name} className="rounded-lg bg-gray-50 px-2.5 py-1.5 dark:bg-gray-800">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                    />
                    <span className={`truncate rounded px-1.5 py-0.5 text-[11px] font-medium ${DASHBOARD_SCENE_BADGES[item.name] || DASHBOARD_SCENE_BADGES.other}`}>
                      {item.name}
                    </span>
                  </div>
                  <span className="text-[12px] font-semibold text-gray-900 dark:text-gray-100">{item.value}</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${pct}%`,
                      background: `linear-gradient(90deg, ${CHART_COLORS[index % CHART_COLORS.length]}, ${CHART_COLORS[(index + 1) % CHART_COLORS.length]})`,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StabilityTrendChart({
  stats,
}: {
  stats: {
    avg_score: number;
    stable_count: number;
    shaky_count: number;
    avg_stable_ratio: number;
    score_distribution: Record<string, number>;
    total_analyzed: number;
  };
}) {
  const order = ['0-20', '21-40', '41-60', '61-80', '81-100'];
  const points = order.map((range) => {
    const count = stats.score_distribution[range] ?? 0;
    return {
      range,
      count,
      pct: stats.total_analyzed > 0 ? Math.round((count / stats.total_analyzed) * 100) : 0,
    };
  });

  const peak = points.reduce((best, current) => (current.count > best.count ? current : best), points[0]);
  const stablePct = stats.total_analyzed > 0 ? Math.round((stats.stable_count / stats.total_analyzed) * 100) : 0;
  const shakyPct = stats.total_analyzed > 0 ? Math.round((stats.shaky_count / stats.total_analyzed) * 100) : 0;

  return (
    <div className="grid h-full min-h-0 grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1.7fr)_220px]">
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-teal-100/80 bg-[linear-gradient(180deg,rgba(20,184,166,0.08),rgba(255,255,255,0))] p-3 dark:border-teal-900/40 dark:bg-[linear-gradient(180deg,rgba(20,184,166,0.14),rgba(17,24,39,0))]">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-600 dark:text-teal-400">
              Score Distribution
            </p>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Most videos cluster in <span className="font-semibold text-gray-900 dark:text-gray-100">{peak.range}</span>
            </p>
          </div>
          <div className="rounded-xl bg-white/80 px-3 py-1.5 shadow-sm ring-1 ring-black/5 backdrop-blur dark:bg-gray-900/70 dark:ring-white/10">
            <p className="text-[10px] uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500">Avg Score</p>
            <p className="text-xl font-semibold text-gray-900 dark:text-gray-100">{stats.avg_score.toFixed(1)}</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
        <ResponsiveContainer width="100%" height={148}>
          <ComposedChart data={points} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="stabilityArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#14b8a6" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(148,163,184,0.18)" />
            <XAxis dataKey="range" tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} width={26} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: '#14b8a6', strokeDasharray: '4 4' }}
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(148,163,184,0.2)',
                boxShadow: '0 12px 40px rgba(15,23,42,0.12)',
              }}
              formatter={(value, name) => {
                const numericValue = typeof value === 'number' ? value : Number(value ?? 0);
                return [
                  name === 'count' ? `${numericValue} videos` : `${numericValue}%`,
                  name === 'count' ? 'Count' : 'Share',
                ];
              }}
            />
            <ReferenceLine y={Math.max(1, Math.round(stats.total_analyzed / points.length))} stroke="rgba(20,184,166,0.45)" strokeDasharray="5 5" />
            <Area type="monotone" dataKey="count" fill="url(#stabilityArea)" stroke="none" />
            <Line type="monotone" dataKey="count" stroke="#0f766e" strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: '#ffffff' }} activeDot={{ r: 5, fill: '#14b8a6' }} />
          </ComposedChart>
        </ResponsiveContainer>
        </div>
      </div>

      <div className="grid h-full min-h-0 grid-cols-3 gap-2 overflow-hidden xl:grid-cols-1">
        <TrendStatCard
          label="Stable Videos"
          value={`${stablePct}%`}
          subtitle={`${stats.stable_count} / ${stats.total_analyzed}`}
          tone="teal"
        />
        <TrendStatCard
          label="Shaky Videos"
          value={`${shakyPct}%`}
          subtitle={`${stats.shaky_count} / ${stats.total_analyzed}`}
          tone="amber"
        />
        <TrendStatCard
          label="Avg Usable Ratio"
          value={`${Math.round(stats.avg_stable_ratio * 100)}%`}
          subtitle="Stable footage share"
          tone="slate"
        />
      </div>
    </div>
  );
}

function TrendStatCard({
  label,
  value,
  subtitle,
  tone,
}: {
  label: string;
  value: string;
  subtitle: string;
  tone: 'teal' | 'amber' | 'slate';
}) {
  const tones = {
    teal: 'border-teal-200 bg-teal-50/70 text-teal-700 dark:border-teal-900/40 dark:bg-teal-950/30 dark:text-teal-300',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
    slate: 'border-slate-200 bg-slate-50/70 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
  };

  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[10px] font-medium uppercase tracking-[0.14em] opacity-70">{label}</p>
      <p className="mt-1.5 text-xl font-semibold">{value}</p>
      <p className="mt-0.5 text-[11px] opacity-70">{subtitle}</p>
    </div>
  );
}
