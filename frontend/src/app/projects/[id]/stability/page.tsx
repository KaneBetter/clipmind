'use client';

import { use, useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n-context';
import {
  fetchStabilityStatus,
  fetchStabilityStats,
  triggerStabilityBatch,
  fetchStabilityRunProgress,
  fetchReclassifyProgress,
  fetchUsableSegments,
  batchReclassify,
  thumbnailUrl,
} from '@/lib/api';
import type {
  StabilityStatus,
  StabilityStats,
  StabilityRunProgress,
  UsableSegmentsMap,
  BatchReclassifyResult,
  StabilitySegment,
} from '@/lib/api';
import {
  Activity,
  Play,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Gauge,
  Timer,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  Eye,
  Film,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { formatDuration } from '@/lib/utils';
import Link from 'next/link';
import LocationSelector from '@/components/location-selector';

export default function StabilityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [batchLimit, setBatchLimit] = useState(50);
  const [stabWorkers, setStabWorkers] = useState(4);
  const [threshold, setThreshold] = useState(1.0);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<string | undefined>(undefined);
  const [stabSortField, setStabSortField] = useState('score');
  const [stabSortOrder, setStabSortOrder] = useState<'asc' | 'desc'>('asc');

  // Batch reclassify state
  const [reclMinScore, setReclMinScore] = useState(0);
  const [reclMaxScore, setReclMaxScore] = useState(20);
  const [reclMode, setReclMode] = useState<'fixed' | 'auto_avg' | 'target_segments' | 'target_ratio'>('target_ratio');
  const [reclThreshold, setReclThreshold] = useState(3.0);
  const [reclTargetSegs, setReclTargetSegs] = useState(1);
  const [reclTargetRatio, setReclTargetRatio] = useState(0.5);
  const [reclMaxRatio, setReclMaxRatio] = useState(0.3);
  const [stabSearch, setStabSearch] = useState('');
  const [stabPage, setStabPage] = useState(1);
  const STAB_PAGE_SIZE = 20;

  // Queries
  const { data: status } = useQuery({
    queryKey: ['stability-status', projectId, selectedLocation],
    queryFn: () => fetchStabilityStatus(projectId, selectedLocation),
    refetchInterval: 5000,
  });

  const { data: stats } = useQuery({
    queryKey: ['stability-stats', projectId],
    queryFn: () => fetchStabilityStats(projectId),
    enabled: (status?.analyzed_videos ?? 0) > 0,
  });

  const { data: usableSegments } = useQuery({
    queryKey: ['usable-segments', projectId],
    queryFn: () => fetchUsableSegments(projectId),
    enabled: (status?.analyzed_videos ?? 0) > 0,
  });

  // Background run progress polling
  const { data: runProgress } = useQuery({
    queryKey: ['stability-run-progress', projectId],
    queryFn: () => fetchStabilityRunProgress(projectId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'running') return 2000;
      return false;
    },
  });

  const isRunning = runProgress?.status === 'running';

  // When background run completes, refresh data and show message
  const prevRunStatus = useRef(runProgress?.status);
  useEffect(() => {
    if (prevRunStatus.current === 'running' && runProgress?.status === 'completed') {
      setMessage({
        text: `Complete: ${runProgress.done} analyzed, ${runProgress.errors ?? 0} errors, ${runProgress.skipped ?? 0} skipped`,
        type: (runProgress.errors ?? 0) > 0 ? 'error' : 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['stability-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['stability-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['usable-segments', projectId] });
    }
    prevRunStatus.current = runProgress?.status;
  }, [runProgress?.status, runProgress?.done, runProgress?.errors, runProgress?.skipped, projectId, queryClient]);

  // Mutation (fire-and-forget)
  const runMutation = useMutation({
    mutationFn: () => triggerStabilityBatch(projectId, batchLimit || undefined, threshold, stabWorkers, selectedLocation),
    onSuccess: () => {
      setMessage({ text: 'Stability analysis started in background...', type: 'success' });
      queryClient.invalidateQueries({ queryKey: ['stability-run-progress', projectId] });
    },
    onError: () => setMessage({ text: 'Failed to start stability analysis', type: 'error' }),
  });

  // Reclassify progress polling — triggered by mutation, auto-stops on completion
  const [reclTriggered, setReclTriggered] = useState(false);

  const { data: reclProgress } = useQuery({
    queryKey: ['reclassify-progress', projectId],
    queryFn: () => fetchReclassifyProgress(projectId),
    refetchInterval: reclTriggered ? 500 : false,
  });

  const isReclRunning = reclProgress?.status === 'running';

  // When reclassify completes (detected via polling), show result and stop polling
  useEffect(() => {
    if (!reclTriggered) return;
    if (reclProgress?.status === 'completed') {
      setReclTriggered(false);
      setMessage({
        text: `Re-evaluated ${reclProgress.done}/${reclProgress.total} videos`,
        type: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['stability-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['stability-stats', projectId] });
      queryClient.invalidateQueries({ queryKey: ['usable-segments', projectId] });
    } else if (reclProgress?.status === 'error') {
      setReclTriggered(false);
      setMessage({ text: `Re-evaluate error: ${reclProgress.error ?? 'unknown'}`, type: 'error' });
    }
  }, [reclTriggered, reclProgress?.status, reclProgress?.done, reclProgress?.total, reclProgress?.error, projectId, queryClient]);

  const reclassifyMutation = useMutation({
    mutationFn: () => batchReclassify(projectId, {
      min_score: reclMinScore,
      max_score: reclMaxScore,
      mode: reclMode,
      threshold: reclThreshold,
      target_segments: reclTargetSegs,
      target_ratio: reclTargetRatio,
      max_stable_ratio: reclMaxRatio,
    }),
    onSuccess: () => {
      setReclTriggered(true);  // Start polling
      queryClient.invalidateQueries({ queryKey: ['reclassify-progress', projectId] });
    },
    onError: () => setMessage({ text: 'Failed to start re-evaluate', type: 'error' }),
  });

  // Either operation is running
  const anyRunning = isRunning || isReclRunning || reclTriggered;

  // Count videos matching reclassify filter criteria
  const reclMatchCount = useMemo(() => {
    if (!usableSegments) return 0;
    return Object.values(usableSegments).filter((v) => {
      if (v.overall_score < reclMinScore || v.overall_score > reclMaxScore) return false;
      if (reclMaxRatio > 0 && v.usable_ratio >= reclMaxRatio) return false;
      return true;
    }).length;
  }, [usableSegments, reclMinScore, reclMaxScore, reclMaxRatio]);

  const progressPercent = status
    ? status.total_videos > 0
      ? Math.round((status.analyzed_videos / status.total_videos) * 100)
      : 0
    : 0;

  // Filter, sort, paginate videos for the results table
  const allStabVideos = usableSegments
    ? Object.entries(usableSegments).filter(
        ([, info]) => !stabSearch || info.filename.toLowerCase().includes(stabSearch.toLowerCase())
      )
    : [];

  const sortedAllVideos = [...allStabVideos].sort(([, a], [, b]) => {
    const dir = stabSortOrder === 'asc' ? 1 : -1;
    switch (stabSortField) {
      case 'score': return (a.overall_score - b.overall_score) * dir;
      case 'name': return a.filename.localeCompare(b.filename) * dir;
      case 'duration': return (a.total_usable_duration - b.total_usable_duration) * dir;
      case 'ratio': return (a.usable_ratio - b.usable_ratio) * dir;
      default: return 0;
    }
  });

  const stabTotalPages = Math.ceil(sortedAllVideos.length / STAB_PAGE_SIZE);
  const sortedVideos = sortedAllVideos.slice(
    (stabPage - 1) * STAB_PAGE_SIZE,
    stabPage * STAB_PAGE_SIZE
  );

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-500" />
            {t('stability.title')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('stability.subtitle')}
          </p>
        </div>
        <LocationSelector projectId={projectId} value={selectedLocation} onChange={setSelectedLocation} />
      </div>

      {/* Controls Panel */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-6">
          {/* Threshold Config */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('stability.shakeThreshold')}
            </label>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">0.1 (strict)</span>
                  <span className="text-xs font-mono text-teal-600 font-medium">{threshold.toFixed(1)}</span>
                  <span className="text-xs text-gray-400">10.0 (loose)</span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={threshold}
                  onChange={(e) => setThreshold(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer accent-teal-500"
                />
                <div className="flex flex-wrap gap-1 mt-2">
                  {[
                    { value: 0.5, label: t('stability.strict') },
                    { value: 1.0, label: t('stability.normal') },
                    { value: 1.5, label: t('stability.tolerant') },
                    { value: 3.0, label: t('stability.loose') },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setThreshold(opt.value)}
                      className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                        Math.abs(threshold - opt.value) < 0.05
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-400 hover:border-gray-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {t('stability.thresholdDesc')}
              </p>
            </div>
          </div>

          {/* Progress & Actions */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              {t('analysis.progress')}
            </label>
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
                    className="bg-teal-500 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {status && status.unanalyzed_videos > 0 && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {status.unanalyzed_videos} {t('analysis.videosPending')}
                  </p>
                )}
              </div>

              {/* Batch size */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('analysis.batchSize')}</label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 0, label: 'All' },
                    { value: 10, label: '10' },
                    { value: 50, label: '50' },
                    { value: 100, label: '100' },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setBatchLimit(opt.value)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        batchLimit === opt.value
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
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
                    value={batchLimit || ''}
                    onChange={(e) => setBatchLimit(parseInt(e.target.value) || 0)}
                    className="w-20 px-2 py-1 text-xs rounded-md border border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 focus:border-teal-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Workers */}
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">Workers</label>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 2, 4, 8].map((w) => (
                    <button
                      key={w}
                      onClick={() => setStabWorkers(w)}
                      className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                        stabWorkers === w
                          ? 'border-teal-500 bg-teal-50 text-teal-700'
                          : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                      }`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              {/* Action button */}
              <div className="space-y-2">
                <button
                  onClick={() => runMutation.mutate()}
                  disabled={runMutation.isPending || anyRunning || (status?.unanalyzed_videos ?? 0) === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 dark:disabled:bg-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isRunning || runMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4" />
                  )}
                  {batchLimit > 0
                    ? `${t('analysis.analyzeAll')} ${batchLimit}`
                    : t('analysis.analyzeAll')}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shared Progress Bar */}
      {(isRunning || isReclRunning || reclTriggered) && (
        <div className="mb-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 className={`w-4 h-4 animate-spin ${isRunning ? 'text-teal-500' : 'text-amber-500'}`} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {isRunning
                ? `Analyzing ${runProgress?.done ?? 0} / ${runProgress?.total ?? '?'}`
                : `Re-evaluating ${reclProgress?.done ?? 0} / ${reclProgress?.total ?? '?'}`}
            </span>
            {((isRunning ? runProgress?.errors : reclProgress?.errors) ?? 0) > 0 && (
              <span className="text-xs text-red-500">
                {isRunning ? runProgress?.errors : reclProgress?.errors} errors
              </span>
            )}
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${isRunning ? 'bg-teal-500' : 'bg-amber-500'}`}
              style={{ width: `${(isRunning ? runProgress?.percent : reclProgress?.percent) ?? 0}%` }}
            />
          </div>
        </div>
      )}

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

      {/* Batch Re-evaluate + Ratio Chart */}
      {stats && stats.total_analyzed > 0 && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">Batch Re-evaluate</h3>
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">
              Adjust thresholds without re-analyzing video files
            </span>
          </div>

          <div className="p-5">
            {/* Row 1: Filter — which videos to re-evaluate */}
            <div className="mb-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Filter</p>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Score</span>
                  <input type="number" min={0} max={100} value={reclMinScore}
                    onChange={(e) => setReclMinScore(parseFloat(e.target.value) || 0)}
                    className="w-14 px-2 py-1 text-xs text-center border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                  <span className="text-xs text-gray-400">to</span>
                  <input type="number" min={0} max={100} value={reclMaxScore}
                    onChange={(e) => setReclMaxScore(parseFloat(e.target.value) || 100)}
                    className="w-14 px-2 py-1 text-xs text-center border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
                <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                  <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">Stable ratio &lt;</span>
                  <input type="number" min={0} max={1} step={0.05} value={reclMaxRatio}
                    onChange={(e) => setReclMaxRatio(parseFloat(e.target.value) || 0)}
                    className="w-14 px-2 py-1 text-xs text-center border border-gray-200 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 dark:text-gray-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                </div>
              </div>
            </div>

            {/* Match count */}
            <div className="mb-4 px-3 py-2 bg-gray-50 dark:bg-gray-800 rounded-lg inline-flex items-center gap-2">
              <span className={`text-xl font-bold ${reclMatchCount > 0 ? 'text-amber-600' : 'text-gray-400'}`}>
                {reclMatchCount}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                videos match filter
              </span>
            </div>

            {/* Row 2: Strategy — how to re-evaluate */}
            <div className="mb-5">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">Strategy</p>
              <div className="flex flex-wrap gap-2 mb-3">
                {([
                  { value: 'target_ratio', label: 'Target Ratio', desc: 'Auto-find threshold to reach target stable ratio' },
                  { value: 'auto_avg', label: 'Auto Average', desc: 'Use each video\'s average shake as threshold' },
                  { value: 'target_segments', label: 'Target Segments', desc: 'Ensure minimum stable segment count' },
                  { value: 'fixed', label: 'Fixed Threshold', desc: 'Apply the same threshold to all videos' },
                ] as const).map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setReclMode(opt.value)}
                    title={opt.desc}
                    className={`px-3 py-1.5 text-xs rounded-lg border-2 transition-all ${
                      reclMode === opt.value
                        ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-medium shadow-sm'
                        : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-200 dark:hover:border-amber-800'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Mode-specific parameter */}
              <div className="flex items-center gap-2">
                {reclMode === 'target_ratio' && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 dark:text-amber-300">Reach ratio &ge;</span>
                    <input type="number" min={0.1} max={1} step={0.05} value={reclTargetRatio}
                      onChange={(e) => setReclTargetRatio(parseFloat(e.target.value) || 0.5)}
                      className="w-16 px-2 py-1 text-xs text-center font-medium border border-amber-300 dark:border-amber-700 rounded-md bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                  </div>
                )}
                {reclMode === 'fixed' && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 dark:text-amber-300">Threshold</span>
                    <input type="number" min={0.1} max={50} step={0.1} value={reclThreshold}
                      onChange={(e) => setReclThreshold(parseFloat(e.target.value) || 3)}
                      className="w-16 px-2 py-1 text-xs text-center font-medium border border-amber-300 dark:border-amber-700 rounded-md bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                  </div>
                )}
                {reclMode === 'target_segments' && (
                  <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <span className="text-xs text-amber-700 dark:text-amber-300">Min segments</span>
                    <input type="number" min={1} max={20} value={reclTargetSegs}
                      onChange={(e) => setReclTargetSegs(parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-xs text-center font-medium border border-amber-300 dark:border-amber-700 rounded-md bg-white dark:bg-gray-800 text-amber-800 dark:text-amber-200 focus:ring-1 focus:ring-amber-400 focus:outline-none" />
                  </div>
                )}
                {reclMode === 'auto_avg' && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                    Each video gets its own threshold based on average shake magnitude
                  </p>
                )}
              </div>
            </div>

            {/* Action */}
            <button
              onClick={() => reclassifyMutation.mutate()}
              disabled={reclassifyMutation.isPending || anyRunning}
              className="flex items-center justify-center gap-2 w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 disabled:from-gray-300 disabled:to-gray-300 dark:disabled:from-gray-600 dark:disabled:to-gray-600 text-white text-sm font-medium rounded-xl shadow-sm hover:shadow-md transition-all"
            >
              {isReclRunning || reclassifyMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <TrendingUp className="w-4 h-4" />
              )}
              Re-evaluate {reclMatchCount > 0 ? `(${reclMatchCount})` : ''}
            </button>
          </div>
        </div>

        {/* Stable Ratio Distribution Chart */}
        {usableSegments && (
          <div>
            <DistributionChart
              title="Stable Ratio Distribution"
              data={buildDistribution(
                Object.values(usableSegments).map((v) => v.usable_ratio * 100),
                0, 100, 5
              )}
              color="#8b5cf6"
              xLabel="Ratio %"
            />
          </div>
        )}
      </div>
      )}

      {/* Stats Cards */}
      {stats && stats.total_analyzed > 0 && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard
              icon={<CheckCircle2 className="w-4 h-4" />}
              label={t('analysis.analyzed')}
              value={stats.total_analyzed.toString()}
            />
            <StatCard
              icon={<Gauge className="w-4 h-4" />}
              label={t('stability.avgScore')}
              value={stats.avg_score.toFixed(1)}
              valueColor="text-teal-600"
            />
            <StatCard
              icon={<ShieldCheck className="w-4 h-4" />}
              label={t('stability.stable')}
              value={stats.stable_count.toString()}
              valueColor="text-green-600"
            />
            <StatCard
              icon={<ShieldAlert className="w-4 h-4" />}
              label={t('stability.shaky')}
              value={stats.shaky_count.toString()}
              valueColor="text-red-500"
            />
            <StatCard
              icon={<Timer className="w-4 h-4" />}
              label={t('stability.usableDuration')}
              value={formatDuration(stats.total_usable_duration)}
              valueColor="text-teal-600"
            />
          </div>

          {/* (Ratio chart moved next to Batch Re-evaluate panel) */}
        </>
      )}

      {/* Results Table */}
      {sortedAllVideos.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {t('analysis.results')} ({sortedAllVideos.length} videos)
            </h3>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={stabSearch}
                onChange={(e) => { setStabSearch(e.target.value); setStabPage(1); }}
                placeholder="Search..."
                className="px-2.5 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-36 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-left text-xs text-gray-500 dark:text-gray-400">
                  <th className="pb-2 pr-3 font-medium w-10"></th>
                  <StabSortableTh field="name" label={t('stability.th.file')} currentField={stabSortField} currentOrder={stabSortOrder} onSort={(f, o) => { setStabSortField(f); setStabSortOrder(o); setStabPage(1); }} />
                  <StabSortableTh field="score" label={t('stability.th.score')} currentField={stabSortField} currentOrder={stabSortOrder} onSort={(f, o) => { setStabSortField(f); setStabSortOrder(o); setStabPage(1); }} />
                  <StabSortableTh field="ratio" label={t('stability.th.stableRatio')} currentField={stabSortField} currentOrder={stabSortOrder} onSort={(f, o) => { setStabSortField(f); setStabSortOrder(o); setStabPage(1); }} />
                  <StabSortableTh field="duration" label={t('stability.th.usable')} currentField={stabSortField} currentOrder={stabSortOrder} onSort={(f, o) => { setStabSortField(f); setStabSortOrder(o); setStabPage(1); }} />
                  <th className="pb-2 pr-3 font-medium">{t('stability.th.stableSegments')}</th>
                  <th className="pb-2 font-medium">{t('stability.th.timeline')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedVideos.map(([videoId, info]) => {
                  const thumbUrl = thumbnailUrl(info.thumbnail_path);
                  return (
                  <tr
                    key={videoId}
                    className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <td className="py-1.5 pr-2">
                      <div className="w-12 h-8 rounded overflow-hidden bg-gray-100 dark:bg-gray-800">
                        {thumbUrl ? (
                          <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Film className="w-3 h-3" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link href={`/projects/${projectId}/videos/${videoId}`} className="hover:underline">
                        <p className="text-xs font-medium text-blue-600 dark:text-blue-400">{info.filename}</p>
                      </Link>
                      <p className="text-xs text-gray-400 dark:text-gray-500">{info.duration.toFixed(1)}s</p>
                    </td>
                    <td className="py-2.5 pr-3">
                      <ScoreBadge score={info.overall_score} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-xs text-gray-600 dark:text-gray-400">
                        {(info.usable_ratio * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <span className="text-xs text-teal-600 font-medium">
                        {info.total_usable_duration.toFixed(1)}s
                      </span>
                    </td>
                    <td className="py-2.5 pr-3">
                      <div className="flex flex-wrap gap-1">
                        {info.usable_segments.length === 0 ? (
                          <span className="text-xs text-red-400">{t('stability.noStableSegments')}</span>
                        ) : (
                          info.usable_segments.slice(0, 3).map((seg, i) => (
                            <span
                              key={i}
                              className="inline-block px-1.5 py-0.5 bg-teal-50 text-teal-700 text-xs rounded font-mono"
                            >
                              {seg.start.toFixed(1)}s-{seg.end.toFixed(1)}s
                            </span>
                          ))
                        )}
                        {info.usable_segments.length > 3 && (
                          <span className="text-xs text-gray-400 dark:text-gray-500">
                            +{info.usable_segments.length - 3} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5">
                      <SegmentBar
                        duration={info.duration}
                        stableSegments={info.usable_segments}
                      />
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {stabTotalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setStabPage((p) => Math.max(1, p - 1))}
                disabled={stabPage <= 1}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {t('analysis.prev')}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {stabPage} / {stabTotalPages}
              </span>
              <button
                onClick={() => setStabPage((p) => Math.min(stabTotalPages, p + 1))}
                disabled={stabPage >= stabTotalPages}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                {t('analysis.next')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Sub-components ---

function StatCard({
  icon,
  label,
  value,
  valueColor = 'text-gray-900',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-2">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  let cls = 'text-gray-600';
  if (score >= 80) cls = 'text-green-600 font-bold';
  else if (score >= 60) cls = 'text-teal-600';
  else if (score >= 40) cls = 'text-amber-600';
  else cls = 'text-red-600 font-bold';
  return <span className={`text-xs ${cls}`}>{score.toFixed(1)}</span>;
}

function SegmentBar({
  duration,
  stableSegments,
}: {
  duration: number;
  stableSegments: StabilitySegment[];
}) {
  if (duration <= 0) return null;
  return (
    <div className="w-24 h-3 bg-red-100 rounded-full overflow-hidden relative" title="Green = stable">
      {stableSegments.map((seg, i) => {
        const left = (seg.start / duration) * 100;
        const width = ((seg.end - seg.start) / duration) * 100;
        return (
          <div
            key={i}
            className="absolute top-0 h-full bg-teal-400 rounded-sm"
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

function buildDistribution(
  values: number[],
  min: number,
  max: number,
  step: number,
): Array<{ x: number; count: number }> {
  const bins: Array<{ x: number; count: number }> = [];
  for (let v = min; v <= max; v += step) {
    bins.push({ x: v, count: 0 });
  }
  for (const val of values) {
    const idx = Math.min(
      bins.length - 1,
      Math.max(0, Math.floor((val - min) / step))
    );
    bins[idx].count++;
  }
  return bins;
}

function DistributionChart({
  title,
  data,
  color,
  xLabel,
}: {
  title: string;
  data: Array<{ x: number; count: number }>;
  color: string;
  xLabel: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" className="flex-1" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10 }}
            label={{ value: xLabel, position: 'insideBottom', offset: -2, fontSize: 10 }}
          />
          <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
          <Tooltip
            contentStyle={{ fontSize: 11 }}
            formatter={(value) => [`${value}`, 'Videos']}
            labelFormatter={(label) => `${xLabel}: ${label}`}
          />
          <Line
            type="monotone"
            dataKey="count"
            stroke={color}
            strokeWidth={2}
            dot={{ r: 2, fill: color }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function StabSortableTh({
  field,
  label,
  currentField,
  currentOrder,
  onSort,
}: {
  field: string;
  label: string;
  currentField: string;
  currentOrder: 'asc' | 'desc';
  onSort: (field: string, order: 'asc' | 'desc') => void;
}) {
  const isActive = currentField === field;
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
          <span className="text-teal-500">{currentOrder === 'asc' ? '\u2191' : '\u2193'}</span>
        )}
      </span>
    </th>
  );
}
