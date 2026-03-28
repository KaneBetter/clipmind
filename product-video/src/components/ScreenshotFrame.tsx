import React from 'react';
import { Img } from 'remotion';

interface ScreenshotFrameProps {
  src: string;
  url: string;
  scale?: number;
  children?: React.ReactNode;
}

export const ScreenshotFrame: React.FC<ScreenshotFrameProps> = ({
  src,
  url,
  scale = 1,
  children,
}) => {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
        transform: `scale(${scale})`,
      }}
    >
      <div
        style={{
          background: '#1e293b',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ef4444' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#eab308' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#22c55e' }} />
        </div>
        <div
          style={{
            flex: 1,
            background: '#0f172a',
            borderRadius: 6,
            padding: '4px 12px',
            color: '#94a3b8',
            fontSize: 13,
            fontFamily: 'monospace',
          }}
        >
          {url}
        </div>
      </div>
      <div style={{ position: 'relative' }}>
        <Img src={src} style={{ width: '100%', display: 'block' }} />
        {children}
      </div>
    </div>
  );
};
