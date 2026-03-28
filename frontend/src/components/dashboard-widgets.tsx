'use client';

import { useState, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProject } from '@/lib/api';
import Link from 'next/link';
import { Pencil, Loader2 } from 'lucide-react';

/* --- StatCard --- */

export function StatCard({
  href,
  icon,
  label,
  value,
  subtitle,
  hoverColor,
  progress,
  progressColor,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  hoverColor: string;
  progress?: number;
  progressColor?: string;
}) {
  return (
    <Link
      href={href}
      className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-3 ${hoverColor} transition-colors`}
    >
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1.5">
        {icon}
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {subtitle && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">{subtitle}</p>
      )}
      {progress !== undefined && (
        <div className="mt-1.5">
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
            <div
              className={`${progressColor} h-1.5 rounded-full transition-all`}
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">{progress}%</p>
        </div>
      )}
    </Link>
  );
}

/* --- MiniRing --- */

export function MiniRing({ pct, color }: { pct: number; color: string }) {
  const r = 14;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative w-8 h-8">
      <svg className="w-8 h-8 -rotate-90" viewBox="0 0 40 40">
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          className="stroke-gray-200 dark:stroke-gray-700"
          strokeWidth="3"
        />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          className={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-gray-600 dark:text-gray-300">
        {pct}%
      </span>
    </div>
  );
}

/* --- DetailStat --- */

export function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
    </div>
  );
}

/* --- EditableName --- */

export function EditableName({
  projectId,
  name,
}: {
  projectId: number;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (newName: string) => updateProject(projectId, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      setEditing(false);
    },
  });

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== name) {
      mutation.mutate(trimmed);
    } else {
      setDraft(name);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSave();
            if (e.key === 'Escape') {
              setDraft(name);
              setEditing(false);
            }
          }}
          onBlur={handleSave}
          className="text-2xl font-bold text-gray-900 dark:text-gray-100 bg-transparent border-b-2 border-blue-500 outline-none px-0 py-0"
        />
        {mutation.isPending && (
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
        )}
      </div>
    );
  }

  return (
    <h1
      className="text-2xl font-bold text-gray-900 dark:text-gray-100 group cursor-pointer inline-flex items-center gap-2"
      onClick={() => {
        setDraft(name);
        setEditing(true);
      }}
      title="Click to rename"
    >
      {name}
      <Pencil className="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />
    </h1>
  );
}
