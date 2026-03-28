import type { SceneConfig } from './types';

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

// Apple-inspired light mode palette
export const COLORS = {
  bg: '#ffffff',
  bgSecondary: '#f5f5f7',
  bgTertiary: '#e8e8ed',
  accent: '#0071e3',
  accentLight: '#2997ff',
  text: '#1d1d1f',
  textSecondary: '#6e6e73',
  textTertiary: '#86868b',
  white: '#ffffff',
  badge: '#34c759',
  terminal: '#1d1d1f',
  terminalGreen: '#30d158',
  terminalBlue: '#0a84ff',
  terminalYellow: '#ffd60a',
  terminalPurple: '#bf5af2',
};

export const SCENES: SceneConfig[] = [
  {
    name: 'Hook',
    durationInFrames: 90,
    screenshots: [],
    title: '',
    subtitle: '',
  },
  {
    name: 'Intro',
    durationInFrames: 90,
    screenshots: [],
    title: 'ClipMind',
    subtitle: 'AI-Powered Video Editing Assistant',
  },
  {
    name: 'Import',
    durationInFrames: 210,
    screenshots: [],
    title: '智能导入',
    subtitle: '一键导入 · GPS 自动聚类 · AI 元数据提取',
  },
  {
    name: 'Map',
    durationInFrames: 180,
    screenshots: [],
    title: 'GPS 地图',
    subtitle: '按拍摄地点自动组织素材',
  },
  {
    name: 'Analysis',
    durationInFrames: 240,
    screenshots: [],
    title: 'AI 场景分析',
    subtitle: 'Gemini 驱动 · 场景识别 · 质量评分 · 情绪标注',
  },
  {
    name: 'Stability',
    durationInFrames: 180,
    screenshots: [],
    title: '稳定性检测',
    subtitle: 'OpenCV 光流算法 · 自动过滤抖动画面',
  },
  {
    name: 'SmartClips',
    durationInFrames: 180,
    screenshots: [],
    title: '智能片段提取',
    subtitle: 'AI 分析 + 稳定性 = 最佳可用片段',
  },
  {
    name: 'ClaudeCLI',
    durationInFrames: 360,
    screenshots: [],
    title: '自然语言编辑',
    subtitle: '用对话创建时间线 · ClipMind 的核心体验',
  },
  {
    name: 'Timeline',
    durationInFrames: 240,
    screenshots: [],
    title: '多轨时间线',
    subtitle: '视频 · 字幕 · 音乐 · 多地点多时间线',
  },
  {
    name: 'Music',
    durationInFrames: 180,
    screenshots: [],
    title: '音乐节拍分析',
    subtitle: 'BPM 检测 · 节拍对齐 · 音画同步',
  },
  {
    name: 'Export',
    durationInFrames: 210,
    screenshots: [],
    title: '一键导出',
    subtitle: '导出到剪映 · 多时间线标签 · 即开即编',
  },
  {
    name: 'Outro',
    durationInFrames: 150,
    screenshots: [],
    title: 'ClipMind',
    subtitle: 'FastAPI + Next.js + Claude CLI',
  },
];
