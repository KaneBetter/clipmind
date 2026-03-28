'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchLocations } from '@/lib/api';
import { MapPin } from 'lucide-react';

export default function LocationSelector({
  projectId,
  value,
  onChange,
}: {
  projectId: number;
  value: string | undefined;
  onChange: (location: string | undefined) => void;
}) {
  const { data: locations } = useQuery({
    queryKey: ['locations', projectId],
    queryFn: () => fetchLocations(projectId),
  });

  if (!locations || locations.length === 0) return null;

  return (
    <div className="flex items-center gap-2">
      <MapPin className="w-4 h-4 text-teal-500" />
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || undefined)}
        className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="">All Locations</option>
        {locations.map((loc) => (
          <option key={loc.label} value={loc.label}>
            {loc.label} ({loc.count})
          </option>
        ))}
      </select>
    </div>
  );
}
