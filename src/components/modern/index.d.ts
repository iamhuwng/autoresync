/**
 * TypeScript declarations for Modern UI Component Library
 */

import React from 'react';

// Card Component Types
export interface CardProps {
  variant?: 'default' | 'glass' | 'lavender' | 'sky' | 'mint' | 'rose' | 'peach';
  hover?: boolean;
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void;
}

export const Card: React.FC<CardProps>;
export const CardHeader: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }>;
export const CardBody: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }>;
export const CardFooter: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }>;

// Button Component Types
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'success' | 'danger' | 'warning' | 'info' | 'glass' | 'outline';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  disabled?: boolean;
  fullWidth?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  leftSection?: React.ReactNode; // Alias for icon (left)
  rightSection?: React.ReactNode; // Alias for icon (right)
  color?: string; // Optional color string for custom styles
  mt?: string | number; // Margin top
  mb?: string | number; // Margin bottom
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: 'button' | 'submit' | 'reset';
  style?: React.CSSProperties;
  className?: string;
  children?: React.ReactNode;
}

export const Button: React.FC<ButtonProps>;
export const ButtonGroup: React.FC<{ children?: React.ReactNode; style?: React.CSSProperties }>;

// Input Component Types
export interface InputProps {
  type?: string;
  label?: string;
  placeholder?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  variant?: 'default' | 'mint' | 'sky' | 'lavender';
  disabled?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const Input: React.FC<InputProps>;

export interface TextareaProps {
  label?: string;
  placeholder?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  variant?: 'default' | 'mint' | 'sky' | 'lavender';
  disabled?: boolean;
  required?: boolean;
  rows?: number;
  style?: React.CSSProperties;
  className?: string;
}

export const Textarea: React.FC<TextareaProps>;
