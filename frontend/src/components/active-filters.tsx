'use client';

import { X } from 'lucide-react';
import type { VideoFilters } from '@/lib/api';
import { moodEmoji, sceneCategoryEmoji } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

interface ActiveFiltersProps {
  filters: VideoFilters;
  onRemoveFilter: (key: keyof VideoFilters, resetValue?: unknown) => void;
  onClearAll: () => void;
}

interface FilterChip {
  key: keyof VideoFilters;
  label: string;
}

function buildChips(filters: VideoFilters): FilterChip[] {
  const chips: FilterChip[] = [];

  if (filters.search) {
    chips.push({ key: 'search', label: `"${filters.search}"` });
  }
  if (filters.scene_category) {
    const emoji = sceneCategoryEmoji(filters.scene_category);
    chips.push({
      key: 'scene_category',
      label: `${emoji} ${filters.scene_category}`,
    });
  }
  if (filters.mood) {
    const emoji = moodEmoji(filters.mood);
    chips.push({ key: 'mood', label: `${emoji} ${filters.mood}` });
  }
  if (filters.location_label) {
    chips.push({ key: 'location_label', label: `📍 ${filters.location_label}` });
  }
  if (filters.is_highlight === true) {
    chips.push({ key: 'is_highlight', label: '⭐ Highlights' });
  }
  if (filters.show_hidden === true) {
    chips.push({ key: 'show_hidden', label: 'Hidden On' });
  }
  if (
    filters.min_quality !== undefined &&
    filters.min_quality !== 1 &&
    filters.min_quality !== 0.1
  ) {
    chips.push({
      key: 'min_quality',
      label: `Quality ≥ ${filters.min_quality}`,
    });
  }
  if (filters.max_quality !== undefined && filters.max_quality !== 10) {
    chips.push({
      key: 'max_quality',
      label: `Quality ≤ ${filters.max_quality}`,
    });
  }
  if (filters.min_quality === 0.1) {
    chips.push({ key: 'min_quality', label: '🔬 Analyzed' });
  }
  if (filters.min_duration !== undefined) {
    chips.push({
      key: 'min_duration',
      label: `≥ ${filters.min_duration}s`,
    });
  }
  if (filters.max_duration !== undefined) {
    chips.push({
      key: 'max_duration',
      label: `≤ ${filters.max_duration}s`,
    });
  }

  return chips;
}

export default function ActiveFilters({
  filters,
  onRemoveFilter,
  onClearAll,
}: ActiveFiltersProps) {
  const { t } = useI18n();
  const chips = buildChips(filters);
  if (chips.length === 0) return null;

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-wrap">
      <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{t('filter.filtersLabel')}</span>
      {chips.map((chip) => (
        <button
          key={`${chip.key}-${chip.label}`}
          onClick={() => onRemoveFilter(chip.key)}
          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-200 dark:hover:border-red-800 hover:text-red-600 transition-colors group"
        >
          <span className="capitalize">{chip.label}</span>
          <X className="w-3 h-3 text-gray-400 group-hover:text-red-500" />
        </button>
      ))}
      <button
        onClick={onClearAll}
        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors ml-1"
      >
        {t('filter.clearAll')}
      </button>
    </div>
  );
}
