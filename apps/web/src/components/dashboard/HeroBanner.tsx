'use client';

import * as React from 'react';
import Link from 'next/link';
import { Camera, Compass, Flame, Play, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { useBanner } from '@/context/BannerContext';
import { BannerSettingsModal } from './BannerSettingsModal';

interface HeroBannerProps {
  userName: string;
  userRole: string;
  roleSubtitle?: string;
  statLabel?: string;
  statValue?: string | number;
  statSubtext?: string;
  primaryAction?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
  };
  secondaryAction?: {
    label: string;
    href: string;
    icon?: React.ReactNode;
  };
  className?: string;
}

export function HeroBanner({
  userName,
  userRole,
  roleSubtitle,
  statLabel,
  statValue,
  statSubtext,
  primaryAction,
  secondaryAction,
  className,
}: HeroBannerProps) {
  const { banner, setBanner } = useBanner();
  const [modalOpen, setModalOpen] = React.useState(false);

  const hasImage = Boolean(banner.hasCustomBanner && banner.bannerUrl);

  return (
    <>
      <div
        className={cn(
          'group relative overflow-hidden rounded-xl border border-border shadow-xs transition-all',
          !hasImage && 'bg-card border-t-2 border-t-primary text-card-foreground',
          className,
        )}
      >
        {/* Background Image Layer */}
        {hasImage && banner.bannerUrl && (
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-300 pointer-events-none"
            style={{
              backgroundImage: `url(${banner.bannerUrl})`,
              backgroundPosition: `${banner.posX}% ${banner.posY}%`,
              transform: `scale(${banner.scale})`,
            }}
          />
        )}

        {/* Smart Calibrated Overlay Layer */}
        {hasImage && (
          <div
            aria-hidden="true"
            className={cn(
              'absolute inset-0 pointer-events-none transition-opacity duration-300',
              banner.overlayType === 'dark'
                ? 'bg-gradient-to-r from-black/85 via-black/55 to-transparent'
                : 'bg-gradient-to-r from-white/90 via-white/60 to-transparent',
            )}
            style={{ opacity: banner.overlayOpacity / 100 }}
          />
        )}

        {/* Content Container */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-5 p-5 sm:p-6">
          <div
            className={cn(
              'max-w-2xl transition-all',
              hasImage &&
                banner.glassmorphism &&
                (banner.overlayType === 'dark'
                  ? 'p-4 rounded-xl bg-black/40 backdrop-blur-md border border-white/10'
                  : 'p-4 rounded-xl bg-white/60 backdrop-blur-md border border-black/10'),
            )}
            style={{ color: hasImage ? banner.textColor : undefined }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                  hasImage && banner.textColor === '#FFFFFF'
                    ? 'bg-white/15 text-white border border-white/20'
                    : 'bg-primary/10 text-primary border border-primary/20',
                )}
              >
                <Sparkles className="size-3" />
                {roleSubtitle || userRole}
              </span>
            </div>

            <h1 className="font-heading text-xl sm:text-2xl font-bold tracking-tight text-inherit">
              Welcome back, {userName}
            </h1>

            <p
              className={cn(
                'mt-1 text-xs sm:text-sm leading-relaxed max-w-xl',
                hasImage && banner.textColor === '#FFFFFF' ? 'text-white/80' : 'text-muted-foreground',
              )}
            >
              Track your readiness index, master core soft-skills competencies, and achieve your
              professional placement milestones.
            </p>

            {/* CTAs */}
            {(primaryAction || secondaryAction) && (
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                {primaryAction && (
                  <Button
                    asChild
                    variant="primary"
                    size="sm"
                    className="font-medium shadow-xs"
                  >
                    <Link href={primaryAction.href} className="flex items-center gap-1.5">
                      {primaryAction.icon || <Play className="size-3.5" />}
                      <span>{primaryAction.label}</span>
                    </Link>
                  </Button>
                )}

                {secondaryAction && (
                  <Button
                    asChild
                    variant="secondary"
                    size="sm"
                    className={cn(
                      'font-medium',
                      hasImage && banner.textColor === '#FFFFFF'
                        ? 'bg-white/15 hover:bg-white/25 text-white border-white/20'
                        : 'bg-muted/60 hover:bg-muted text-foreground border-border',
                    )}
                  >
                    <Link href={secondaryAction.href} className="flex items-center gap-1.5">
                      {secondaryAction.icon || <Compass className="size-3.5" />}
                      <span>{secondaryAction.label}</span>
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Quick Stat Pill & Customization Trigger */}
          <div className="flex items-center gap-3 self-stretch md:self-auto justify-between md:justify-end">
            {statLabel && (
              <div
                className={cn(
                  'rounded-lg border px-4 py-2.5 text-center min-w-[120px] shadow-xs',
                  hasImage && banner.glassmorphism
                    ? banner.overlayType === 'dark'
                      ? 'bg-black/40 border-white/15'
                      : 'bg-white/50 border-black/10'
                    : 'bg-muted/40 border-border text-foreground',
                )}
                style={{ color: hasImage ? banner.textColor : undefined }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  {statLabel}
                </p>
                <p className="mt-0.5 text-xl font-bold tracking-tight">{statValue}</p>
                {statSubtext && <p className="text-[9px] opacity-70 mt-0.5">{statSubtext}</p>}
              </div>
            )}

            {/* Customize Banner Trigger Button */}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Customize dashboard banner"
              title="Customize dashboard banner image, text color, and overlay"
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border shadow-xs',
                hasImage && banner.textColor === '#FFFFFF'
                  ? 'bg-black/40 text-white border-white/20 hover:bg-black/60'
                  : 'bg-card text-foreground border-border hover:bg-muted',
              )}
            >
              <Camera className="size-3.5 text-muted-foreground" />
              <span className="hidden sm:inline">Customize</span>
            </button>
          </div>
        </div>
      </div>

      <BannerSettingsModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        currentBanner={banner}
        onBannerUpdated={(updated) => setBanner(updated)}
        userName={userName}
        userRole={userRole}
      />
    </>
  );
}

