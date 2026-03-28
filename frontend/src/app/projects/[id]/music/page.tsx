'use client';

import { use, useState, useRef, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  scanMusic,
  uploadMusic,
  fetchMusicList,
  analyzeMusic,
  deleteMusic,
  type MusicItem,
  type MusicAnalysisResult,
} from '@/lib/api';
import {
  Music,
  FolderSearch,
  Upload,
  Loader2,
  Trash2,
  Zap,
  Clock,
} from 'lucide-react';
import { formatDuration } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

export default function MusicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useI18n();

  const [analysisResult, setAnalysisResult] = useState<
    Record<number, MusicAnalysisResult>
  >({});
  const [analyzingId, setAnalyzingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('title_asc');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;

  const { data: musicList, isLoading } = useQuery({
    queryKey: ['music', projectId],
    queryFn: () => fetchMusicList(projectId),
  });

  const scanMutation = useMutation({
    mutationFn: () => scanMusic(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music', projectId] });
    },
  });

  // Auto-scan on first load
  useEffect(() => {
    if (!isLoading) {
      scanMutation.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMusic(projectId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music', projectId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (musicId: number) => deleteMusic(musicId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['music', projectId] });
    },
  });

  const handleAnalyze = useCallback(
    async (musicId: number) => {
      setAnalyzingId(musicId);
      try {
        const result = await analyzeMusic(musicId);
        setAnalysisResult((prev) => ({ ...prev, [musicId]: result }));
        queryClient.invalidateQueries({ queryKey: ['music', projectId] });
      } finally {
        setAnalyzingId(null);
      }
    },
    [projectId, queryClient]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        uploadMutation.mutate(file);
      }
      e.target.value = '';
    },
    [uploadMutation]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const allItems = musicList ?? [];

  // Filter
  const filtered = allItems.filter(
    (m) => !search || m.title.toLowerCase().includes(search.toLowerCase())
  );

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    switch (sortBy) {
      case 'title_asc': return a.title.localeCompare(b.title);
      case 'title_desc': return b.title.localeCompare(a.title);
      case 'duration_asc': return a.duration - b.duration;
      case 'duration_desc': return b.duration - a.duration;
      case 'bpm_asc': return (a.bpm ?? 999) - (b.bpm ?? 999);
      case 'bpm_desc': return (b.bpm ?? 0) - (a.bpm ?? 0);
      case 'analyzed': return (b.bpm ? 1 : 0) - (a.bpm ? 1 : 0);
      case 'unanalyzed': return (a.bpm ? 1 : 0) - (b.bpm ? 1 : 0);
      default: return 0;
    }
  });

  // Paginate
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const items = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const analyzedCount = allItems.filter((m) => m.bpm !== null).length;

  return (
    <div className="p-6 max-w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Music className="w-7 h-7 text-purple-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('music.title')}</h1>
          <span className="text-sm text-gray-400 dark:text-gray-500">
            {allItems.length} tracks, {analyzedCount} analyzed
          </span>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {t('music.subtitle')}
        </p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 mb-6">
        <button
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {scanMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderSearch className="w-4 h-4" />
          )}
          {t('music.scanFolder')}
        </button>

        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:bg-gray-100 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-colors"
        >
          {uploadMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {t('music.upload')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".mp3,.wav,.flac,.aac,.m4a,.ogg"
          onChange={handleFileSelect}
          className="hidden"
        />

        {scanMutation.isSuccess && (
          <span className="self-center text-sm text-green-600">
            {t('music.imported')} {scanMutation.data.imported} {t('music.files')}
          </span>
        )}
      </div>

      {/* Search & Sort */}
      {allItems.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search..."
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 w-48 focus:outline-none focus:ring-1 focus:ring-purple-500"
          />
          <select
            value={sortBy}
            onChange={(e) => { setSortBy(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-purple-500"
          >
            <option value="title_asc">Title A→Z</option>
            <option value="title_desc">Title Z→A</option>
            <option value="duration_asc">Duration ↑</option>
            <option value="duration_desc">Duration ↓</option>
            <option value="bpm_asc">BPM ↑</option>
            <option value="bpm_desc">BPM ↓</option>
            <option value="analyzed">Analyzed first</option>
            <option value="unanalyzed">Unanalyzed first</option>
          </select>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {filtered.length} results
          </span>
        </div>
      )}

      {/* Music List */}
      {allItems.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <Music className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">
            {t('music.noMusic')}
          </p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((m) => (
              <MusicCard
                key={m.id}
                music={m}
                analysisResult={analysisResult[m.id]}
                isAnalyzing={analyzingId === m.id}
                onAnalyze={() => handleAnalyze(m.id)}
                onDelete={() => deleteMutation.mutate(m.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                Prev
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1 text-xs border border-gray-200 dark:border-gray-700 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MusicCard({
  music,
  analysisResult,
  isAnalyzing,
  onAnalyze,
  onDelete,
}: {
  music: MusicItem;
  analysisResult?: MusicAnalysisResult;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useI18n();
  const beats = analysisResult?.beats ?? music.beats;
  const onsets = analysisResult?.onsets ?? music.onsets;
  const sections = analysisResult?.sections ?? music.sections;
  const bpm = analysisResult?.bpm ?? music.bpm;
  const duration = analysisResult?.duration ?? music.duration;
  const hasAnalysis = beats !== null && beats.length > 0;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
      {/* Header Row */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center shrink-0">
          <Music className="w-5 h-5 text-purple-600 dark:text-purple-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {music.title}
          </p>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(duration)}
            </span>
            {bpm && (
              <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded font-medium">
                {bpm} BPM
              </span>
            )}
            {hasAnalysis && (
              <>
                <span>{beats?.length} {t('music.beats')}</span>
                <span>{onsets?.length} {t('music.onsets')}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {isAnalyzing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Zap className="w-3.5 h-3.5" />
            )}
            {hasAnalysis ? t('music.reanalyze') : t('music.analyze')}
          </button>

          {hasAnalysis && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="px-3 py-1.5 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium rounded-lg transition-colors"
            >
              {expanded ? t('music.hideDetails') : t('music.showDetails')}
            </button>
          )}

          <button
            onClick={onDelete}
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Beat Visualization */}
      {hasAnalysis && (
        <div className="px-5 pb-3">
          <BeatTimeline
            beats={beats ?? []}
            onsets={onsets ?? []}
            sections={sections ?? []}
            duration={duration}
          />
        </div>
      )}

      {/* Expanded Details */}
      {expanded && hasAnalysis && (
        <div className="border-t border-gray-100 dark:border-gray-800 px-5 py-4 space-y-3">
          {/* Sections */}
          {sections && sections.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                {t('music.sections')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {sections.map((s, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-xs rounded"
                  >
                    {t('music.section')} {s.index + 1}: {formatDuration(s.start)} -{' '}
                    {formatDuration(s.end)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Beat times for copy */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              {t('music.beatTimestamps')}
            </h4>
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 max-h-32 overflow-y-auto">
              <p className="text-xs text-gray-600 dark:text-gray-300 font-mono break-all">
                {beats?.map((b) => `${b.toFixed(2)}s`).join(', ')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BeatTimeline({
  beats,
  onsets,
  sections,
  duration,
}: {
  beats: number[];
  onsets: number[];
  sections: Array<{ start: number; end: number; index: number }>;
  duration: number;
}) {
  if (duration <= 0) return null;

  const sectionColors = [
    'bg-purple-200',
    'bg-blue-200',
    'bg-green-200',
    'bg-amber-200',
    'bg-pink-200',
    'bg-cyan-200',
    'bg-orange-200',
    'bg-violet-200',
  ];

  return (
    <div className="relative w-full h-12 bg-gray-100 dark:bg-gray-800 rounded-lg overflow-hidden">
      {/* Section backgrounds */}
      {sections.map((s, i) => (
        <div
          key={`section-${i}`}
          className={`absolute top-0 h-full ${sectionColors[i % sectionColors.length]} opacity-50 dark:opacity-30`}
          style={{
            left: `${(s.start / duration) * 100}%`,
            width: `${((s.end - s.start) / duration) * 100}%`,
          }}
        />
      ))}

      {/* Beat markers (blue) */}
      {beats.map((t, i) => (
        <div
          key={`beat-${i}`}
          className="absolute top-0 h-full w-px bg-blue-500 opacity-40"
          style={{ left: `${(t / duration) * 100}%` }}
        />
      ))}

      {/* Onset markers (red, stronger) */}
      {onsets.map((t, i) => (
        <div
          key={`onset-${i}`}
          className="absolute bottom-0 h-1/2 w-0.5 bg-red-500 opacity-70"
          style={{ left: `${(t / duration) * 100}%` }}
        />
      ))}

      {/* Time labels */}
      <div className="absolute bottom-0 left-1 text-[8px] text-gray-500">
        0:00
      </div>
      <div className="absolute bottom-0 right-1 text-[8px] text-gray-500">
        {formatDuration(duration)}
      </div>
    </div>
  );
}
