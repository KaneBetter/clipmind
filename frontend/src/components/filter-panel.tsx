'use client';

import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchLocations, type VideoFilters } from '@/lib/api';
import { SCENE_CATEGORIES, MOODS, moodEmoji, sceneCategoryEmoji } from '@/lib/utils';
import { ChevronDown, Search } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

interface FilterPanelProps {
  projectId: number;
  filters: VideoFilters;
  onFiltersChange: (filters: VideoFilters) => void;
}

function FilterSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
      >
        {title}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${
            open ? '' : '-rotate-90'
          }`}
        />
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

export default function FilterPanel({
  projectId,
  filters,
  onFiltersChange,
}: FilterPanelProps) {
  const { t } = useI18n();
  const [locationSearch, setLocationSearch] = useState('');

  const { data: locations } = useQuery({
    queryKey: ['locations', projectId],
    queryFn: () => fetchLocations(projectId),
  });

  const updateFilter = useCallback(
    (key: keyof VideoFilters, value: VideoFilters[keyof VideoFilters]) => {
      const updated = { ...filters, [key]: value, page: 1 };
      if (value === undefined || value === '' || value === null) {
        delete updated[key];
      }
      onFiltersChange(updated);
    },
    [filters, onFiltersChange]
  );

  const filteredLocations = locations?.filter((loc) =>
    loc.label.toLowerCase().includes(locationSearch.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        {/* Quality Score */}
        <FilterSection title={t('filter.qualityScore')} defaultOpen={true}>
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{filters.min_quality ?? 1}</span>
              <span>{filters.max_quality ?? 10}</span>
            </div>
            <div className="relative">
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={filters.min_quality ?? 1}
                onChange={(e) =>
                  updateFilter('min_quality', parseFloat(e.target.value))
                }
                className="w-full accent-blue-500 h-1.5"
              />
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={filters.max_quality ?? 10}
                onChange={(e) =>
                  updateFilter('max_quality', parseFloat(e.target.value))
                }
                className="w-full accent-blue-500 h-1.5 -mt-1"
              />
            </div>
          </div>
        </FilterSection>

        {/* Scene Category Chips */}
        <FilterSection title={t('filter.scene')} defaultOpen={true}>
          <div className="flex flex-wrap gap-1.5">
            {SCENE_CATEGORIES.map((cat) => {
              const isSelected = filters.scene_category === cat;
              return (
                <button
                  key={cat}
                  onClick={() =>
                    updateFilter(
                      'scene_category',
                      isSelected ? undefined : cat
                    )
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{sceneCategoryEmoji(cat)}</span>
                  <span className="capitalize">{cat}</span>
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Mood Chips */}
        <FilterSection title={t('filter.mood')} defaultOpen={false}>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => {
              const isSelected = filters.mood === m;
              return (
                <button
                  key={m}
                  onClick={() =>
                    updateFilter('mood', isSelected ? undefined : m)
                  }
                  className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  <span>{moodEmoji(m)}</span>
                  <span className="capitalize">{m}</span>
                </button>
              );
            })}
          </div>
        </FilterSection>

        {/* Location */}
        <FilterSection title={t('filter.location')} defaultOpen={true}>
          <div className="space-y-2">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={locationSearch}
                onChange={(e) => setLocationSearch(e.target.value)}
                placeholder={t('filter.searchLocations')}
                className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg pl-7 pr-3 py-1.5 text-xs text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="max-h-40 overflow-y-auto space-y-0.5">
              {filteredLocations?.map((loc) => {
                const isSelected = filters.location_label === loc.label;
                return (
                  <button
                    key={loc.label}
                    onClick={() =>
                      updateFilter(
                        'location_label',
                        isSelected ? undefined : loc.label
                      )
                    }
                    className={`flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      isSelected
                        ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <span className="truncate">{loc.label}</span>
                    <span
                      className={`shrink-0 ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                        isSelected
                          ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-400'
                          : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                      }`}
                    >
                      {loc.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </FilterSection>

        {/* Duration */}
        <FilterSection title={t('filter.duration')} defaultOpen={false}>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              placeholder="Min"
              value={filters.min_duration ?? ''}
              onChange={(e) =>
                updateFilter(
                  'min_duration',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <span className="text-gray-300 dark:text-gray-600 text-xs">—</span>
            <input
              type="number"
              min={0}
              placeholder="Max"
              value={filters.max_duration ?? ''}
              onChange={(e) =>
                updateFilter(
                  'max_duration',
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              className="w-full bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{t('filter.inSeconds')}</p>
        </FilterSection>

        {/* Toggles */}
        <FilterSection title={t('filter.quickFilters')} defaultOpen={true}>
          <div className="space-y-2">
            <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.is_highlight === true}
                onChange={(e) =>
                  updateFilter(
                    'is_highlight',
                    e.target.checked ? true : undefined
                  )
                }
                className="accent-yellow-500 w-3.5 h-3.5 rounded"
              />
              <span className="group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                ⭐ {t('filter.highlightsOnly')}
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer group">
              <input
                type="checkbox"
                checked={(filters.min_quality ?? 0) === 0.1}
                onChange={(e) => {
                  if (e.target.checked) {
                    updateFilter('min_quality', 0.1);
                  } else {
                    updateFilter('min_quality', undefined);
                  }
                }}
                className="accent-purple-500 w-3.5 h-3.5 rounded"
              />
              <span className="group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                🔬 {t('filter.analyzedOnly')}
              </span>
            </label>
            <label className="flex items-center gap-2.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer group">
              <input
                type="checkbox"
                checked={filters.show_hidden === true}
                onChange={(e) =>
                  updateFilter(
                    'show_hidden',
                    e.target.checked ? true : undefined
                  )
                }
                className="accent-gray-500 w-3.5 h-3.5 rounded"
              />
              <span className="group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                {t('filter.showHidden')}
              </span>
            </label>
          </div>
        </FilterSection>
      </div>
    </div>
  );
}
