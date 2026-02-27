import React from 'react';
import PropTypes from 'prop-types';
import './Input.css';

/**
 * Modern Input Component
 * Soft pastel glassmorphic input with smooth focus animations
 */
export const Input = ({ 
  label,
  error,
  helperText,
  icon,
  iconPosition = 'left',
  variant = 'default',
  size = 'md',
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const variantClasses = {
    default: 'input-default',
    lavender: 'input-lavender',
    rose: 'input-rose',
    sky: 'input-sky',
    mint: 'input-mint',
  };

  const sizeClasses = {
    sm: 'input-sm',
    md: 'input-md',
    lg: 'input-lg',
  };

  const inputClasses = [
    'modern-input',
    variantClasses[variant] || variantClasses.default,
    sizeClasses[size] || sizeClasses.md,
    error ? 'input-error' : '',
    icon ? `input-with-icon-${iconPosition}` : '',
  ].filter(Boolean).join(' ');

  const wrapperClasses = [
    'modern-input-wrapper',
    fullWidth ? 'input-full-width' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label className="modern-input-label">
          {label}
        </label>
      )}
      <div className="modern-input-container">
        {icon && iconPosition === 'left' && (
          <span className="input-icon input-icon-left">{icon}</span>
        )}
        <input 
          className={inputClasses}
          {...props}
        />
        {icon && iconPosition === 'right' && (
          <span className="input-icon input-icon-right">{icon}</span>
        )}
      </div>
      {error && (
        <span className="modern-input-error-text">{error}</span>
      )}
      {!error && helperText && (
        <span className="modern-input-helper-text">{helperText}</span>
      )}
    </div>
  );
};

Input.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  variant: PropTypes.oneOf(['default', 'lavender', 'rose', 'sky', 'mint']),
  size: PropTypes.oneOf(['sm', 'md', 'lg']),
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
};

/**
 * Modern Textarea Component
 */
export const Textarea = ({ 
  label,
  error,
  helperText,
  variant = 'default',
  fullWidth = false,
  className = '',
  rows = 4,
  ...props 
}) => {
  const variantClasses = {
    default: 'input-default',
    lavender: 'input-lavender',
    rose: 'input-rose',
    sky: 'input-sky',
    mint: 'input-mint',
  };

  const textareaClasses = [
    'modern-textarea',
    variantClasses[variant] || variantClasses.default,
    error ? 'input-error' : '',
  ].filter(Boolean).join(' ');

  const wrapperClasses = [
    'modern-input-wrapper',
    fullWidth ? 'input-full-width' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={wrapperClasses}>
      {label && (
        <label className="modern-input-label">
          {label}
        </label>
      )}
      <textarea 
        className={textareaClasses}
        rows={rows}
        {...props}
      />
      {error && (
        <span className="modern-input-error-text">{error}</span>
      )}
      {!error && helperText && (
        <span className="modern-input-helper-text">{helperText}</span>
      )}
    </div>
  );
};

Textarea.propTypes = {
  label: PropTypes.string,
  error: PropTypes.string,
  helperText: PropTypes.string,
  variant: PropTypes.oneOf(['default', 'lavender', 'rose', 'sky', 'mint']),
  fullWidth: PropTypes.bool,
  className: PropTypes.string,
  rows: PropTypes.number,
};

export default Input;
