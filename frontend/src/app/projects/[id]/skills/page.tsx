'use client';

import { use } from 'react';
import { Wand2, Layers, Music, FileOutput, Terminal } from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';

const SKILLS = [
  {
    nameKey: 'skills.timeline',
    descKey: 'skills.timelineDesc',
    icon: Layers,
    color: 'text-indigo-500',
    bg: 'bg-indigo-50 dark:bg-indigo-900/20',
    border: 'border-indigo-200 dark:border-indigo-800',
  },
  {
    nameKey: 'skills.music',
    descKey: 'skills.musicDesc',
    icon: Music,
    color: 'text-purple-500',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    border: 'border-purple-200 dark:border-purple-800',
  },
  {
    nameKey: 'skills.export',
    descKey: 'skills.exportDesc',
    icon: FileOutput,
    color: 'text-green-500',
    bg: 'bg-green-50 dark:bg-green-900/20',
    border: 'border-green-200 dark:border-green-800',
  },
];

export default function SkillsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  use(params);
  const { t } = useI18n();

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3">
          <Wand2 className="w-7 h-7 text-amber-500" />
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{t('skills.title')}</h1>
        </div>
        <p className="text-gray-500 dark:text-gray-400 mt-1">{t('skills.subtitle')}</p>
      </div>

      {/* Skill Cards */}
      <div className="space-y-4 mb-8">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <div
              key={skill.nameKey}
              className={`${skill.bg} border ${skill.border} rounded-xl p-5`}
            >
              <div className="flex items-start gap-4">
                <Icon className={`w-6 h-6 ${skill.color} mt-0.5 shrink-0`} />
                <div>
                  <code className="text-sm font-mono font-bold text-gray-900 dark:text-gray-100">
                    {t(skill.nameKey)}
                  </code>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {t(skill.descKey)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* How To */}
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <Terminal className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{t('skills.howTo')}</h3>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{t('skills.howToDesc')}</p>
        <div className="bg-gray-900 dark:bg-gray-950 rounded-lg p-4 font-mono text-sm text-green-400">
          <p>$ claude</p>
          <p className="text-gray-500 mt-1"># Then use slash commands:</p>
          <p className="mt-1">&gt; /clipmind-timeline</p>
          <p>&gt; /clipmind-music</p>
          <p>&gt; /clipmind-export</p>
        </div>
      </div>
    </div>
  );
}
