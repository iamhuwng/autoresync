import React from 'react';
import PropTypes from 'prop-types';
import './Button.css';

/**
 * Modern Button Component
 * Soft pastel gradient buttons with smooth animations
 */
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  leftSection,
  rightSection,
  className = '',
  onClick,
  type = 'button',
  ...props
}) => {
  const finalIcon = icon || leftSection || rightSection;
  const finalIconPosition = rightSection && !leftSection && !icon ? 'right' : iconPosition;
  const variantClasses = {
    primary: 'btn-primary',
    secondary: 'btn-secondary',
    success: 'btn-success',
    danger: 'btn-danger',
    warning: 'btn-warning',
    glass: 'btn-glass',
    outline: 'btn-outline',
  };

  const sizeClasses = {
    sm: 'btn-sm',
    md: 'btn-md',
    lg: 'btn-lg',
    xl: 'btn-xl',
  };

  const classes = [
    'modern-btn',
    variantClasses[variant] || variantClasses.primary,
    sizeClasses[size] || sizeClasses.md,
    fullWidth ? 'btn-full-width' : '',
    disabled || loading ? 'btn-disabled' : '',
    loading ? 'btn-loading' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      onClick={onClick}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading && (
        <span className="btn-spinner">
          <svg className="spinner-icon" viewBox="0 0 24 24">
            <circle className="spinner-circle" cx="12" cy="12" r="10" />
          </svg>
        </span>
      )}
      {!loading && finalIcon && finalIconPosition === 'left' && (
        <span className="btn-icon btn-icon-left">{finalIcon}</span>
      )}
      <span className="btn-text">{children}</span>
      {!loading && finalIcon && finalIconPosition === 'right' && (
        <span className="btn-icon btn-icon-right">{finalIcon}</span>
      )}
    </button>
  );
};

Button.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['primary', 'secondary', 'success', 'danger', 'warning', 'glass', 'outline']),
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl']),
  fullWidth: PropTypes.bool,
  disabled: PropTypes.bool,
  loading: PropTypes.bool,
  icon: PropTypes.node,
  iconPosition: PropTypes.oneOf(['left', 'right']),
  className: PropTypes.string,
  onClick: PropTypes.func,
  type: PropTypes.oneOf(['button', 'submit', 'reset']),
};

/**
 * Button Group Component
 */
export const ButtonGroup = ({ children, className = '', ...props }) => {
  return (
    <div className={`modern-btn-group ${className}`} {...props}>
      {children}
    </div>
  );
};

ButtonGroup.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default Button;
