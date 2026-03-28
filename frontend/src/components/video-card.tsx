'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Star, MapPin, Play, Image, Eye, EyeOff, RefreshCw } from 'lucide-react';
import type { Video } from '@/lib/api';
import { thumbnailUrl, updateVideoHidden, regenerateThumbnail } from '@/lib/api';
import {
  formatDuration,
  moodEmoji,
} from '@/lib/utils';

interface VideoCardProps {
  video: Video;
  projectId: number;
  thumbVersion?: number;
}

function QualityDot({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 7 ? 'bg-green-400' : score >= 4 ? 'bg-yellow-400' : 'bg-red-400';
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/50 backdrop-blur-sm rounded-full px-1.5 py-0.5">
      <div className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] font-semibold text-white">
        {score.toFixed(1)}
      </span>
    </div>
  );
}

export default function VideoCard({ video, projectId, thumbVersion }: VideoCardProps) {
  const queryClient = useQueryClient();
  const [localThumbVersion, setLocalThumbVersion] = useState(thumbVersion ?? 0);
  const thumbUrl = thumbnailUrl(video.thumbnail_path, localThumbVersion || thumbVersion);
  const primaryLabel = video.location_label || video.filename;
  const secondaryLabel = video.location_label ? video.filename : null;
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
      className="group block rounded-xl overflow-hidden bg-white dark:bg-gray-900 border border-gray-200/80 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-all duration-200 hover:shadow-md"
    >
      <div className="relative aspect-video bg-gray-100 dark:bg-gray-800 overflow-hidden">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt={video.filename}
            className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
            {video.media_type === 'photo' ? (
              <Image className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8" />
            )}
          </div>
        )}

        {/* Duration / Photo badge */}
        <div className="absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white text-[11px] px-2 py-0.5 rounded-md font-medium">
          {video.media_type === 'photo'
            ? 'PHOTO'
            : formatDuration(video.duration)}
        </div>

        {/* Quality dot */}
        <QualityDot score={video.quality_score} />

        {/* Highlight star */}
        {video.is_highlight && (
          <div className="absolute top-2 left-2 drop-shadow-sm">
            <Star className="w-4.5 h-4.5 text-yellow-400 fill-yellow-400" />
          </div>
        )}

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            hideMutation.mutate(!video.is_hidden);
          }}
          className={`absolute top-2 left-8 z-10 rounded-full bg-black/55 p-1.5 text-white transition-opacity ${
            video.is_hidden ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          title={video.is_hidden ? '取消屏蔽' : '屏蔽'}
        >
          {video.is_hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            regenMutation.mutate();
          }}
          disabled={regenMutation.isPending}
          className="absolute top-2 left-16 z-10 rounded-full bg-black/55 p-1.5 text-white opacity-0 group-hover:opacity-100 transition-opacity"
          title="重建缩略图"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${regenMutation.isPending ? 'animate-spin' : ''}`} />
        </button>

        {video.is_hidden && (
          <div className="absolute inset-x-2 top-10 z-10 rounded-md bg-black/65 px-2 py-1 text-[10px] font-medium text-white">
            Hidden · Tap eye to unhide
          </div>
        )}

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-200 flex items-center justify-center">
          <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
        </div>
      </div>

      <div className="px-3 py-2.5">
        {/* Primary label: location or filename */}
        <div className="flex items-center gap-1.5">
          {video.location_label && (
            <MapPin className="w-3 h-3 text-gray-400 dark:text-gray-500 shrink-0" />
          )}
          <p className="text-sm text-gray-900 dark:text-gray-100 truncate font-medium leading-tight">
            {primaryLabel}
          </p>
        </div>

        {/* Secondary info row */}
        <div className="flex items-center gap-2 mt-1">
          {secondaryLabel && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate">
              {secondaryLabel}
            </span>
          )}
          {video.mood && (
            <span className="text-[11px] text-gray-500 dark:text-gray-400 shrink-0">
              {moodEmoji(video.mood)}
            </span>
          )}
          {video.scene_category && (
            <span className="text-[11px] text-gray-400 dark:text-gray-500 capitalize shrink-0">
              {video.scene_category}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
