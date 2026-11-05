import Link from 'next/link';
import * as React from 'react';

import { cn } from '@/lib/cn';

export function Breadcrumbs({
  items,
  className,
}: {
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn('mb-3 text-xs font-medium text-muted-foreground', className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-muted-foreground">
                /
              </span>
            )}
            {item.href && index < items.length - 1 ? (
              <Link href={item.href} className="text-muted-foreground hover:text-accent transition-colors">
                {item.label}
              </Link>
            ) : (
              <span className={index === items.length - 1 ? 'font-bold text-foreground' : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  eyebrow,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; href?: string }[];
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      {eyebrow}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-heading">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 text-xs sm:text-sm text-muted-foreground max-w-3xl leading-relaxed">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
