'use client';

import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/cn';

export interface InteractiveArrowButtonProps {
  children?: React.ReactNode;
  href?: string;
  onClick?: (e: React.MouseEvent) => void;
  variant?: 'gradient' | 'glass' | 'primary' | 'secondary' | 'ghost' | 'light' | 'dark' | 'link';
  size?: 'sm' | 'md' | 'lg';
  icon?: 'right' | 'up-right';
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  ariaLabel?: string;
  target?: string;
  rel?: string;
}

const variantStyles: Record<string, string> = {
  primary:
    'bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs',
  gradient:
    'bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs',
  secondary:
    'bg-card text-foreground border border-border hover:bg-muted shadow-xs',
  light:
    'bg-card text-foreground border border-border hover:bg-muted shadow-xs',
  dark:
    'bg-foreground text-background hover:bg-foreground/90 border border-foreground shadow-xs',
  glass:
    'bg-card/90 backdrop-blur-md text-foreground border border-border hover:bg-card shadow-xs',
  ghost:
    'text-foreground hover:bg-muted',
  link:
    'text-foreground hover:text-accent underline-offset-4 hover:underline p-0 border-none bg-transparent',
};

const sizeStyles: Record<string, string> = {
  sm: 'h-9 px-3.5 text-xs gap-2',
  md: 'h-10 px-4 text-sm gap-2.5',
  lg: 'h-12 px-6 text-sm sm:text-base gap-3',
};

const bubbleVariantStyles: Record<string, string> = {
  primary: 'bg-primary-foreground/20 text-primary-foreground',
  gradient: 'bg-primary-foreground/20 text-primary-foreground',
  secondary: 'bg-muted text-foreground border border-border',
  light: 'bg-muted text-foreground border border-border',
  dark: 'bg-background/20 text-background border border-background/30',
  glass: 'bg-muted text-foreground border border-border',
  ghost: 'bg-muted text-foreground',
  link: 'bg-transparent text-current',
};

export function InteractiveArrowButton({
  children,
  href,
  onClick,
  variant = 'primary',
  size = 'md',
  icon = 'right',
  className,
  disabled = false,
  type = 'button',
  ariaLabel,
  target,
  rel,
}: InteractiveArrowButtonProps) {
  const IconComponent = icon === 'up-right' ? ArrowUpRight : ArrowRight;

  const content = (
    <>
      <span className="font-semibold tracking-tight">{children}</span>
      <span
        aria-hidden
        className={cn(
          'relative flex items-center justify-center rounded-full transition-transform duration-300 ease-out group-hover:translate-x-0.5',
          size === 'sm' ? 'size-5' : size === 'lg' ? 'size-7' : 'size-6',
          bubbleVariantStyles[variant] || bubbleVariantStyles.primary,
        )}
      >
        <IconComponent
          className={cn(
            'transition-transform duration-300 ease-out group-hover:scale-110',
            size === 'sm' ? 'size-3' : size === 'lg' ? 'size-4' : 'size-3.5',
          )}
        />
      </span>
    </>
  );

  const combinedClassName = cn(
    'group relative inline-flex items-center justify-center rounded-xl select-none transition-all duration-200 active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    disabled && 'pointer-events-none opacity-50 cursor-not-allowed',
    variantStyles[variant] || variantStyles.primary,
    sizeStyles[size] || sizeStyles.md,
    className,
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={combinedClassName} aria-label={ariaLabel} target={target} rel={rel}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={combinedClassName}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
