'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchCopywrites,
  fetchCopywrite,
  deleteCopywrite,
  thumbnailUrl,
  fetchVideos,
  type CopywriteListItem,
  type CopywriteDetail,
  type Video,
} from '@/lib/api';
import {
  Sparkles,
  Loader2,
  Film,
  Trash2,
  Terminal,
  ChevronRight,
  ArrowLeft,
  Clock,
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

export default function CopywritePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: copywrites, isLoading } = useQuery({
    queryKey: ['copywrites', projectId],
    queryFn: () => fetchCopywrites(projectId),
  });

  const { data: detail, isLoading: detailLoading } = useQuery({
    queryKey: ['copywrite', selectedId],
    queryFn: () => fetchCopywrite(selectedId!),
    enabled: selectedId !== null,
  });

  // Fetch videos for thumbnail display when viewing detail
  const videoIds = detail?.video_ids ?? [];
  const { data: videosData } = useQuery({
    queryKey: ['videos', projectId, 'copywrite-thumbs', videoIds.join(',')],
    queryFn: () => fetchVideos(projectId, { page_size: 500 }),
    enabled: videoIds.length > 0,
  });
  const videoMap = new Map<number, Video>();
  (videosData?.items ?? []).forEach((v) => videoMap.set(v.id, v));

  const delMutation = useMutation({
    mutationFn: (id: number) => deleteCopywrite(id),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ['copywrites', projectId] });
      if (selectedId === deletedId) setSelectedId(null);
      setConfirmDeleteId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  // Detail view
  if (selectedId !== null && detail) {
    return (
      <div className="p-6 max-w-4xl">
        <button
          onClick={() => setSelectedId(null)}
          className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('copywrite.history')}
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-1">
          <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400">
            {detail.style}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{detail.language}</span>
          <span className="text-xs text-gray-400 dark:text-gray-500">{detail.generated_by}</span>
          {detail.created_at && (
            <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(detail.created_at).toLocaleString()}
            </span>
          )}
        </div>

        {/* Overall Script */}
        {detail.overall_script && (
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 mb-4 mt-4">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              {t('copywrite.overallScript')}
            </h3>
            <p className="text-gray-900 dark:text-gray-100 leading-relaxed whitespace-pre-wrap">
              {detail.overall_script}
            </p>
          </div>
        )}

        {/* Narrations */}
        <div className="space-y-3 mt-4">
          {detail.narrations.map((narration) => {
            const video = videoMap.get(narration.video_id);
            const thumbUrl = video ? thumbnailUrl(video.thumbnail_path) : '';
            return (
              <div
                key={narration.video_id}
                className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex gap-4"
              >
                <div className="w-28 shrink-0 aspect-video rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                  {thumbUrl ? (
                    <img src={thumbUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500">
                      <Film className="w-6 h-6" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {video?.filename ?? `Video #${narration.video_id}`}
                    </p>
                    {narration.timing && (
                      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{narration.timing}</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {narration.text}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Detail loading
  if (selectedId !== null && detailLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  // List view
  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-7 h-7 text-amber-400" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('copywrite.title')}</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('copywrite.subtitle')}</p>
      </div>

      {/* CLI skill banner */}
      <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl px-4 py-3 mb-6">
        <Terminal className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm text-indigo-800 dark:text-indigo-300">{t('copywrite.cliBanner')}</p>
          <code className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded mt-1 inline-block">
            /clipmind-copywrite
          </code>
        </div>
      </div>

      {/* Copywrite list */}
      {(!copywrites || copywrites.length === 0) ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-12 text-center">
          <Sparkles className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">{t('copywrite.noHistory')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('copywrite.cliBanner')}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {copywrites.map((cw: CopywriteListItem) => (
            <div
              key={cw.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl px-5 py-3.5 flex items-center gap-4 hover:border-gray-300 dark:hover:border-gray-600 transition-colors group"
            >
              <button
                onClick={() => setSelectedId(cw.id)}
                className="flex-1 flex items-center gap-4 min-w-0 text-left"
              >
                <span className="text-xs font-medium uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 shrink-0">
                  {cw.style}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-300">
                  {cw.video_count} {t('copywrite.videos')}
                </span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{cw.language}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500">{cw.generated_by}</span>
                <span className="ml-auto text-xs text-gray-400 dark:text-gray-500 shrink-0">
                  {cw.created_at ? new Date(cw.created_at).toLocaleDateString() : ''}
                </span>
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0" />
              </button>

              {/* Delete */}
              {confirmDeleteId === cw.id ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => delMutation.mutate(cw.id)}
                    disabled={delMutation.isPending}
                    className="text-xs text-red-600 dark:text-red-400 font-medium hover:underline"
                  >
                    {delMutation.isPending ? '...' : t('copywrite.delete')}
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDeleteId(cw.id)}
                  className="p-1 text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
