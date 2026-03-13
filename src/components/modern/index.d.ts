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

export interface NativeSelectProps {
  value?: string;
  onChange?: (value: string) => void;
  options?: Array<{ value: string; label: string }>;
  label?: string;
  className?: string;
  disabled?: boolean;
  minWidth?: number;
  style?: React.CSSProperties;
}

export const NativeSelect: React.FC<NativeSelectProps>;

export interface VanillaTabDefinition {
  key: string;
  label: string;
  icon?: string | React.ReactNode;
}

export interface VanillaTabsProps {
  tabs: VanillaTabDefinition[];
  activeTab: string;
  onTabChange: (key: string) => void;
  className?: string;
}

export const VanillaTabs: React.FC<VanillaTabsProps>;

export interface VanillaLoaderProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  className?: string;
}

export const VanillaLoader: React.FC<VanillaLoaderProps>;

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastContainerProps {
  className?: string;
}

export interface ToastOptions {
  title?: string;
  message: string;
  tone?: ToastTone;
}

export const ToastContainer: React.FC<ToastContainerProps>;

export const toast: {
  success: (message: string) => string;
  error: (message: string) => string;
  info: (message: string) => string;
  warning: (message: string) => string;
  show: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
};
