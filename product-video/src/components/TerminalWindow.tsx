import React from 'react';

interface TerminalWindowProps {
  title?: string;
  children: React.ReactNode;
}

/**
 * macOS Terminal window — keeps dark terminal body for contrast,
 * with Apple-style light title bar chrome.
 */
export const TerminalWindow: React.FC<TerminalWindowProps> = ({
  title = 'claude — zsh — 120×40',
  children,
}) => {
  return (
    <div
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)',
        border: '1px solid rgba(0,0,0,0.1)',
        width: '100%',
      }}
    >
      {/* macOS title bar */}
      <div
        style={{
          background: '#e8e8ed',
          padding: '10px 16px',
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
            textAlign: 'center',
            color: '#6e6e73',
            fontSize: 13,
            fontFamily: '"SF Mono", ui-monospace, monospace',
          }}
        >
          {title}
        </div>
      </div>
      {/* Dark terminal body — intentionally dark for readability */}
      <div
        style={{
          background: '#1d1d1f',
          padding: '20px 24px',
          fontFamily: '"SF Mono", ui-monospace, monospace',
          fontSize: 18,
          lineHeight: 1.7,
          color: '#f5f5f7',
          minHeight: 500,
        }}
      >
        {children}
      </div>
    </div>
  );
};
