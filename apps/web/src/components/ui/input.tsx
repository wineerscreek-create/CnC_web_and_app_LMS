'use client';

import * as LabelPrimitive from '@radix-ui/react-label';
import { AlertCircle } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/cn';

const fieldClasses =
  'w-full rounded-xl border border-input bg-card px-3.5 py-2 text-sm text-foreground ' +
  'placeholder:text-muted-foreground transition-all duration-200 focus:border-ring focus:ring-2 focus:ring-ring/30 focus:outline-none ' +
  'focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ' +
  'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus:ring-destructive/20';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, 'h-10', className)} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea ref={ref} className={cn(fieldClasses, 'min-h-[90px] resize-y', className)} {...props} />
));
Textarea.displayName = 'Textarea';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> & { required?: boolean }
>(({ className, children, required, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('mb-1.5 block text-xs font-bold uppercase tracking-wider text-foreground', className)}
    {...props}
  >
    {children}
    {required && (
      <span className="ml-1 text-gold-text" aria-hidden>
        *
      </span>
    )}
  </LabelPrimitive.Root>
));
Label.displayName = 'Label';

export function FieldError({ children, id }: { children?: React.ReactNode; id?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs font-semibold text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-destructive" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  hint?: React.ReactNode;
  error?: React.ReactNode;
}

export function Field({ label, htmlFor, required, hint, error, className, children, ...props }: FieldProps) {
  return (
    <div className={cn('space-y-1', className)} {...props}>
      {label && (
        <Label htmlFor={htmlFor} required={required}>
          {label}
        </Label>
      )}
      {children}
      {hint && !error && (
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
