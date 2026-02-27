import React from 'react';
import PropTypes from 'prop-types';
import './Card.css';

/**
 * Modern Card Component
 * Soft pastel glassmorphic card with variants
 */
export const Card = ({ 
  children, 
  variant = 'default',
  hover = true,
  className = '',
  style = {},
  onClick,
  ...props 
}) => {
  const variantClasses = {
    default: 'card-default',
    lavender: 'card-lavender',
    rose: 'card-rose',
    sky: 'card-sky',
    mint: 'card-mint',
    peach: 'card-peach',
    glass: 'card-glass',
  };

  const classes = [
    'modern-card',
    variantClasses[variant] || variantClasses.default,
    hover ? 'modern-card-hover' : '',
    onClick ? 'modern-card-clickable' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <div 
      className={classes} 
      style={style}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  );
};

Card.propTypes = {
  children: PropTypes.node.isRequired,
  variant: PropTypes.oneOf(['default', 'lavender', 'rose', 'sky', 'mint', 'peach', 'glass']),
  hover: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
  onClick: PropTypes.func,
};

/**
 * Card Header Component
 */
export const CardHeader = ({ children, className = '', ...props }) => {
  return (
    <div className={`modern-card-header ${className}`} {...props}>
      {children}
    </div>
  );
};

CardHeader.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

/**
 * Card Body Component
 */
export const CardBody = ({ children, className = '', ...props }) => {
  return (
    <div className={`modern-card-body ${className}`} {...props}>
      {children}
    </div>
  );
};

CardBody.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

/**
 * Card Footer Component
 */
export const CardFooter = ({ children, className = '', ...props }) => {
  return (
    <div className={`modern-card-footer ${className}`} {...props}>
      {children}
    </div>
  );
};

CardFooter.propTypes = {
  children: PropTypes.node.isRequired,
  className: PropTypes.string,
};

export default Card;
