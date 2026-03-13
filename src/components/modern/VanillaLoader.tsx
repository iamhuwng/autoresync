import type { CSSProperties } from 'react';
import './VanillaLoader.css';

export interface VanillaLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  className?: string;
}

const SIZE_MAP: Record<NonNullable<VanillaLoaderProps['size']>, string> = {
  sm: '16px',
  md: '24px',
  lg: '32px',
  xl: '48px',
};

export function VanillaLoader({
  size = 'md',
  color = '#8b5cf6',
  className = '',
}: VanillaLoaderProps) {
  return (
    <span
      className={`vanilla-loader vanilla-loader--${size} ${className}`.trim()}
      style={
        {
          '--loader-color': color,
          '--loader-size': SIZE_MAP[size],
        } as CSSProperties
      }
      aria-hidden="true"
    />
  );
}

export default VanillaLoader;
