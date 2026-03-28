import React from 'react';
import { useCurrentFrame, interpolate } from 'remotion';
import { TerminalWindow } from '../components/TerminalWindow';
import { TerminalLine, TerminalOutput } from '../components/TypingAnimation';
import { COLORS } from '../constants';

export const ClaudeCLIScene: React.FC = () => {
  const frame = useCurrentFrame();
  const clamp = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };

  const fadeIn = interpolate(frame, [0, 15], [0, 1], clamp);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: COLORS.bgSecondary,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeIn,
        padding: '40px 80px',
      }}
    >
      {/* Title */}
      <div
        style={{
          position: 'absolute',
          top: 36,
          left: '50%',
          transform: 'translateX(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          opacity: interpolate(frame, [5, 20], [0, 1], clamp),
        }}
      >
        <div
          style={{
            background: `${COLORS.accent}12`,
            border: `1px solid ${COLORS.accent}30`,
            borderRadius: 8,
            padding: '5px 14px',
            color: COLORS.accent,
            fontSize: 15,
            fontFamily: '"SF Mono", ui-monospace, monospace',
            fontWeight: 600,
          }}
        >
          Claude CLI
        </div>
        <span
          style={{
            color: COLORS.textSecondary,
            fontSize: 17,
            fontFamily: '"SF Pro Text", "PingFang SC", -apple-system, sans-serif',
          }}
        >
          用自然语言编辑时间线
        </span>
      </div>

      <div style={{ width: '100%', maxWidth: 1400 }}>
        <TerminalWindow title="claude — ~/code/video — zsh">
          {/* Phase 1: Create timeline */}
          <TerminalLine
            command="/clipmind-timeline"
            startFrame={10}
            speed={3}
            promptColor={COLORS.terminalGreen}
          />

          {/* Phase 2: Output */}
          <TerminalOutput
            startFrame={60}
            lineDelay={5}
            lines={[
              { text: '', color: 'transparent' },
              { text: '🎬 Reading clips for project "Japan 2025"...', color: COLORS.terminalBlue },
              { text: '  Found 247 videos across 15 locations', color: '#8b949e' },
              { text: '  Extracted 186 usable clips (stability > 0.6)', color: '#8b949e' },
              { text: '', color: 'transparent' },
              { text: '✅ Created timeline "Kyoto · 京都"', color: COLORS.terminalGreen },
              { text: '   18 clips · 2:34 duration · 12 subtitles', color: '#8b949e', indent: 1 },
              { text: '✅ Created timeline "Osaka · 大阪"', color: COLORS.terminalGreen },
              { text: '   24 clips · 3:12 duration · 15 subtitles', color: '#8b949e', indent: 1 },
              { text: '✅ Created timeline "Tokyo · 东京"', color: COLORS.terminalGreen },
              { text: '   31 clips · 4:05 duration · 20 subtitles', color: '#8b949e', indent: 1 },
            ]}
          />

          {/* Phase 3: Natural language edit */}
          {frame >= 170 && (
            <div style={{ marginTop: 12 }}>
              <TerminalLine
                prompt="❯ "
                command="京都的时间线加一些日落的镜头，最后用淡出结尾"
                startFrame={175}
                speed={2}
                promptColor={COLORS.terminalYellow}
                commandColor="#e6edf3"
              />
            </div>
          )}

          {/* Phase 4: Edit response */}
          <TerminalOutput
            startFrame={230}
            lineDelay={5}
            lines={[
              { text: '', color: 'transparent' },
              { text: '🔍 Searching sunset clips in Kyoto location...', color: COLORS.terminalBlue },
              { text: '   Found 3 sunset clips (quality > 7)', color: '#8b949e', indent: 1 },
              { text: '', color: 'transparent' },
              { text: '✏️  Updated timeline "Kyoto · 京都":', color: COLORS.terminalGreen },
              { text: '   + Added clip #142 "Golden temple sunset" at position 16', color: COLORS.terminalGreen, indent: 1 },
              { text: '   + Added clip #158 "Bamboo grove dusk" at position 17', color: COLORS.terminalGreen, indent: 1 },
              { text: '   ~ Changed last transition to fade_black', color: '#d29922', indent: 1 },
            ]}
          />

          {/* Phase 5: Export */}
          {frame >= 290 && (
            <div style={{ marginTop: 12 }}>
              <TerminalLine
                command="/clipmind-export"
                startFrame={293}
                speed={3}
                promptColor={COLORS.terminalGreen}
              />
            </div>
          )}

          <TerminalOutput
            startFrame={325}
            lineDelay={4}
            lines={[
              { text: '', color: 'transparent' },
              { text: '📦 Exporting all timelines to JianYing...', color: COLORS.terminalBlue },
              { text: '   Draft registered: ~/Movies/JianyingPro/.../Japan 2025', color: COLORS.terminalGreen, indent: 1 },
              { text: '   3 timelines · Ready to edit ✨', color: COLORS.terminalGreen, indent: 1 },
            ]}
          />
        </TerminalWindow>
      </div>
    </div>
  );
};
