'use client';

import { use, useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n-context';
import {
  fetchModels,
  fetchAnalysisStatus,
  fetchAnalysisStats,
  fetchAnalysisStorageUsage,
  clearAnalysisStorage,
  fetchVideos,
  estimateAnalysisWithModel,
  triggerAnalysisWithModel,
  fetchAnalysisRunProgress,
  thumbnailUrl,
  mediaStreamUrl,
} from '@/lib/api';
import type { GeminiModel, AnalysisStats, AnalysisStatus, AnalysisRunProgress, Video } from '@/lib/api';
import {
  Brain,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Star,
  Gauge,
  Eye,
  BarChart3,
} from 'lucide-react';
import LocationSelector from '@/components/location-selector';
import Link from 'next/link';
import { formatBytes } from '@/lib/utils';

export default function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [selectedModel, setSelectedModel] = useState<string>('gemini-2.5-flash');
  const [analysisLimit, setAnalysisLimit] = useState<number>(50);
  const [analysisWorkers, setAnalysisWorkers] = useState<number>(2);
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [resultsPage, setResultsPage] = useState(1);
  const [resultSort, setResultSort] = useState('quality_score');
  const [resultSortOrder, setResultSortOrder] = useState('desc');
  const [resultSearch, setResultSearch] = useState('');
  const [previewVideo, setPreviewVideo] = useState<Video | null>(null);

  // Queries
  const {
    data: models,
    isLoading: modelsLoading,
    error: modelsError,
  } = useQuery({
    queryKey: ['models'],
    queryFn: fetchModels,
  });

  const { data: status } = useQuery({
    queryKey: ['analysis-status', projectId, selectedLocation],
    queryFn: () => fetchAnalysisStatus(projectId, selectedLocation),
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ['analysis-stats', projectId],
    queryFn: () => fetchAnalysisStats(projectId),
    enabled: (status?.analyzed_videos ?? 0) > 0,
  });

  const {
    data: storageUsage,
    error: storageUsageError,
  } = useQuery({
    queryKey: ['analysis-storage-usage'],
    queryFn: fetchAnalysisStorageUsage,
    refetchInterval: (query) => {
      return query.state.data ? 30000 : 10000;
    },
  });

  // Analyzed videos list
  const { data: analyzedVideos } = useQuery({
    queryKey: ['analyzed-videos', projectId, resultsPage, resultSort, resultSortOrder, resultSearch, selectedLocation],
    queryFn: () =>
      fetchVideos(projectId, {
        page: resultsPage,
        page_size: 20,
        sort_by: resultSort,
        sort_order: resultSortOrder,
        min_quality: 0.1,
        ...(resultSearch ? { search: resultSearch } : {}),
        ...(selectedLocation ? { location_label: selectedLocation } : {}),
      }),
    enabled: (status?.analyzed_videos ?? 0) > 0,
  });

  const [costEstimate, setCostEstimate] = useState<Record<string, any> | null>(null);

  // Mutations
  const estimateMutation = useMutation({
    mutationFn: () => estimateAnalysisWithModel(projectId, selectedModel),
    onSuccess: (data) => {
      setCostEstimate(data);
    },
    onError: () => setMessage({ text: 'Cost estimation failed', type: 'error' }),
  });

  const clearStorageMutation = useMutation({
    mutationFn: clearAnalysisStorage,
    onSuccess: (data) => {
      setMessage({
        text: `Gemini storage cleared: deleted ${data.deleted} files${data.failed ? `, ${data.failed} failed` : ''}`,
        type: data.failed > 0 ? 'error' : 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['analysis-storage-usage'] });
    },
    onError: () => setMessage({ text: 'Failed to clear Gemini storage', type: 'error' }),
  });

  // Background run progress polling
  const { data: runProgress } = useQuery({
    queryKey: ['analysis-run-progress', projectId],
    queryFn: () => fetchAnalysisRunProgress(projectId),
    refetchInterval: (query) => {
      const st = query.state.data?.status;
      if (st === 'running') return 2000;
      return false;
    },
  });

  const isRunning = runProgress?.status === 'running';

  const prevRunStatus = useRef(runProgress?.status);
  useEffect(() => {
    if (prevRunStatus.current === 'running' && runProgress?.status === 'completed') {
      const lastError = runProgress.last_error ? ` Last error: ${runProgress.last_error}.` : '';
      setMessage({
        text: `Analysis complete: ${runProgress.done} succeeded, ${runProgress.errors ?? 0} failed.${lastError}`,
        type: (runProgress.errors ?? 0) > 0 ? 'error' : 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['analysis-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['analysis-stats', projectId] });
    }
    prevRunStatus.current = runProgress?.status;
  }, [runProgress?.status, runProgress?.done, runProgress?.errors, runProgress?.last_error, projectId, queryClient]);

  const analysisMutation = useMutation({
    mutationFn: () => triggerAnalysisWithModel(projectId, selectedModel, analysisLimit || undefined, selectedLocation, analysisWorkers),
    onSuccess: () => {
      setMessage({ text: 'Analysis started in background...', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['analysis-run-progress', projectId] });
    },
    onError: () => setMessage({ text: 'Failed to start analysis', type: 'error' }),
  });

  const progressPercent = status
    ? status.total_videos > 0
      ? Math.round((status.analyzed_videos / status.total_videos) * 100)
      : 0
    : 0;

  return (
    <div className="p-6 max-w-full">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-500" />
            {t('analysis.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('analysis.subtitle')}
          </p>
        </div>
        <LocationSelector projectId={projectId} value={selectedLocation} onChange={setSelectedLocation} />
      </div>

      {/* Model Selector + Overview */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {/* Model Selector */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('analysis.selectModel')}</label>
            <div className="space-y-2">
              {modelsLoading && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-500 dark:text-gray-400">
                  Loading models...
                </div>
              )}
              {modelsError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-400">
                  Failed to load models.
                </div>
              )}
              {!modelsLoading && !modelsError && models?.length === 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm text-gray-500 dark:text-gray-400">
                  No models available.
                </div>
              )}
              {models?.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedModel === model.id
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30'
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                  } ${model.deprecated ? 'opacity-60' : ''}`}
                >
                  <input
                    type="radio"
                    name="model"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={() => setSelectedModel(model.id)}
                    className="text-purple-500 focus:ring-purple-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{model.label}</span>
                      {model.recommended && (
                        <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                          {t('analysis.recommended')}
                        </span>
                      )}
                      {model.deprecated && (
                        <span className="text-xs bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">
                          {t('analysis.deprecated')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {model.standard_free ? (
                        <span className="text-green-600 font-medium">FREE</span>
                      ) : (
                        `$${model.input_per_million}/M input · $${model.output_per_million}/M output`
                      )}
                      {model.deprecated && ` · EOL: ${model.deprecated}`}
                    </p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Progress & Actions */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('analysis.progress')}</label>
            <div className="space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">
                    Analyzed {status?.analyzed_videos ?? 0} / {status?.total_videos ?? 0}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400">{progressPercent}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                  <div
                    className="bg-purple-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {status && status.unanalyzed_videos > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {status.unanalyzed_videos} {t('analysis.videosPending')}
                  </p>
                )}
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500 dark:text-gray-400">Gemini file storage</span>
                  <div className="flex items-center gap-2">
                    {storageUsage ? (
                      <span className="text-gray-500 dark:text-gray-400">
                        {formatBytes(storageUsage.total_bytes)} / {formatBytes(storageUsage.quota_bytes)}
                      </span>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">-</span>
                    )}
                    <button
                      type="button"
                      onClick={() => clearStorageMutation.mutate()}
                      disabled={clearStorageMutation.isPending}
                      className="px-2 py-0.5 text-[11px] rounded-md border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                    >
                      {clearStorageMutation.isPending ? 'Clearing...' : 'Clear'}
                    </button>
                  </div>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      (storageUsage?.usage_percent ?? 0) >= 90
                        ? 'bg-red-500'
                        : (storageUsage?.usage_percent ?? 0) >= 70
                          ? 'bg-yellow-500'
                          : 'bg-blue-500'
                    }`}
                    style={{ width: `${Math.min(storageUsage?.usage_percent ?? 0, 100)}%` }}
                  />
                </div>
                {storageUsage ? (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {storageUsage.file_count.toLocaleString()} files · {storageUsage.usage_percent}% used
                  </p>
                ) : storageUsageError ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Unable to load Gemini storage usage
                  </p>
                ) : null}
              </div>

              {/* Batch size selector */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('analysis.batchSize')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 0, label: 'All' },
                    { value: 5, label: '5' },
                    { value: 10, label: '10' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setAnalysisLimit(opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        analysisLimit === opt.value
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={0}
                    placeholder="Custom"
                    value={analysisLimit || ''}
                    onChange={(e) => setAnalysisLimit(parseInt(e.target.value) || 0)}
                    className="w-20 px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Workers selector */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Workers</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 4, 8].map((w) => (
                    <button
                      key={w}
                      onClick={() => setAnalysisWorkers(w)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        analysisWorkers === w
                          ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action buttons */}
              <div className="space-y-2">
              <div className="flex gap-2">
                <button
                  onClick={() => analysisMutation.mutate()}
                  disabled={analysisMutation.isPending || isRunning || (status?.unanalyzed_videos ?? 0) === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isRunning || analysisMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {isRunning
                    ? `Analyzing ${runProgress?.done ?? 0}/${runProgress?.total ?? '?'}...`
                    : analysisLimit > 0
                      ? `${t('analysis.analyzeAll')} ${analysisLimit}`
                      : t('analysis.analyzeAll')}
                </button>
                <button
                  onClick={() => estimateMutation.mutate()}
                  disabled={estimateMutation.isPending}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm rounded-lg transition-colors"
                >
                  {estimateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <BarChart3 className="w-4 h-4" />
                  )}
                  {t('analysis.estimateCost')}
                </button>
              </div>
              {isRunning && runProgress && (runProgress.total ?? 0) > 0 && (
                <div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${runProgress.percent ?? 0}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {runProgress.done}/{runProgress.total} done, {runProgress.errors ?? 0} errors
                  </p>
                  {runProgress.last_error && (
                    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                      {runProgress.last_error}
                    </p>
                  )}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`mb-6 p-3 rounded-lg flex items-center gap-2 text-sm ${
            message.type === 'success'
              ? 'bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
              : 'bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Cost Estimate Panel */}
      {costEstimate && costEstimate.video_count > 0 && (
        <div className="mb-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            Cost Estimate — {costEstimate.video_count} videos ({costEstimate.model_label})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Free Tier */}
            <div className="border border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-900/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-300 text-xs font-bold rounded">FREE</span>
                <span className="text-sm font-medium text-green-800 dark:text-green-200">Free Tier</span>
              </div>
              <div className="space-y-1.5 text-xs text-green-700 dark:text-green-300">
                <p>Cost: <span className="font-bold text-lg">$0.00</span></p>
                <p>Rate: {costEstimate.free_tier.rpm} req/min, {costEstimate.free_tier.rpd} req/day</p>
                <p>Time: ~{costEstimate.free_tier.est_days} day{costEstimate.free_tier.est_days > 1 ? 's' : ''} to complete all</p>
                <p className="text-green-600 dark:text-green-400 italic">No credit card needed</p>
              </div>
            </div>
            {/* Paid Tier */}
            <div className="border border-purple-200 dark:border-purple-800 rounded-lg p-4 bg-purple-50 dark:bg-purple-900/20">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 text-xs font-bold rounded">PAID</span>
                <span className="text-sm font-medium text-purple-800 dark:text-purple-200">Pay-as-you-go</span>
              </div>
              <div className="space-y-1.5 text-xs text-purple-700 dark:text-purple-300">
                <p>Cost: <span className="font-bold text-lg">${costEstimate.paid_tier.cost_usd.toFixed(2)}</span></p>
                <p>Rate: {costEstimate.paid_tier.rpm} req/min, unlimited/day</p>
                <p>Time: ~{costEstimate.paid_tier.est_minutes} min to complete all</p>
                <p className="text-purple-600 dark:text-purple-400 italic">Google AI Studio billing required</p>
              </div>
            </div>
          </div>
          <button
            onClick={() => setCostEstimate(null)}
            className="mt-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Stats Section - only show when there are analyzed videos */}
      {stats && stats.total_analyzed > 0 && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-xs font-medium">{t('analysis.analyzed')}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.total_analyzed}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <Star className="w-4 h-4" />
                <span className="text-xs font-medium">{t('dashboard.highlights')}</span>
              </div>
              <p className="text-2xl font-bold text-yellow-500">{stats.highlight_count}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <Gauge className="w-4 h-4" />
                <span className="text-xs font-medium">{t('dashboard.avgQuality')}</span>
              </div>
              <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{stats.avg_quality}</p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs font-medium">{t('analysis.issuesFound')}</span>
              </div>
              <p className="text-2xl font-bold text-orange-500">
                {Object.values(stats.issues_summary).reduce((a, b) => a + b, 0)}
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
                <BarChart3 className="w-4 h-4" />
                <span className="text-xs font-medium">{t('analysis.cost')}</span>
              </div>
              <p className="text-lg font-bold text-green-600">${stats.total_cost_usd.toFixed(4)}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {stats.total_cost_tokens.toLocaleString()} tokens
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {Object.entries(stats.cost_by_model).map(([m, c]) => `${m.replace('gemini-', '')}: $${c.toFixed(4)}`).join(' · ')}
              </p>
            </div>
          </div>

          {/* Distribution Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            {/* Scene Distribution */}
            <DistributionCard
              title={t('analysis.sceneDistribution')}
              data={stats.scene_distribution}
              colorMap={{
                landscape: '#3b82f6',
                people: '#f59e0b',
                food: '#ef4444',
                transport: '#6b7280',
                accommodation: '#8b5cf6',
                activity: '#10b981',
                cityscape: '#06b6d4',
                wildlife: '#84cc16',
                other: '#9ca3af',
              }}
            />

            {/* Mood Distribution */}
            <DistributionCard
              title={t('analysis.moodDistribution')}
              data={stats.mood_distribution}
              colorMap={{
                epic: '#ef4444',
                warm: '#f59e0b',
                joyful: '#fbbf24',
                calm: '#3b82f6',
                tense: '#6b7280',
                melancholy: '#8b5cf6',
                adventurous: '#10b981',
                other: '#9ca3af',
              }}
            />

            {/* Quality Distribution */}
            <DistributionCard
              title={t('analysis.qualityDistribution')}
              data={stats.quality_distribution}
              colorMap={{
                '1-3': '#ef4444',
                '4-5': '#f59e0b',
                '6-7': '#3b82f6',
                '8-9': '#10b981',
                '10': '#8b5cf6',
              }}
            />
          </div>

          {/* Issues Summary */}
          {Object.keys(stats.issues_summary).length > 0 && (
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{t('analysis.issuesSummary')}</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.issues_summary)
                  .sort(([, a], [, b]) => b - a)
                  .map(([issue, count]) => (
                    <span
                      key={issue}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-orange-50 border border-orange-200 text-orange-700 text-sm rounded-full"
                    >
                      {issue}
                      <span className="bg-orange-200 text-orange-800 text-xs px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    </span>
                  ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Analysis Results Table */}
      {analyzedVideos && analyzedVideos.items.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('analysis.results')} ({analyzedVideos.total} videos)
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={resultSearch}
                onChange={(e) => { setResultSearch(e.target.value); setResultsPage(1); }}
                placeholder="Search..."
                className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-3 font-medium">{t('analysis.th.thumb')}</th>
                  <SortableTh field="filename" label={t('analysis.th.file')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <SortableTh field="scene_category" label={t('analysis.th.scene')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <SortableTh field="quality_score" label={t('analysis.th.quality')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <SortableTh field="mood" label={t('analysis.th.mood')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <SortableTh field="is_highlight" label={t('analysis.th.star')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <th className="pb-2 pr-3 font-medium">{t('analysis.th.audio')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('analysis.th.people')}</th>
                  <th className="pb-2 pr-3 font-medium">{t('analysis.th.description')}</th>
                  <SortableTh field="cost_tokens" label={t('analysis.th.tokens')} currentSort={resultSort} currentOrder={resultSortOrder} onSort={(f, o) => { setResultSort(f); setResultSortOrder(o); setResultsPage(1); }} />
                  <th className="pb-2 font-medium">{t('analysis.th.action')}</th>
                </tr>
              </thead>
              <tbody>
                {analyzedVideos.items.map((video) => (
                  <tr
                    key={video.id}
                    className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    {/* Thumbnail */}
                    <td className="py-2 pr-3">
                      {video.thumbnail_path ? (
                        <img
                          src={thumbnailUrl(video.thumbnail_path)}
                          alt={video.filename}
                          className="w-20 h-12 object-cover rounded"
                        />
                      ) : (
                        <div className="w-20 h-12 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center text-gray-400 dark:text-gray-500 text-xs">
                          {t('analysis.noThumb')}
                        </div>
                      )}
                    </td>

                    {/* Filename + location */}
                    <td className="py-2 pr-3">
                      <Link href={`/projects/${projectId}/videos/${video.id}`} className="hover:underline">
                        <p className="font-medium text-blue-600 dark:text-blue-400 text-xs">{video.filename}</p>
                      </Link>
                      {video.location_label && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{video.location_label}</p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500">{video.duration?.toFixed(1)}s</p>
                    </td>

                    {/* Scene category */}
                    <td className="py-2 pr-3">
                      <SceneBadge category={video.scene_category} />
                    </td>

                    {/* Quality score */}
                    <td className="py-2 pr-3">
                      <QualityBadge score={video.quality_score} />
                    </td>

                    {/* Mood */}
                    <td className="py-2 pr-3">
                      <MoodBadge mood={video.mood} />
                    </td>

                    {/* Highlight */}
                    <td className="py-2 pr-3">
                      {video.is_highlight ? (
                        <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600">-</span>
                      )}
                    </td>

                    {/* Audio type */}
                    <td className="py-2 pr-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{video.audio_type || '-'}</span>
                    </td>

                    {/* People count */}
                    <td className="py-2 pr-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{video.people_count ?? '-'}</span>
                    </td>

                    {/* Description */}
                    <td className="py-2 pr-3 max-w-[200px]">
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {video.description || '-'}
                      </p>
                    </td>

                    {/* Tokens */}
                    <td className="py-2 pr-3">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {video.cost_tokens?.toLocaleString() ?? '-'}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-2">
                      <button
                        onClick={() => setPreviewVideo(video)}
                        className="text-purple-500 hover:text-purple-700 transition-colors"
                        title="Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {analyzedVideos.pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setResultsPage((p) => Math.max(1, p - 1))}
                disabled={resultsPage <= 1}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {t('analysis.prev')}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {resultsPage} / {analyzedVideos.pages}
              </span>
              <button
                onClick={() => setResultsPage((p) => Math.min(analyzedVideos.pages, p + 1))}
                disabled={resultsPage >= analyzedVideos.pages}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {t('analysis.next')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Video Preview Modal */}
      {previewVideo && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setPreviewVideo(null)}
        >
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Video player */}
            <div className="bg-black rounded-t-2xl">
              <video
                src={mediaStreamUrl(previewVideo.id)}
                controls
                autoPlay
                className="w-full max-h-[400px] object-contain"
              />
            </div>

            {/* Analysis details */}
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{previewVideo.filename}</h3>
                <button
                  onClick={() => setPreviewVideo(null)}
                  className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 text-xl"
                >
                  &times;
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <DetailItem label="Scene" value={previewVideo.scene_category} />
                <DetailItem
                  label="Quality"
                  value={previewVideo.quality_score?.toString() ?? '-'}
                />
                <DetailItem label="Mood" value={previewVideo.mood} />
                <DetailItem
                  label="Highlight"
                  value={previewVideo.is_highlight ? 'Yes' : 'No'}
                />
                <DetailItem label="Audio" value={previewVideo.audio_type} />
                <DetailItem label="People" value={previewVideo.people_count?.toString() ?? '0'} />
                <DetailItem label="Issues" value={previewVideo.issues === 'none' ? 'None' : previewVideo.issues} />
                <DetailItem label="Duration" value={`${previewVideo.duration?.toFixed(1)}s`} />
                <DetailItem label="Location" value={previewVideo.location_label} />
                <DetailItem
                  label="Captured"
                  value={
                    previewVideo.captured_at
                      ? new Date(previewVideo.captured_at).toLocaleString('en-US')
                      : '-'
                  }
                />
                <DetailItem label="Model" value={previewVideo.model_version?.replace('gemini-', '')} />
                <DetailItem label="Token" value={previewVideo.cost_tokens?.toLocaleString()} />
              </div>

              {previewVideo.description && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Description</p>
                  <p className="text-sm text-gray-700 dark:text-gray-300">{previewVideo.description}</p>
                </div>
              )}

              {previewVideo.segments && previewVideo.segments.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Timeline Segments</p>
                  <div className="space-y-1">
                    {previewVideo.segments.map((seg, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-purple-600 font-mono w-24 shrink-0">
                          {seg.start_sec.toFixed(1)}s - {seg.end_sec.toFixed(1)}s
                        </span>
                        <span className="text-gray-700 dark:text-gray-300">{seg.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Distribution Card Component ---

function DistributionCard({
  title,
  data,
  colorMap,
}: {
  title: string;
  data: Record<string, number>;
  colorMap: Record<string, string>;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return null;

  const sorted = Object.entries(data).sort(([, a], [, b]) => b - a);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{title}</h3>
      <div className="space-y-2">
        {sorted.map(([key, count]) => {
          const percent = Math.round((count / total) * 100);
          const color = colorMap[key] || '#9ca3af';
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="text-gray-600 dark:text-gray-400">{key}</span>
                <span className="text-gray-400 dark:text-gray-500">
                  {count} ({percent}%)
                </span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                <div
                  className="h-1.5 rounded-full transition-all"
                  style={{ width: `${percent}%`, backgroundColor: color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Badge Components ---

const SCENE_COLORS: Record<string, string> = {
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

function SceneBadge({ category }: { category: string | null }) {
  if (!category) return <span className="text-gray-300 text-xs">-</span>;
  const cls = SCENE_COLORS[category] || SCENE_COLORS.other;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {category}
    </span>
  );
}

function QualityBadge({ score }: { score: number | null }) {
  if (score === null || score === undefined) return <span className="text-gray-300 text-xs">-</span>;
  let cls = 'text-gray-600';
  if (score >= 8) cls = 'text-green-600 font-bold';
  else if (score >= 6) cls = 'text-blue-600';
  else if (score >= 4) cls = 'text-amber-600';
  else cls = 'text-red-600';
  return <span className={`text-xs ${cls}`}>{score.toFixed(1)}</span>;
}

const MOOD_COLORS: Record<string, string> = {
  epic: 'bg-red-50 text-red-700',
  warm: 'bg-orange-50 text-orange-700',
  joyful: 'bg-yellow-50 text-yellow-700',
  calm: 'bg-blue-50 text-blue-700',
  tense: 'bg-gray-100 text-gray-700',
  melancholy: 'bg-purple-50 text-purple-700',
  adventurous: 'bg-emerald-50 text-emerald-700',
  other: 'bg-gray-50 text-gray-500',
};

function MoodBadge({ mood }: { mood: string | null }) {
  if (!mood) return <span className="text-gray-300 text-xs">-</span>;
  const cls = MOOD_COLORS[mood] || MOOD_COLORS.other;
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {mood}
    </span>
  );
}

function DetailItem({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
      <p className="text-xs text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 mt-0.5">{value || '-'}</p>
    </div>
  );
}

function SortableTh({
  field,
  label,
  currentSort,
  currentOrder,
  onSort,
}: {
  field: string;
  label: string;
  currentSort: string;
  currentOrder: string;
  onSort: (field: string, order: string) => void;
}) {
  const isActive = currentSort === field;
  return (
    <th
      className="pb-2 pr-3 font-medium cursor-pointer select-none hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
      onClick={() => {
        if (isActive) {
          onSort(field, currentOrder === 'asc' ? 'desc' : 'asc');
        } else {
          onSort(field, 'desc');
        }
      }}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {isActive && (
          <span className="text-purple-500">{currentOrder === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );
}
