'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '@/lib/api';
import { useI18n } from '@/lib/i18n-context';
import Link from 'next/link';
import { useState } from 'react';
import CreateProjectModal from '@/components/create-project-modal';
import {
  FolderOpen,
  Plus,
  Video,
  BarChart3,
  ArrowRight,
} from 'lucide-react';

export default function HomePage() {
  const { t } = useI18n();
  const [showCreate, setShowCreate] = useState(false);
  const { data: projects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  return (
    <div className="p-6 max-w-full">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('home.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('home.subtitle')}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {t('sidebar.newProject')}
        </button>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 animate-pulse"
            >
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-3" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            </div>
          ))}
        </div>
      )}

      {projects && projects.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {t('home.noProjects')}
          </h2>
          <p className="text-gray-400 dark:text-gray-500 mb-6 max-w-md">
            {t('home.noProjectsDesc')}
          </p>
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
          >
            <Plus className="w-4 h-4" />
            {t('home.createFirst')}
          </button>
        </div>
      )}

      {projects && projects.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 rounded-xl p-5 transition-all hover:shadow-lg hover:shadow-gray-200/50 dark:hover:shadow-gray-900/50"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-5 h-5 text-blue-500" />
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 group-hover:text-blue-400 transition-colors">
                    {project.name}
                  </h3>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-400 dark:text-gray-500 group-hover:text-gray-500 transition-colors" />
              </div>

              {project.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
                  {project.description}
                </p>
              )}

              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <Video className="w-3.5 h-3.5" />
                  {project.video_count} {t('home.videos')}
                </span>
                <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                  <BarChart3 className="w-3.5 h-3.5" />
                  {project.analyzed_count} {t('home.analyzed')}
                </span>
              </div>

              <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                  {project.video_dir}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
      />
    </div>
  );
}
