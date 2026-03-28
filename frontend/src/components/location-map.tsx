'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import type { Video } from '@/lib/api';
import { thumbnailUrl } from '@/lib/api';
import { getMapStyle, type MapStyle } from '@/lib/map-styles';
import MapStyleSwitcher from '@/components/map-style-switcher';

// Fix leaflet default marker icons in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface LocationMapProps {
  videos: Video[];
  mode: 'markers' | 'heatmap';
}

export default function LocationMap({ videos, mode }: LocationMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>(getMapStyle('street'));

  // Initialize map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([37.0, -110.0], 5);

    const tile = L.tileLayer(mapStyle.url, {
      maxZoom: mapStyle.maxZoom,
      subdomains: mapStyle.subdomains ?? 'abc',
    }).addTo(map);

    tileLayerRef.current = tile;
    mapInstanceRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      layerRef.current = null;
      tileLayerRef.current = null;
    };
  }, []);

  // Switch tile layer when style changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const tile = L.tileLayer(mapStyle.url, {
      maxZoom: mapStyle.maxZoom,
      subdomains: mapStyle.subdomains ?? 'abc',
    }).addTo(map);

    tileLayerRef.current = tile;
  }, [mapStyle]);

  // Update markers/heatmap when data or mode changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;

    layer.clearLayers();

    const points = videos.filter(
      (v) => v.lat !== null && v.lon !== null
    );

    if (points.length === 0) return;

    if (mode === 'markers') {
      const isDark = mapStyle.id === 'dark' || mapStyle.id === 'satellite';
      for (const v of points) {
        const isPhoto = v.media_type === 'photo';
        const marker = L.circleMarker([v.lat!, v.lon!], {
          radius: 8,
          fillColor: isPhoto ? '#10b981' : '#3b82f6',
          color: isDark ? '#000' : '#fff',
          weight: 2,
          fillOpacity: 0.85,
        });

        const thumbSrc = v.thumbnail_path
          ? thumbnailUrl(v.thumbnail_path)
          : '';
        const thumbHtml = thumbSrc
          ? `<img src="${thumbSrc}" class="w-full h-24 object-cover rounded-t" />`
          : '';

        marker.bindPopup(
          `<div style="min-width:160px;font-family:system-ui">
            ${thumbHtml}
            <div style="padding:8px">
              <div style="font-size:12px;font-weight:600;margin-bottom:4px;word-break:break-all">${v.filename}</div>
              <div style="font-size:11px;color:#6b7280">
                ${v.location_label ?? `${v.lat!.toFixed(4)}, ${v.lon!.toFixed(4)}`}
              </div>
              <span style="font-size:10px;background:${isPhoto ? '#d1fae5' : '#dbeafe'};color:${isPhoto ? '#065f46' : '#1e40af'};padding:2px 6px;border-radius:4px;margin-top:4px;display:inline-block">
                ${isPhoto ? 'PHOTO' : 'VIDEO'}
              </span>
            </div>
          </div>`,
          { maxWidth: 200, className: 'rounded-popup' }
        );

        marker.addTo(layer);
      }
    } else {
      // Heatmap mode
      const heatPoints: [number, number, number][] = points.map((v) => [
        v.lat!,
        v.lon!,
        0.5, // intensity
      ]);

      const heat = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 17,
        gradient: {
          0.2: '#2563eb',
          0.4: '#06b6d4',
          0.6: '#10b981',
          0.8: '#f59e0b',
          1.0: '#ef4444',
        },
      });
      layer.addLayer(heat);
    }

    // Fit bounds
    const bounds = L.latLngBounds(
      points.map((v) => [v.lat!, v.lon!] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [videos, mode, mapStyle]);

  return (
    <div className="relative">
      <div
        ref={mapRef}
        className="w-full h-[450px] rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 z-0"
      />
      <div className="absolute top-3 right-3 z-[1000]">
        <MapStyleSwitcher
          current={mapStyle.id}
          onChange={setMapStyle}
        />
      </div>
    </div>
  );
}
