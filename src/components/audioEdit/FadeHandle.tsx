import React from 'react';

interface FadeHandleProps {
  type: 'in' | 'out';
  onDragStart: (e: React.MouseEvent) => void;
}

export const FadeHandle: React.FC<FadeHandleProps> = ({ type, onDragStart }) => (
  <div
    className={`fade-handle fade-${type}`}
    onMouseDown={onDragStart}
    title={type === 'in' ? '페이드 인 조절' : '페이드 아웃 조절'}
  >
    {type === 'in' ? '◂' : '▸'}
  </div>
);
