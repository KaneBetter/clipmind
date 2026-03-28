'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProject, resolveFolder } from '@/lib/api';
import {
  X,
  Check,
  Video,
  Image,
  Music,
  FolderOpen,
  Settings,
  Loader2,
} from 'lucide-react';

interface SettingsModalProps {
  projectId: number;
  name: string;
  description: string | null;
  videoDir: string | null;
  photoDir: string | null;
  musicDir: string | null;
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({
  projectId,
  name,
  description,
  videoDir,
  photoDir,
  musicDir,
  open,
  onClose,
}: SettingsModalProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: name,
    description: description ?? '',
    video_dir: videoDir ?? '',
    photo_dir: photoDir ?? '',
    music_dir: musicDir ?? '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name,
        description: description ?? '',
        video_dir: videoDir ?? '',
        photo_dir: photoDir ?? '',
        music_dir: musicDir ?? '',
      });
    }
  }, [open, name, description, videoDir, photoDir, musicDir]);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateProject(projectId, {
        name: form.name,
        description: form.description || undefined,
        video_dir: form.video_dir,
        photo_dir: form.photo_dir,
        music_dir: form.music_dir,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
  });

  const handleFolderSelect = async (key: string, files: FileList) => {
    if (files.length === 0) return;
    const relativePath = (files[0] as any).webkitRelativePath as string;
    if (!relativePath) return;
    try {
      const result = await resolveFolder(files[0].name, relativePath);
      if (result.path) {
        setForm({ ...form, [key]: result.path });
      }
    } catch {
      setForm({ ...form, [key]: relativePath.split('/')[0] });
    }
  };

  const updateField = (key: string, value: string) => {
    setForm({ ...form, [key]: value });
  };

  if (!open) return null;

  const dirFields = [
    { key: 'video_dir', label: 'Video Dir', icon: <Video className="w-4 h-4 text-blue-500" /> },
    { key: 'photo_dir', label: 'Photo Dir', icon: <Image className="w-4 h-4 text-green-500" /> },
    { key: 'music_dir', label: 'Music Dir', icon: <Music className="w-4 h-4 text-purple-500" /> },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg mx-4 bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Project Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Project Name
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              rows={3}
              placeholder="Project description..."
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Directories
            </label>
            {dirFields.map(({ key, label, icon }) => (
              <div key={key} className="flex items-center gap-2">
                {icon}
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-16 shrink-0">
                  {label}
                </span>
                <input
                  type="text"
                  value={form[key as keyof typeof form]}
                  onChange={(e) => updateField(key, e.target.value)}
                  placeholder={`/path/to/${label.toLowerCase().replace(' dir', '')}`}
                  className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <label className="p-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  <FolderOpen className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    {...({ webkitdirectory: '', directory: '' } as any)}
                    className="hidden"
                    onChange={(e) =>
                      e.target.files && handleFolderSelect(key, e.target.files)
                    }
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <X className="w-4 h-4" />
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.name.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg"
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
