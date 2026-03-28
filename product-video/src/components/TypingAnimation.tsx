import React from 'react';
import { useCurrentFrame } from 'remotion';

interface TypingAnimationProps {
  text: string;
  startFrame: number;
  /** Frames per character */
  speed?: number;
  color?: string;
  showCursor?: boolean;
}

export const TypingAnimation: React.FC<TypingAnimationProps> = ({
  text,
  startFrame,
  speed = 2,
  color = '#f8fafc',
  showCursor = true,
}) => {
  const frame = useCurrentFrame();
  const elapsed = frame - startFrame;

  if (elapsed < 0) return null;

  const charsVisible = Math.min(Math.floor(elapsed / speed), text.length);
  const visibleText = text.slice(0, charsVisible);
  const isTyping = charsVisible < text.length;
  const cursorVisible = showCursor && (isTyping || (frame % 30 < 15));

  return (
    <span style={{ color }}>
      {visibleText}
      {cursorVisible && (
        <span style={{ opacity: 0.8, color: '#58a6ff' }}>
          {'█'}
        </span>
      )}
    </span>
  );
};

interface TerminalLineProps {
  prompt?: string;
  command: string;
  startFrame: number;
  speed?: number;
  promptColor?: string;
  commandColor?: string;
}

export const TerminalLine: React.FC<TerminalLineProps> = ({
  prompt = '$ ',
  command,
  startFrame,
  speed = 2,
  promptColor = '#3fb950',
  commandColor = '#f8fafc',
}) => {
  const frame = useCurrentFrame();
  if (frame < startFrame) return null;

  return (
    <div>
      <span style={{ color: promptColor }}>{prompt}</span>
      <TypingAnimation
        text={command}
        startFrame={startFrame}
        speed={speed}
        color={commandColor}
        showCursor
      />
    </div>
  );
};

interface TerminalOutputProps {
  lines: Array<{ text: string; color?: string; indent?: number }>;
  startFrame: number;
  /** Frames between each line appearing */
  lineDelay?: number;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  lines,
  startFrame,
  lineDelay = 4,
}) => {
  const frame = useCurrentFrame();
  if (frame < startFrame) return null;

  return (
    <div>
      {lines.map((line, i) => {
        const lineStart = startFrame + i * lineDelay;
        if (frame < lineStart) return null;
        return (
          <div key={i} style={{ paddingLeft: (line.indent ?? 0) * 16 }}>
            <span style={{ color: line.color ?? '#8b949e' }}>{line.text}</span>
          </div>
        );
      })}
    </div>
  );
};
