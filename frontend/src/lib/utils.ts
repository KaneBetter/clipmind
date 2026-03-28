export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const exp = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exp;
  return `${value.toFixed(value >= 10 || exp === 0 ? 0 : 1)} ${units[exp]}`;
}

export function qualityColor(score: number | null): string {
  if (score === null) return 'text-gray-500';
  if (score >= 7) return 'text-green-500';
  if (score >= 4) return 'text-yellow-500';
  return 'text-red-500';
}

export function qualityBgColor(score: number | null): string {
  if (score === null) return 'bg-gray-700';
  if (score >= 7) return 'bg-green-600';
  if (score >= 4) return 'bg-yellow-600';
  return 'bg-red-600';
}

export function moodEmoji(mood: string | null): string {
  if (!mood) return '';
  const emojiMap: Record<string, string> = {
    epic: '🔥',
    warm: '☀️',
    joyful: '😄',
    calm: '🌊',
    dramatic: '🎭',
    romantic: '💕',
    mysterious: '🌙',
    energetic: '⚡',
    melancholic: '🌧️',
    peaceful: '🕊️',
    adventurous: '🏔️',
    nostalgic: '📷',
  };
  return emojiMap[mood.toLowerCase()] ?? '🎬';
}

export function sceneCategoryEmoji(category: string | null): string {
  if (!category) return '';
  const emojiMap: Record<string, string> = {
    landscape: '🏞️',
    people: '👥',
    food: '🍽️',
    architecture: '🏛️',
    nature: '🌿',
    urban: '🏙️',
    water: '🌊',
    sunset: '🌅',
    night: '🌃',
    indoor: '🏠',
    animal: '🐾',
    aerial: '🛩️',
    street: '🚶',
    portrait: '🧑',
    action: '🎬',
    other: '📁',
  };
  return emojiMap[category.toLowerCase()] ?? '📁';
}

export const SCENE_CATEGORIES = [
  'landscape',
  'people',
  'food',
  'architecture',
  'nature',
  'urban',
  'water',
  'sunset',
  'night',
  'indoor',
  'animal',
  'aerial',
  'street',
  'portrait',
  'action',
  'other',
];

export const MOODS = [
  'epic',
  'warm',
  'joyful',
  'calm',
  'dramatic',
  'romantic',
  'mysterious',
  'energetic',
  'melancholic',
  'peaceful',
  'adventurous',
  'nostalgic',
];
