'use client';

import * as React from 'react';
import Link from 'next/link';
import { Camera, Compass, Flame, Play, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { BannerSettingsModal, type BannerData } from './BannerSettingsModal';

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
  const bannerQuery = useApi<{ success: boolean; data: BannerData }>('/user/banner');
  const [modalOpen, setModalOpen] = React.useState(false);

  const [banner, setBanner] = React.useState<BannerData>({
    hasCustomBanner: false,
    bannerUrl: null,
    posX: 50,
    posY: 50,
    scale: 1.0,
    textColor: '#FFFFFF',
    overlayType: 'dark',
    overlayOpacity: 40,
    glassmorphism: true,
  });

  React.useEffect(() => {
    if (bannerQuery.data?.data) {
      setBanner(bannerQuery.data.data);
    }
  }, [bannerQuery.data]);

  const hasImage = Boolean(banner.hasCustomBanner && banner.bannerUrl);

  return (
    <>
      <div
        className={cn(
          'group relative overflow-hidden rounded-2xl border border-border shadow-card transition-all duration-300',
          !hasImage &&
            'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950',
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
        <div
          aria-hidden="true"
          className={cn(
            'absolute inset-0 pointer-events-none transition-opacity duration-300',
            hasImage
              ? banner.overlayType === 'dark'
                ? 'bg-gradient-to-r from-black/85 via-black/50 to-transparent'
                : 'bg-gradient-to-r from-white/90 via-white/60 to-transparent'
              : 'bg-gradient-to-r from-indigo-900/30 via-slate-900/20 to-transparent',
          )}
          style={hasImage ? { opacity: banner.overlayOpacity / 100 } : undefined}
        />

        {/* Ambient Glow Orb for default theme */}
        {!hasImage && (
          <div
            aria-hidden="true"
            className="absolute -right-16 -top-16 size-80 rounded-full bg-accent/20 blur-3xl pointer-events-none animate-pulse"
          />
        )}

        {/* Content Container */}
        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 p-6 sm:p-8">
          <div
            className={cn(
              'max-w-2xl transition-all',
              hasImage &&
                banner.glassmorphism &&
                (banner.overlayType === 'dark'
                  ? 'p-5 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-lg'
                  : 'p-5 rounded-2xl bg-white/45 backdrop-blur-md border border-black/10 shadow-lg'),
            )}
            style={{ color: hasImage ? banner.textColor : undefined }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wider uppercase bg-accent/20 text-accent border border-accent/30">
                <Sparkles className="size-3" />
                {roleSubtitle || userRole}
              </span>
            </div>

            <h1 className="font-heading text-2xl sm:text-3xl font-extrabold tracking-tight text-inherit">
              Welcome back, {userName}
            </h1>

            <p className="mt-2 text-sm sm:text-base leading-relaxed opacity-90 max-w-xl">
              Track your readiness index, master core soft-skills competencies, and achieve your
              professional placement milestones.
            </p>

            {/* CTAs */}
            {(primaryAction || secondaryAction) && (
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {primaryAction && (
                  <Button
                    asChild
                    variant="primary"
                    className="shadow-md bg-gradient-to-r from-primary to-accent border-0 text-white font-semibold hover:brightness-110"
                  >
                    <Link href={primaryAction.href} className="flex items-center gap-2">
                      {primaryAction.icon || <Play className="size-4" />}
                      <span>{primaryAction.label}</span>
                    </Link>
                  </Button>
                )}

                {secondaryAction && (
                  <Button
                    asChild
                    variant="secondary"
                    className={cn(
                      'font-semibold backdrop-blur-xs',
                      hasImage && banner.textColor === '#FFFFFF'
                        ? 'bg-white/15 hover:bg-white/25 text-white border-white/20'
                        : 'bg-card/80 hover:bg-card text-foreground border-border',
                    )}
                  >
                    <Link href={secondaryAction.href} className="flex items-center gap-2">
                      {secondaryAction.icon || <Compass className="size-4" />}
                      <span>{secondaryAction.label}</span>
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Quick Stat Pill (Right Side) */}
          <div className="flex items-center gap-4 self-stretch md:self-auto justify-between md:justify-end">
            {statLabel && (
              <div
                className={cn(
                  'rounded-2xl border p-4 text-center min-w-[130px] backdrop-blur-md shadow-sm',
                  hasImage && banner.glassmorphism
                    ? banner.overlayType === 'dark'
                      ? 'bg-black/40 border-white/15'
                      : 'bg-white/45 border-black/10'
                    : 'bg-card/75 border-border/60 text-foreground',
                )}
                style={{ color: hasImage ? banner.textColor : undefined }}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                  {statLabel}
                </p>
                <p className="mt-0.5 text-2xl font-extrabold tracking-tight">{statValue}</p>
                {statSubtext && <p className="text-[10px] opacity-75 mt-0.5">{statSubtext}</p>}
              </div>
            )}

            {/* Customize Banner Trigger Button */}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              aria-label="Customize dashboard banner"
              title="Customize dashboard banner image, text color, and overlay"
              className={cn(
                'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 border shadow-xs',
                hasImage && banner.textColor === '#FFFFFF'
                  ? 'bg-black/40 text-white border-white/20 hover:bg-black/60'
                  : 'bg-card text-foreground border-border hover:bg-muted hover:border-primary/40',
              )}
            >
              <Camera className="size-3.5 text-accent" />
              <span className="hidden sm:inline">Customize Banner</span>
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

