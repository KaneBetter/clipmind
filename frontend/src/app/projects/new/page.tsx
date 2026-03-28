'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createProject, resolveFolder } from '@/lib/api';
import { FolderPlus, ArrowLeft, Video, Image, Music, FolderOpen, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useI18n } from '@/lib/i18n-context';

function DirInput({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (path: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [resolving, setResolving] = useState(false);

  const handleFolderSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      // Get the first file's webkitRelativePath: "folderName/file.ext"
      const file = files[0];
      const relativePath = (file as any).webkitRelativePath as string;
      if (!relativePath) return;

      setResolving(true);
      try {
        const result = await resolveFolder(file.name, relativePath);
        if (result.path) {
          onChange(result.path);
        } else {
          // Fallback: show the folder name from relative path
          const folderName = relativePath.split('/')[0];
          onChange(folderName);
        }
      } catch {
        const folderName = relativePath.split('/')[0];
        onChange(folderName);
      }
      setResolving(false);
      // Reset input so same folder can be selected again
      if (inputRef.current) inputRef.current.value = '';
    },
    [onChange]
  );

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
        {icon} {label}
        <span className="text-gray-400 font-normal text-xs ml-1">(optional)</span>
      </label>
      <div className="flex gap-1.5">
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`/path/to/${label.toLowerCase()}`}
          className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm font-mono text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <label className="flex items-center px-3 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer transition-colors">
          {resolving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FolderOpen className="w-4 h-4" />
          )}
          <input
            ref={inputRef}
            type="file"
            /* @ts-expect-error webkitdirectory is non-standard */
            webkitdirectory=""
            directory=""
            className="hidden"
            onChange={handleFolderSelect}
          />
        </label>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  const [name, setName] = useState('');
  const [videoDir, setVideoDir] = useState('');
  const [photoDir, setPhotoDir] = useState('');
  const [musicDir, setMusicDir] = useState('');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();

  const mutation = useMutation({
    mutationFn: () =>
      createProject({
        name,
        video_dir: videoDir || undefined,
        photo_dir: photoDir || undefined,
        music_dir: musicDir || undefined,
      }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      router.push(`/projects/${project.id}`);
    },
  });

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      mutation.mutate();
    },
    [name, mutation]
  );

  return (
    <div className="p-6 max-w-lg mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 text-sm mb-6 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        {t('newProject.back')}
      </Link>

      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6">
        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-6">
          <FolderPlus className="w-5 h-5 text-blue-500" />
          {t('newProject.title')}
        </h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('newProject.name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('newProject.namePlaceholder')}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <DirInput
            label="Video"
            icon={<Video className="w-4 h-4 text-blue-500" />}
            value={videoDir}
            onChange={setVideoDir}
          />
          <DirInput
            label="Photo"
            icon={<Image className="w-4 h-4 text-green-500" />}
            value={photoDir}
            onChange={setPhotoDir}
          />
          <DirInput
            label="Music"
            icon={<Music className="w-4 h-4 text-purple-500" />}
            value={musicDir}
            onChange={setMusicDir}
          />

          {mutation.error && (
            <p className="text-red-400 text-sm">{t('newProject.createError')}</p>
          )}

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full px-4 py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {mutation.isPending ? t('newProject.creating') : t('newProject.create')}
          </button>
        </form>
      </div>
    </div>
  );
}
