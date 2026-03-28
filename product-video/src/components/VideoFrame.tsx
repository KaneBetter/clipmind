import React from 'react';
import { OffthreadVideo, staticFile } from 'remotion';

interface VideoFrameProps {
  src: string;
  url: string;
  playbackRate?: number;
  children?: React.ReactNode;
}

/**
 * Apple-style light browser chrome wrapping a recorded video.
 */
export const VideoFrame: React.FC<VideoFrameProps> = ({
  src,
  url,
  playbackRate = 1,
  children,
}) => {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.08)',
      }}
    >
      {/* macOS-style title bar */}
      <div
        style={{
          background: '#f5f5f7',
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          borderBottom: '1px solid rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ display: 'flex', gap: 7 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
        </div>
        <div
          style={{
            flex: 1,
            background: '#ffffff',
            borderRadius: 6,
            padding: '4px 12px',
            color: '#86868b',
            fontSize: 13,
            fontFamily: '"SF Mono", ui-monospace, monospace',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          {url}
        </div>
      </div>
      {/* Video content */}
      <div style={{ position: 'relative' }}>
        <OffthreadVideo
          src={staticFile(src)}
          style={{ width: '100%', display: 'block' }}
          playbackRate={playbackRate}
          muted
        />
        {children}
      </div>
    </div>
  );
};
