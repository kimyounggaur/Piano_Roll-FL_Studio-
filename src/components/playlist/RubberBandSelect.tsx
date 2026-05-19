import React from 'react';

export interface RubberBandRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface Props {
  rect: RubberBandRect | null;
}

export const RubberBandSelect: React.FC<Props> = ({ rect }) => {
  if (!rect) return null;
  const left = Math.min(rect.x1, rect.x2);
  const top = Math.min(rect.y1, rect.y2);
  const width = Math.abs(rect.x2 - rect.x1);
  const height = Math.abs(rect.y2 - rect.y1);
  return <div className="rubber-band-select" style={{ left, top, width, height }} />;
};
