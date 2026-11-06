'use client';

import * as React from 'react';
import {
  Camera,
  Check,
  Eye,
  Image as ImageIcon,
  Move,
  Palette,
  RotateCcw,
  Sliders,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, type ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

export interface BannerData {
  hasCustomBanner: boolean;
  bannerUrl: string | null;
  posX: number;
  posY: number;
  scale: number;
  textColor: string;
  overlayType: 'dark' | 'light';
  overlayOpacity: number;
  glassmorphism: boolean;
}

export const TEXT_COLOR_OPTIONS = [
  { label: 'White', value: '#FFFFFF', bg: 'bg-white text-black border-slate-300' },
  { label: 'Soft White', value: '#F8F9FA', bg: 'bg-[#F8F9FA] text-black border-slate-300' },
  { label: 'Charcoal', value: '#1E293B', bg: 'bg-[#1E293B] text-white border-slate-700' },
  { label: 'Black', value: '#0B0F19', bg: 'bg-[#0B0F19] text-white border-slate-800' },
];

interface BannerSettingsModalProps {
  open: boolean;
  onClose: () => void;
  currentBanner: BannerData;
  onBannerUpdated: (newBanner: BannerData) => void;
  userName: string;
  userRole: string;
}

export function BannerSettingsModal({
  open,
  onClose,
  currentBanner,
  onBannerUpdated,
  userName,
  userRole,
}: BannerSettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState<'image' | 'position' | 'style'>('image');
  const [previewDevice, setPreviewDevice] = React.useState<'desktop' | 'mobile'>('desktop');

  // Form state
  const [bannerUrl, setBannerUrl] = React.useState<string | null>(currentBanner.bannerUrl);
  const [posX, setPosX] = React.useState<number>(currentBanner.posX);
  const [posY, setPosY] = React.useState<number>(currentBanner.posY);
  const [scale, setScale] = React.useState<number>(currentBanner.scale);
  const [textColor, setTextColor] = React.useState<string>(currentBanner.textColor);
  const [overlayType, setOverlayType] = React.useState<'dark' | 'light'>(currentBanner.overlayType);
  const [overlayOpacity, setOverlayOpacity] = React.useState<number>(currentBanner.overlayOpacity);
  const [glassmorphism, setGlassmorphism] = React.useState<boolean>(currentBanner.glassmorphism);

  const [uploading, setUploading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  // Sync when currentBanner prop updates
  React.useEffect(() => {
    setBannerUrl(currentBanner.bannerUrl);
    setPosX(currentBanner.posX);
    setPosY(currentBanner.posY);
    setScale(currentBanner.scale);
    setTextColor(currentBanner.textColor);
    setOverlayType(currentBanner.overlayType);
    setOverlayOpacity(currentBanner.overlayOpacity);
    setGlassmorphism(currentBanner.glassmorphism);
  }, [currentBanner, open]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must not exceed 5 MB.');
      return;
    }

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      toast.error('Unsupported format. Please upload JPG, PNG, or WebP.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await api.post<any>('/user/banner/upload', formData);
      if (res.success && res.data) {
        setBannerUrl(res.data.bannerUrl);
        toast.success('Banner image uploaded successfully!');
        setActiveTab('position');
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to upload banner');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveBanner = async () => {
    setSaving(true);
    try {
      const res = await api.delete<any>('/user/banner');
      if (res.success) {
        toast.success('Custom banner removed');
        onBannerUpdated(res.data);
        onClose();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to remove banner');
    } finally {
      setSaving(false);
    }
  };

  const handleResetDefaults = () => {
    setPosX(50);
    setPosY(50);
    setScale(1.0);
    setTextColor('#FFFFFF');
    setOverlayType('dark');
    setOverlayOpacity(40);
    setGlassmorphism(true);
    toast.info('Settings reset to recommended defaults');
  };

  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const res = await api.patch<any>('/user/banner', {
        posX,
        posY,
        scale,
        textColor,
        overlayType,
        overlayOpacity,
        glassmorphism,
      });

      if (res.success && res.data) {
        toast.success('Banner appearance saved successfully');
        onBannerUpdated(res.data);
        onClose();
      }
    } catch (err) {
      toast.error((err as ApiError).message || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0 rounded-2xl bg-card border border-border shadow-2xl">
        <DialogHeader className="p-5 border-b border-border flex flex-row items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Camera className="size-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-heading">
                Customize Dashboard Banner
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                Personalize your profile header with custom imagery, positioning, and contrast styling.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </DialogHeader>

        <div className="p-6 space-y-6">
          {/* Live Interactive Preview Box */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Eye className="size-3.5 text-primary" />
                Live Preview
              </span>
              <div className="inline-flex rounded-lg border border-border bg-muted p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                    previewDevice === 'desktop'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={cn(
                    'px-2.5 py-1 text-[11px] font-bold rounded-md transition-all',
                    previewDevice === 'mobile'
                      ? 'bg-card text-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Mobile
                </button>
              </div>
            </div>

            <div
              className={cn(
                'relative mx-auto overflow-hidden rounded-xl border border-border transition-all duration-300 min-h-[160px] flex items-end',
                previewDevice === 'desktop' ? 'w-full h-44' : 'max-w-xs h-40',
                !bannerUrl && 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900',
              )}
            >
              {/* Background Image with transform */}
              {bannerUrl && (
                <div
                  className="absolute inset-0 bg-cover bg-no-repeat transition-all duration-150"
                  style={{
                    backgroundImage: `url(${bannerUrl})`,
                    backgroundPosition: `${posX}% ${posY}%`,
                    transform: `scale(${scale})`,
                  }}
                />
              )}

              {/* Smart Overlay */}
              <div
                className={cn(
                  'absolute inset-0 transition-opacity',
                  overlayType === 'dark'
                    ? 'bg-gradient-to-t from-black via-black/40 to-transparent'
                    : 'bg-gradient-to-t from-white via-white/50 to-transparent',
                )}
                style={{ opacity: overlayOpacity / 100 }}
              />

              {/* Sample Content Container */}
              <div className="relative z-10 p-4 w-full">
                <div
                  className={cn(
                    'p-3 rounded-xl transition-all inline-block max-w-full',
                    glassmorphism &&
                      (overlayType === 'dark'
                        ? 'bg-black/35 backdrop-blur-md border border-white/15'
                        : 'bg-white/40 backdrop-blur-md border border-black/10'),
                  )}
                  style={{ color: textColor }}
                >
                  <p className="text-[10px] uppercase font-bold tracking-wider opacity-85">
                    {userRole}
                  </p>
                  <h3 className="text-base font-extrabold tracking-tight truncate">
                    Welcome back, {userName}
                  </h3>
                  <p className="text-xs opacity-90">Ready for your next learning milestone?</p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab('image')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all',
                activeTab === 'image'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <ImageIcon className="size-3.5" />
              1. Image Source
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('position')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all',
                activeTab === 'position'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Move className="size-3.5" />
              2. Crop &amp; Reposition
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('style')}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition-all',
                activeTab === 'style'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Sliders className="size-3.5" />
              3. Text &amp; Overlay
            </button>
          </div>

          {/* TAB 1: IMAGE UPLOAD */}
          {activeTab === 'image' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                id="banner-file-input"
              />

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/60 hover:bg-muted/30 transition-all space-y-3"
              >
                <div className="size-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
                  <Upload className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-heading">
                    {uploading ? 'Uploading image...' : 'Click to select or drop banner image'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports JPG, PNG, and WebP (up to 5 MB). High resolution recommended (1920×400).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  className="pointer-events-none"
                >
                  Choose File
                </Button>
              </div>

              {bannerUrl && (
                <div className="flex items-center justify-between p-3.5 rounded-xl border border-destructive/20 bg-destructive/5 text-destructive">
                  <span className="text-xs font-semibold">Active custom image is applied</span>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={handleRemoveBanner}
                    loading={saving}
                  >
                    <Trash2 className="size-3.5 mr-1" />
                    Remove Banner
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: POSITION & CROP */}
          {activeTab === 'position' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-heading">Horizontal Position (X)</span>
                  <span className="text-muted-foreground">{posX}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posX}
                  onChange={(e) => setPosX(Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-heading">Vertical Position (Y)</span>
                  <span className="text-muted-foreground">{posY}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={posY}
                  onChange={(e) => setPosY(Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="font-semibold text-heading">Image Zoom / Scale</span>
                  <span className="text-muted-foreground">{scale.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="2.5"
                  step="0.1"
                  value={scale}
                  onChange={(e) => setScale(Number(e.target.value))}
                  className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                />
              </div>
            </div>
          )}

          {/* TAB 3: TEXT & OVERLAY */}
          {activeTab === 'style' && (
            <div className="space-y-5">
              {/* Text color picker */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-heading block">
                  Banner Text Color
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {TEXT_COLOR_OPTIONS.map((col) => (
                    <button
                      key={col.value}
                      type="button"
                      onClick={() => setTextColor(col.value)}
                      className={cn(
                        'flex items-center gap-2 p-2.5 rounded-xl border text-xs font-semibold transition-all',
                        textColor === col.value
                          ? 'border-primary ring-2 ring-primary/30 shadow-xs'
                          : 'border-border hover:bg-muted/40',
                      )}
                    >
                      <span className={cn('size-4 rounded-full border shadow-xs', col.bg)} />
                      <span>{col.label}</span>
                      {textColor === col.value && <Check className="size-3.5 ml-auto text-primary" />}
                    </button>
                  ))}
                </div>
              </div>

              {/* Overlay type & intensity */}
              <div className="space-y-3">
                <label className="text-xs font-semibold text-heading block">
                  Smart Readability Overlay
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setOverlayType('dark')}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-bold text-center transition-all',
                      overlayType === 'dark'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Dark Gradient Overlay
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlayType('light')}
                    className={cn(
                      'p-3 rounded-xl border text-xs font-bold text-center transition-all',
                      overlayType === 'light'
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:text-foreground',
                    )}
                  >
                    Light Gradient Overlay
                  </button>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex justify-between text-xs">
                    <span className="font-semibold text-heading">Overlay Opacity / Intensity</span>
                    <span className="text-muted-foreground">{overlayOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    value={overlayOpacity}
                    onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                    className="w-full accent-primary h-2 bg-muted rounded-lg cursor-pointer"
                  />
                </div>
              </div>

              {/* Glassmorphism toggle */}
              <div className="flex items-center justify-between p-3.5 rounded-xl border border-border bg-muted/20">
                <div>
                  <p className="text-xs font-bold text-heading">Glassmorphism Text Container</p>
                  <p className="text-[11px] text-muted-foreground">
                    Adds frosted-glass backdrop behind text for maximum contrast on photographic backgrounds.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={glassmorphism}
                  onChange={(e) => setGlassmorphism(e.target.checked)}
                  className="size-4 accent-primary rounded cursor-pointer"
                />
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="p-5 border-t border-border bg-muted/20 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResetDefaults}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5 mr-1" />
            Reset to Default
          </Button>

          <div className="flex items-center gap-2.5">
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={saving}
              onClick={handleSaveChanges}
            >
              <Sparkles className="size-3.5 mr-1.5" />
              Save Banner
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

