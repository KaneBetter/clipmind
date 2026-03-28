import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { COLORS } from '../constants';

export const ExportScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const fadeIn = interpolate(frame, [0, 15], [0, 1], clamp);

  const step1Opacity = interpolate(frame, [15, 30], [0, 1], clamp);
  const step1X = interpolate(frame, [15, 30], [-30, 0], clamp);

  const step2Opacity = interpolate(frame, [50, 65], [0, 1], clamp);
  const step2X = interpolate(frame, [50, 65], [-30, 0], clamp);

  const step3Opacity = interpolate(frame, [85, 100], [0, 1], clamp);
  const step3X = interpolate(frame, [85, 100], [-30, 0], clamp);

  const arrow1Opacity = interpolate(frame, [35, 45], [0, 1], clamp);
  const arrow2Opacity = interpolate(frame, [70, 80], [0, 1], clamp);

  const tabsOpacity = interpolate(frame, [105, 120], [0, 1], clamp);
  const successOpacity = interpolate(frame, [130, 145], [0, 1], clamp);
  const successScale = interpolate(frame, [130, 150], [0.95, 1], clamp);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: COLORS.bg,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn,
        padding: '0 120px',
      }}
    >
      {/* Title */}
      <div
        style={{
          fontSize: 48,
          fontWeight: 700,
          color: COLORS.text,
          fontFamily: '"SF Pro Display", "PingFang SC", -apple-system, sans-serif',
          marginBottom: 56,
          letterSpacing: -0.5,
        }}
      >
        一键导出到
        <span style={{ color: COLORS.accent }}> 剪映</span>
      </div>

      {/* Pipeline */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
        <PipelineStep
          icon="🎬" title="ClipMind" detail="3 个时间线"
          opacity={step1Opacity} translateX={step1X} accentColor={COLORS.accent}
        />
        <Arrow opacity={arrow1Opacity} />
        <PipelineStep
          icon="⚙" title="CapCut Mate" detail="路径修复 · 轨道合并"
          opacity={step2Opacity} translateX={step2X} accentColor="#ff9500"
        />
        <Arrow opacity={arrow2Opacity} />
        <PipelineStep
          icon="✂" title="剪映" detail="即开即编"
          opacity={step3Opacity} translateX={step3X} accentColor={COLORS.badge}
        />
      </div>

      {/* JianYing tabs */}
      <div
        style={{
          opacity: tabsOpacity,
          marginTop: 44,
          display: 'flex',
          gap: 2,
        }}
      >
        <TabMock label="Kyoto · 京都" active />
        <TabMock label="Osaka · 大阪" />
        <TabMock label="Tokyo · 东京" />
      </div>

      {/* Success */}
      <div
        style={{
          opacity: successOpacity,
          transform: `scale(${successScale})`,
          marginTop: 28,
          padding: '10px 28px',
          borderRadius: 20,
          background: `${COLORS.badge}14`,
          border: `1px solid ${COLORS.badge}30`,
          color: COLORS.badge,
          fontSize: 17,
          fontWeight: 600,
          fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
        }}
      >
        草稿已注册 · 打开剪映即可编辑
      </div>
    </div>
  );
};

function PipelineStep({
  icon, title, detail, opacity, translateX, accentColor,
}: {
  icon: string; title: string; detail: string;
  opacity: number; translateX: number; accentColor: string;
}) {
  return (
    <div
      style={{
        opacity,
        transform: `translateX(${translateX}px)`,
        background: COLORS.bg,
        border: '1px solid rgba(0,0,0,0.08)',
        borderRadius: 16,
        padding: '28px 36px',
        textAlign: 'center',
        minWidth: 200,
        boxShadow: '0 4px 16px rgba(0,0,0,0.04)',
      }}
    >
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{
        fontSize: 22, fontWeight: 700, color: COLORS.text,
        fontFamily: '"SF Pro Display", "PingFang SC", -apple-system, sans-serif',
      }}>{title}</div>
      <div style={{
        fontSize: 14, color: COLORS.textTertiary, marginTop: 6,
        fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
      }}>{detail}</div>
    </div>
  );
}

function Arrow({ opacity }: { opacity: number }) {
  return (
    <div style={{ opacity, color: COLORS.textTertiary, fontSize: 24, fontWeight: 300 }}>
      {'→'}
    </div>
  );
}

function TabMock({ label, active = false }: { label: string; active?: boolean }) {
  return (
    <div
      style={{
        padding: '7px 18px',
        borderRadius: '8px 8px 0 0',
        background: active ? COLORS.bg : COLORS.bgSecondary,
        border: `1px solid ${active ? 'rgba(0,0,0,0.1)' : 'transparent'}`,
        borderBottom: 'none',
        color: active ? COLORS.text : COLORS.textTertiary,
        fontSize: 14,
        fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </div>
  );
}
