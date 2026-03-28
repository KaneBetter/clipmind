import React from 'react';
import { interpolate, Easing } from 'remotion';

interface TransitionWipeProps {
  type: 'slide' | 'fade' | 'zoom';
  progress: number; // 0-1
  children: React.ReactNode;
}

export const TransitionWipe: React.FC<TransitionWipeProps> = ({
  type,
  progress,
  children,
}) => {
  const style = getTransitionStyle(type, progress);

  return (
    <div style={{ position: 'absolute', inset: 0, ...style }}>
      {children}
    </div>
  );
};

function getTransitionStyle(
  type: 'slide' | 'fade' | 'zoom',
  progress: number,
): React.CSSProperties {
  const eased = Easing.inOut(Easing.ease)(progress);

  switch (type) {
    case 'slide': {
      const translateX = interpolate(eased, [0, 1], [100, 0]);
      return {
        transform: `translateX(${translateX}%)`,
        opacity: 1,
      };
    }
    case 'fade': {
      return {
        opacity: eased,
      };
    }
    case 'zoom': {
      const scale = interpolate(eased, [0, 1], [1.2, 1]);
      return {
        transform: `scale(${scale})`,
        opacity: eased,
      };
    }
    default:
      return {};
  }
}
