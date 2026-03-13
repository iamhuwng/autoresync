import React from 'react';
import './NativeSelect.css';

export const NativeSelect = ({
  options,
  value,
  onChange,
  placeholder,
  size = 'md',
  variant = 'default',
  className = '',
  style = {},
  minWidth,
  ...rest
}) => {
  const sizeClass = size !== 'md' ? `native-select--${size}` : '';
  const combinedClassName = ['native-select', sizeClass, className].filter(Boolean).join(' ');
  const combinedStyle = minWidth ? { minWidth, ...style } : style;

  return (
    <select
      className={combinedClassName}
      style={combinedStyle}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...rest}
    >
      {placeholder && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};
