'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { getMapStyle, type MapStyle } from '@/lib/map-styles';
import MapStyleSwitcher from '@/components/map-style-switcher';

// Fix leaflet default marker icons in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:
    'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MiniMapProps {
  lat: number;
  lon: number;
}

export default function MiniMap({ lat, lon }: MiniMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyle>(getMapStyle('satellite'));

  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    const map = L.map(mapRef.current, {
      center: [lat, lon],
      zoom: 14,
      zoomControl: false,
      attributionControl: false,
      dragging: true,
      scrollWheelZoom: false,
    });

    const tile = L.tileLayer(mapStyle.url, {
      maxZoom: mapStyle.maxZoom,
      subdomains: mapStyle.subdomains ?? 'abc',
    }).addTo(map);

    tileLayerRef.current = tile;

    L.circleMarker([lat, lon], {
      radius: 7,
      fillColor: '#3b82f6',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9,
    }).addTo(map);

    mapInstanceRef.current = map;

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
    };
  }, [lat, lon]);

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

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute bottom-2 right-2 z-[1000]">
        <MapStyleSwitcher
          current={mapStyle.id}
          onChange={setMapStyle}
        />
      </div>
    </div>
  );
}
