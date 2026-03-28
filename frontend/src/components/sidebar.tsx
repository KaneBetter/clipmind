'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { fetchProjects } from '@/lib/api';
import { useTheme } from '@/lib/theme-context';
import { useI18n } from '@/lib/i18n-context';
import {
  Film,
  FolderOpen,
  Plus,
  Video,
  Map,
  LayoutDashboard,
  Brain,
  Activity,
  Sparkles,
  Wand2,
  Music,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  Moon,
  Languages,
} from 'lucide-react';

const NAV_KEYS = [
  { path: '', icon: LayoutDashboard, labelKey: 'nav.dashboard', exact: true },
  { path: '/videos', icon: Video, labelKey: 'nav.media' },
  { path: '/analysis', icon: Brain, labelKey: 'nav.aiAnalysis' },
  { path: '/stability', icon: Activity, labelKey: 'nav.stability' },
  { path: '/map', icon: Map, labelKey: 'nav.locations' },
  { path: '/copywrite', icon: Sparkles, labelKey: 'nav.aiCopywrite' },
  { path: '/music', icon: Music, labelKey: 'nav.music' },
  { path: '/timeline', icon: Layers, labelKey: 'nav.timeline' },
  { path: '/skills', icon: Wand2, labelKey: 'nav.skills' },
];

function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  const [show, setShow] = useState(false);
  return (
    <div
      className="relative"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-gray-800 text-white text-xs rounded whitespace-nowrap z-50 pointer-events-none">
          {label}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { theme, toggleTheme } = useTheme();
  const { locale, toggleLocale, t } = useI18n();
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  });

  if (collapsed) {
    return (
      <aside className="w-14 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-full">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-center">
          <Tooltip label="ClipMind">
            <Link href="/">
              <Film className="w-6 h-6 text-blue-500" />
            </Link>
          </Tooltip>
        </div>

        <nav className="flex-1 overflow-y-auto py-2 px-1.5">
          {projects?.map((project) => {
            const isActive = pathname.startsWith(`/projects/${project.id}`);
            if (!isActive) {
              return (
                <Tooltip key={project.id} label={project.name}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-center p-2 mb-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-800 dark:hover:text-gray-300"
                  >
                    <FolderOpen className="w-5 h-5" />
                  </Link>
                </Tooltip>
              );
            }
            return (
              <div key={project.id} className="space-y-0.5">
                <Tooltip label={project.name}>
                  <Link
                    href={`/projects/${project.id}`}
                    className="flex items-center justify-center p-2 rounded-lg bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                  >
                    <FolderOpen className="w-5 h-5" />
                  </Link>
                </Tooltip>
                {NAV_KEYS.map((item) => {
                  const href = `/projects/${project.id}${item.path}`;
                  const active = item.exact
                    ? pathname === href
                    : pathname.includes(item.path);
                  const Icon = item.icon;
                  return (
                    <Tooltip key={item.path} label={t(item.labelKey)}>
                      <Link
                        href={href}
                        className={`flex items-center justify-center p-2 rounded-lg transition-colors ${
                          active
                            ? 'text-blue-500'
                            : 'text-gray-400 hover:text-gray-700 hover:bg-gray-50 dark:hover:text-gray-300 dark:hover:bg-gray-800'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                      </Link>
                    </Tooltip>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className="p-1.5 border-t border-gray-200 dark:border-gray-700 space-y-1">
          <Tooltip label={locale === 'en' ? '切换中文' : 'Switch to English'}>
            <button
              onClick={toggleLocale}
              className="flex items-center justify-center w-full p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <Languages className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip label={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <button
              onClick={toggleTheme}
              className="flex items-center justify-center w-full p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            </button>
          </Tooltip>
          <Tooltip label={t('sidebar.newProject')}>
            <Link
              href="/projects/new"
              className="flex items-center justify-center p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
            >
              <Plus className="w-4 h-4" />
            </Link>
          </Tooltip>
          <Tooltip label={t('sidebar.expand')}>
            <button
              onClick={() => setCollapsed(false)}
              className="flex items-center justify-center w-full p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-60 shrink-0 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex flex-col h-full">
      <div className="p-3 border-b border-gray-200 dark:border-gray-700">
        <Link href="/" className="flex items-center gap-2 text-gray-900 dark:text-gray-100">
          <Film className="w-5 h-5 text-blue-500" />
          <span className="text-base font-bold">ClipMind</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-1.5">
        <div className="flex items-center justify-between mb-1.5 px-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('sidebar.projects')}
          </span>
          <Link href="/projects/new" className="text-gray-400 hover:text-blue-500">
            <Plus className="w-4 h-4" />
          </Link>
        </div>
        <ul className="space-y-0.5">
          {projects?.map((project) => {
            const isActive = pathname.startsWith(`/projects/${project.id}`);
            return (
              <li key={project.id}>
                <Link
                  href={`/projects/${project.id}`}
                  className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm ${
                    isActive
                      ? 'bg-gray-100 text-gray-900 font-medium dark:bg-gray-800 dark:text-gray-100'
                      : 'text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  }`}
                >
                  <FolderOpen className="w-5 h-5 shrink-0" />
                  <span className="truncate">{project.name}</span>
                </Link>
                {isActive && (
                  <ul className="ml-4 mt-0.5 space-y-0.5">
                    {NAV_KEYS.map((item) => {
                      const href = `/projects/${project.id}${item.path}`;
                      const active = item.exact ? pathname === href : pathname.includes(item.path);
                      const Icon = item.icon;
                      return (
                        <li key={item.path}>
                          <Link
                            href={href}
                            className={`flex items-center gap-2.5 px-2.5 py-2 rounded text-sm ${
                              active
                                ? 'text-blue-500 font-medium'
                                : 'text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                          >
                            <Icon className="w-4.5 h-4.5 shrink-0" />
                            {t(item.labelKey)}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-1.5 border-t border-gray-200 dark:border-gray-700 space-y-1">
        {/* Language & Theme toggles */}
        <div className="flex gap-1">
          <button
            onClick={toggleLocale}
            className="flex-1 flex items-center justify-center gap-1.5 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
          >
            <Languages className="w-3.5 h-3.5" />
            {locale === 'en' ? '中文' : 'EN'}
          </button>
          <button
            onClick={toggleTheme}
            className="flex-1 flex items-center justify-center gap-1.5 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-xs"
          >
            {theme === 'light' ? (
              <>
                <Moon className="w-3.5 h-3.5" />
                Dark
              </>
            ) : (
              <>
                <Sun className="w-3.5 h-3.5" />
                Light
              </>
            )}
          </button>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg"
        >
          <Plus className="w-3.5 h-3.5" /> {t('sidebar.newProject')}
        </Link>
        <button
          onClick={() => setCollapsed(true)}
          className="flex items-center justify-center w-full p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <PanelLeftClose className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}
