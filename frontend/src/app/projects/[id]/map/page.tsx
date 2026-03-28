'use client';

import { use, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useI18n } from '@/lib/i18n-context';
import { fetchLocations, fetchVideos } from '@/lib/api';
import Link from 'next/link';
import {
  MapPin,
  Video,
  ArrowRight,
  Loader2,
  MapPinOff,
  Map as MapIcon,
  Flame,
  Table2,
  X,
} from 'lucide-react';

const LocationMap = dynamic(() => import('@/components/location-map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[450px] rounded-xl border border-gray-200 dark:border-gray-700 flex items-center justify-center bg-gray-50 dark:bg-gray-800">
      <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
    </div>
  ),
});

type ViewMode = 'markers' | 'heatmap' | 'table';

export default function MapPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const projectId = parseInt(id);
  const { t } = useI18n();
  const [viewMode, setViewMode] = useState<ViewMode>('markers');
  const [selectedLocation, setSelectedLocation] = useState<string | null>(null);

  const { data: locations, isLoading } = useQuery({
    queryKey: ['locations', projectId],
    queryFn: () => fetchLocations(projectId),
  });

  const { data: gpsVideos } = useQuery({
    queryKey: ['videos', projectId, 'with-gps'],
    queryFn: () =>
      fetchVideos(projectId, { page_size: 1500, has_gps: true }),
  });

  const videosWithGps = useMemo(
    () =>
      gpsVideos?.items.filter((v) => v.lat !== null && v.lon !== null) ?? [],
    [gpsVideos]
  );

  // Filter videos by selected location
  const displayedVideos = useMemo(() => {
    if (!selectedLocation) return videosWithGps;
    return videosWithGps.filter(
      (v) => v.location_label === selectedLocation
    );
  }, [videosWithGps, selectedLocation]);

  // Group videos by location for table
  const locationGroups = useMemo(() => {
    const groups = new Map<
      string,
      { lat: number; lon: number; videos: typeof videosWithGps }
    >();
    for (const v of displayedVideos) {
      const key =
        v.location_label ?? `${v.lat?.toFixed(3)},${v.lon?.toFixed(3)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.videos.push(v);
      } else {
        groups.set(key, { lat: v.lat!, lon: v.lon!, videos: [v] });
      }
    }
    return groups;
  }, [displayedVideos]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  const viewButtons: {
    mode: ViewMode;
    icon: typeof MapIcon;
    label: string;
  }[] = [
    { mode: 'markers', icon: MapIcon, label: t('map.mapView') },
    { mode: 'heatmap', icon: Flame, label: t('map.heatmap') },
    { mode: 'table', icon: Table2, label: t('map.table') },
  ];

  const handleLocationClick = (label: string) => {
    if (selectedLocation === label) {
      setSelectedLocation(null);
    } else {
      setSelectedLocation(label);
      if (viewMode === 'table') {
        setViewMode('markers');
      }
    }
  };

  const selectedCount =
    selectedLocation && locations
      ? locations.find((l) => l.label === selectedLocation)?.count ?? 0
      : 0;

  return (
    <div className="p-6 max-w-full overflow-y-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <MapPin className="w-6 h-6 text-blue-500" />
            {t('map.title')}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {videosWithGps.length} {t('map.mediaWithGps')}
          </p>
        </div>

        {/* View Toggle */}
        {videosWithGps.length > 0 && (
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            {viewButtons.map(({ mode, icon: Icon, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  viewMode === mode
                    ? 'bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected location indicator */}
      {selectedLocation && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg">
          <MapPin className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
            {selectedLocation}
          </span>
          <span className="text-xs text-blue-500">
            {selectedCount} video{selectedCount !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => setSelectedLocation(null)}
            className="ml-auto p-1 rounded hover:bg-blue-100 transition-colors"
            title="Show all locations"
          >
            <X className="w-3.5 h-3.5 text-blue-500" />
          </button>
          <Link
            href={`/projects/${projectId}/videos?location=${encodeURIComponent(selectedLocation)}`}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
          >
            {t('map.viewInMedia')}
          </Link>
        </div>
      )}

      {/* Map View */}
      {displayedVideos.length > 0 && viewMode !== 'table' && (
        <div className="mb-8">
          <LocationMap
            key={selectedLocation ?? 'all'}
            videos={displayedVideos}
            mode={viewMode === 'heatmap' ? 'heatmap' : 'markers'}
          />
          {/* Legend */}
          <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
            {viewMode === 'markers' ? (
              <>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-blue-500" />
                  {t('map.video')}
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-500" />
                  {t('map.photo')}
                </span>
                <span className="ml-auto">
                  {displayedVideos.length} {t('map.points')}
                </span>
              </>
            ) : (
              <span>{t('map.density')}</span>
            )}
          </div>
        </div>
      )}

      {/* Location Summary Cards */}
      {locations && locations.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {locations.map((loc) => {
            const isSelected = selectedLocation === loc.label;
            return (
              <button
                key={loc.label}
                onClick={() => handleLocationClick(loc.label)}
                className={`text-left rounded-xl p-4 transition-all group ${
                  isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-2 border-blue-400 shadow-sm'
                    : 'bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin
                      className={`w-4 h-4 ${
                        isSelected ? 'text-blue-500' : 'text-blue-400'
                      }`}
                    />
                    <h3
                      className={`font-medium transition-colors ${
                        isSelected
                          ? 'text-blue-700'
                          : 'text-gray-900 dark:text-gray-100 group-hover:text-blue-400'
                      }`}
                    >
                      {loc.label}
                    </h3>
                  </div>
                  <ArrowRight
                    className={`w-4 h-4 transition-colors ${
                      isSelected
                        ? 'text-blue-400'
                        : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-500'
                    }`}
                  />
                </div>
                <div className="flex items-center gap-1 mt-2 text-sm text-gray-500 dark:text-gray-400">
                  <Video className="w-3.5 h-3.5" />
                  {loc.count} video{loc.count !== 1 ? 's' : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {locations &&
        locations.length === 0 &&
        videosWithGps.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapPinOff className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
              {t('map.noLocationData')}
            </h2>
            <p className="text-gray-400 dark:text-gray-500 max-w-md">
              {t('map.noLocationDesc')}
            </p>
          </div>
        )}

      {/* GPS Coordinates Table */}
      {displayedVideos.length > 0 && viewMode === 'table' && (
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            {t('map.gpsCoordinates')} ({displayedVideos.length} media)
          </h2>
          <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                    {t('map.th.location')}
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                    {t('map.th.latitude')}
                  </th>
                  <th className="text-left px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                    {t('map.th.longitude')}
                  </th>
                  <th className="text-right px-4 py-3 text-gray-500 dark:text-gray-400 font-medium">
                    {t('map.th.media')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Array.from(locationGroups.entries()).map(
                  ([label, data]) => (
                    <tr
                      key={label}
                      className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 text-gray-800 dark:text-gray-200">
                          <MapPin className="w-3.5 h-3.5 text-blue-400" />
                          {label}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {data.lat.toFixed(6)}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {data.lon.toFixed(6)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {data.videos.length}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
