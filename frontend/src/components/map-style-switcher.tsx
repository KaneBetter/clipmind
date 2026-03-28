'use client';

import { useState } from 'react';
import { MAP_STYLES, type MapStyle } from '@/lib/map-styles';
import { Layers } from 'lucide-react';

interface MapStyleSwitcherProps {
  current: string;
  onChange: (style: MapStyle) => void;
}

export default function MapStyleSwitcher({
  current,
  onChange,
}: MapStyleSwitcherProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="flex items-center gap-1 bg-white/90 dark:bg-gray-900/90 backdrop-blur-sm rounded-lg shadow-md border border-gray-200 dark:border-gray-700 p-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className="p-1.5 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        title="Map style"
      >
        <Layers className="w-3.5 h-3.5" />
      </button>
      {expanded &&
        MAP_STYLES.map((style) => (
          <button
            key={style.id}
            onClick={() => {
              onChange(style);
              setExpanded(false);
            }}
            className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
              current === style.id
                ? 'bg-blue-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
            }`}
          >
            {style.label}
          </button>
        ))}
    </div>
  );
}
