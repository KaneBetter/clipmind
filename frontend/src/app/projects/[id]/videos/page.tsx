'use client';

import { use, useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchVideos, type VideoFilters, type Video, thumbnailUrl, updateVideoHidden, regenerateThumbnails, regenerateThumbnail } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import FilterPanel from '@/components/filter-panel';
import VideoCard from '@/components/video-card';
import ActiveFilters from '@/components/active-filters';
import Pagination from '@/components/pagination';
import {
  Grid3X3,
  List,
  ArrowUpDown,
  Loader2,
  VideoOff,
  SlidersHorizontal,
  Search,
  X,
  Eye,
  EyeOff,
  RefreshCw,
} from 'lucide-react';

type ViewMode = 'grid' | 'list';

export default function VideoBrowserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const { t } = useI18n();
  const [filters, setFilters] = useState<VideoFilters>({
    page: 1,
    page_size: 20,
    sort_by: 'random',
    sort_order: 'asc',
  });
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showFilters, setShowFilters] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [thumbVersion, setThumbVersion] = useState(0);
  const queryClient = useQueryClient();

  const regenMutation = useMutation({
    mutationFn: () => regenerateThumbnails(projectId),
    onSuccess: () => {
      setThumbVersion(Date.now());
      queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ['videos', projectId, filters],
    queryFn: () => fetchVideos(projectId, filters),
    staleTime: filters.sort_by === 'random' ? 0 : undefined,
    gcTime: filters.sort_by === 'random' ? 0 : undefined,
  });

  const handleFiltersChange = useCallback((newFilters: VideoFilters) => {
    setFilters((prev) => ({
      ...prev,
      ...newFilters,
      page: newFilters.page ?? 1,
    }));
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setFilters((prev) => ({ ...prev, page }));
  }, []);

  const handleSortChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const [sort_by, sort_order] = e.target.value.split(':');
      setFilters((prev) => ({ ...prev, sort_by, sort_order, page: 1 }));
    },
    []
  );

  const handleSearchSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setFilters((prev) => {
        const updated = { ...prev, page: 1 };
        if (searchInput) {
          updated.search = searchInput;
        } else {
          delete updated.search;
        }
        return updated;
      });
    },
    [searchInput]
  );

  const handleRemoveFilter = useCallback(
    (key: keyof VideoFilters) => {
      const updated = { ...filters, page: 1 };
      delete updated[key];
      if (key === 'search') setSearchInput('');
      setFilters(updated);
    },
    [filters]
  );

  const handleClearAllFilters = useCallback(() => {
    setSearchInput('');
    setFilters({
      page: 1,
      page_size: 20,
      sort_by: filters.sort_by,
      sort_order: filters.sort_order,
    });
  }, [filters.sort_by, filters.sort_order]);

  // Count active filters for badge
  const activeFilterCount = [
    filters.search,
    filters.scene_category,
    filters.mood,
    filters.location_label,
    filters.is_highlight,
    filters.min_quality !== undefined &&
      filters.min_quality !== 1 &&
      filters.min_quality,
    filters.max_quality !== undefined &&
      filters.max_quality !== 10 &&
      filters.max_quality,
    filters.min_duration,
    filters.max_duration,
    filters.show_hidden,
  ].filter(Boolean).length;

  return (
    <div className="flex h-full">
      {/* Collapsible Filter Sidebar */}
      <div
        className={`shrink-0 border-r border-gray-200 dark:border-gray-700 transition-all duration-300 ease-in-out overflow-hidden ${
          showFilters ? 'w-72' : 'w-0 border-r-0'
        }`}
      >
        <div className="w-72 h-full">
          <FilterPanel
            projectId={projectId}
            filters={filters}
            onFiltersChange={handleFiltersChange}
          />
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Top Bar */}
        <div className="shrink-0 px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            {/* Filter Toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                showFilters
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 border border-blue-200 dark:border-blue-800'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              <span className="hidden sm:inline">{t('browser.filters')}</span>
              {activeFilterCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 bg-blue-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* Media Type Tabs */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
              {[
                { value: undefined, label: t('browser.all') },
                { value: 'video', label: t('browser.videosTab') },
              ].map((tab) => (
                <button
                  key={tab.label}
                  onClick={() =>
                    setFilters((prev) => ({
                      ...prev,
                      media_type: tab.value,
                      page: 1,
                    }))
                  }
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    filters.media_type === tab.value
                      ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-none'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* File Count */}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {data ? (
                <>
                  <span className="text-gray-700 dark:text-gray-300 font-semibold">
                    {data.total}
                  </span>{' '}
                  {t('browser.files')}
                </>
              ) : (
                ''
              )}
            </span>

            {/* Search */}
            <form
              onSubmit={handleSearchSubmit}
              className="flex-1 max-w-md ml-auto relative"
            >
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('browser.searchFiles')}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-8 pr-8 py-1.5 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    handleRemoveFilter('search');
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400" />
                </button>
              )}
            </form>

            {/* Sort */}
            <div className="flex items-center gap-1.5 shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <select
                value={`${filters.sort_by}:${filters.sort_order}`}
                onChange={handleSortChange}
                className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500 appearance-none pr-6 cursor-pointer"
              >
                <option value="random:asc">{t('browser.random')}</option>
                <option value="captured_at:desc">{t('browser.newest')}</option>
                <option value="captured_at:asc">{t('browser.oldest')}</option>
                <option value="quality_score:desc">{t('browser.bestQuality')}</option>
                <option value="quality_score:asc">{t('browser.lowestQuality')}</option>
                <option value="duration:desc">{t('browser.longest')}</option>
                <option value="duration:asc">{t('browser.shortest')}</option>
                <option value="filename:asc">A → Z</option>
                <option value="filename:desc">Z → A</option>
              </select>
            </div>

            {/* Regen Thumbnails */}
            <button
              onClick={() => regenMutation.mutate()}
              disabled={regenMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 transition-colors disabled:opacity-50 shrink-0"
              title={t('browser.regenThumbnails')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenMutation.isPending ? 'animate-spin' : ''}`} />
              <span className="hidden lg:inline">{t('browser.regenThumbnails')}</span>
            </button>

            {/* View Toggle */}
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 shrink-0">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'grid'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-none'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                }`}
                title="Grid view"
              >
                <Grid3X3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-colors ${
                  viewMode === 'list'
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm dark:shadow-none'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400'
                }`}
                title="List view"
              >
                <List className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Active Filter Chips */}
        <ActiveFilters
          filters={filters}
          onRemoveFilter={handleRemoveFilter}
          onClearAll={handleClearAllFilters}
        />

        {/* Video Grid/List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading && (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          )}

          {data && data.items.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <VideoOff className="w-12 h-12 text-gray-200 dark:text-gray-600 mb-3" />
              <h3 className="text-base font-medium text-gray-500 dark:text-gray-400">
                {t('browser.noMedia')}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                {t('browser.noMediaDesc')}
              </p>
            </div>
          )}

          {data && data.items.length > 0 && viewMode === 'grid' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              {data.items.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  projectId={projectId}
                  thumbVersion={thumbVersion}
                />
              ))}
            </div>
          )}

          {data && data.items.length > 0 && viewMode === 'list' && (
            <div className="space-y-1.5">
              {data.items.map((video) => (
                <VideoListItem
                  key={video.id}
                  video={video}
                  projectId={projectId}
                  thumbVersion={thumbVersion}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {data && data.pages > 1 && (
            <Pagination
              page={data.page}
              totalPages={data.pages}
              onPageChange={handlePageChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* List View Item */
import Link from 'next/link';
import { Star, MapPin, Play } from 'lucide-react';
import {
  formatDuration,
  qualityColor,
  moodEmoji,
} from '@/lib/utils';

function VideoListItem({
  video,
  projectId,
  thumbVersion,
}: {
  video: Video;
  projectId: number;
  thumbVersion?: number;
}) {
  const queryClient = useQueryClient();
  const [localThumbVersion, setLocalThumbVersion] = useState(0);
  const thumbUrl = thumbnailUrl(video.thumbnail_path, localThumbVersion || thumbVersion);
  const hideMutation = useMutation({
    mutationFn: (isHidden: boolean) => updateVideoHidden(video.id, isHidden),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
      queryClient.invalidateQueries({ queryKey: ['video', video.id] });
      queryClient.invalidateQueries({ queryKey: ['locations', projectId] });
    },
  });
  const regenMutation = useMutation({
    mutationFn: () => regenerateThumbnail(video.id),
    onSuccess: () => {
      setLocalThumbVersion(Date.now());
      queryClient.invalidateQueries({ queryKey: ['videos', projectId] });
      queryClient.invalidateQueries({ queryKey: ['video', video.id] });
    },
  });

  return (
    <Link
      href={`/projects/${projectId}/videos/${video.id}`}
      className="flex items-center gap-4 bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl px-3 py-2.5 transition-all group hover:shadow-sm"
    >
      {/* Thumbnail */}
      <div className="relative w-40 aspect-video shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.filename}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
            <Play className="w-5 h-5" />
          </div>
        )}
        <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-sm text-white text-[10px] px-1.5 py-0.5 rounded-md font-medium">
          {video.media_type === 'photo'
            ? 'PHOTO'
            : formatDuration(video.duration)}
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {video.location_label && (
            <MapPin className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
          )}
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
            {video.location_label || video.filename}
          </p>
          {video.is_highlight && (
            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400 shrink-0" />
          )}
        </div>

        <div className="flex items-center gap-3 mt-1">
          {video.location_label && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {video.filename}
            </span>
          )}
          {video.scene_category && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 capitalize">
              {video.scene_category}
            </span>
          )}
          {video.mood && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {moodEmoji(video.mood)} {video.mood}
            </span>
          )}
        </div>
      </div>

      {/* Quality Score */}
      {video.quality_score !== null && (
        <div className="shrink-0 flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${
              video.quality_score >= 7
                ? 'bg-green-400'
                : video.quality_score >= 4
                ? 'bg-yellow-400'
                : 'bg-red-400'
            }`}
          />
          <span className={`text-sm font-semibold ${qualityColor(video.quality_score)}`}>
            {video.quality_score.toFixed(1)}
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          regenMutation.mutate();
        }}
        disabled={regenMutation.isPending}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${regenMutation.isPending ? 'animate-spin' : ''}`} />
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          hideMutation.mutate(!video.is_hidden);
        }}
        className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
      >
        {video.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        {video.is_hidden ? 'Unhide' : 'Hide'}
      </button>
    </Link>
  );
}
