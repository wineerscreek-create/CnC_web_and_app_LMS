'use client';

import * as React from 'react';
import { Camera, Check, Loader2, Trash2, Upload, WifiOff, X } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import { useAppDispatch } from '@/store';
import { userUpdated, type SessionUser } from '@/store/authSlice';

interface ProfileAvatarUploadModalProps {
  open: boolean;
  onClose: () => void;
  user: SessionUser;
}

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function ProfileAvatarUploadModal({ open, onClose, user }: ProfileAvatarUploadModalProps) {
  const dispatch = useAppDispatch();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [isOffline, setIsOffline] = React.useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false,
  );

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Clean up object URLs to avoid memory leaks
  React.useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Reset file selection when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSelectedFile(null);
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setPreviewUrl(null);
    }
  }, [open, previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Unsupported image format. Please select a JPG, PNG, or WebP file.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      toast.error('Image size exceeds 5 MB. Please choose a smaller file.');
      return;
    }

    setSelectedFile(file);
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      toast.error("You're currently offline. This feature requires an active internet connection. Please reconnect and try again.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await api.post<{ success: boolean; data: { avatarUrl: string } }>(
        '/user/avatar/upload',
        formData,
      );

      const newAvatarUrl = res?.data?.avatarUrl;
      if (newAvatarUrl) {
        dispatch(userUpdated({ avatarUrl: newAvatarUrl }));
        toast.success('Profile avatar updated successfully!');
        onClose();
      } else {
        toast.error('Failed to update avatar. Please try again.');
      }
    } catch (err: any) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || 'Failed to upload profile image.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemove = async () => {
    if (isOffline || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      toast.error("You're currently offline. This feature requires an active internet connection. Please reconnect and try again.");
      return;
    }

    setRemoving(true);
    try {
      await api.delete('/user/avatar');
      dispatch(userUpdated({ avatarUrl: null }));
      toast.success('Profile avatar removed.');
      onClose();
    } catch (err: any) {
      const apiErr = err as ApiError;
      toast.error(apiErr.message || 'Failed to remove profile image.');
    } finally {
      setRemoving(false);
    }
  };

  const currentDisplaySrc = previewUrl || user.avatarUrl || null;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && onClose()}>
      <DialogContent className="max-w-[420px] rounded-2xl bg-card p-6 shadow-xl border border-border">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold font-heading text-heading">
            Profile Avatar
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update your account profile photo across all portals.
          </DialogDescription>
        </DialogHeader>

        {isOffline && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <WifiOff className="size-4 shrink-0 mt-0.5" />
            <span>
              You&apos;re currently offline. This feature requires an active internet connection. Please reconnect and try again.
            </span>
          </div>
        )}

        <div className="my-4 flex flex-col items-center justify-center gap-4">
          <div className="relative group">
            <Avatar
              name={user.name}
              color={user.avatarColor}
              src={currentDisplaySrc}
              size={100}
              className="border-2 border-border shadow-md"
            />
            {!isOffline && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer backdrop-blur-[2px]"
                aria-label="Change photo"
              >
                <Camera className="size-6 drop-shadow" />
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading || isOffline}
          />

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading || isOffline}
              className="rounded-xl text-xs"
            >
              <Upload className="size-3.5 mr-1.5" />
              Select Image
            </Button>

            {user.avatarUrl && !selectedFile && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemove}
                disabled={removing || isOffline}
                className="rounded-xl text-xs text-destructive hover:bg-destructive/10"
              >
                {removing ? <Loader2 className="size-3.5 mr-1 animate-spin" /> : <Trash2 className="size-3.5 mr-1" />}
                Remove
              </Button>
            )}
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            Supported formats: JPG, PNG, WebP (Max 5 MB)
          </p>
        </div>

        <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-border">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={uploading || removing}>
            Cancel
          </Button>

          <Button
            variant="primary"
            size="sm"
            onClick={handleUpload}
            disabled={!selectedFile || uploading || isOffline}
            className="rounded-xl font-semibold"
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 mr-1.5 animate-spin" />
                Uploading…
              </>
            ) : (
              <>
                <Check className="size-3.5 mr-1.5" />
                Save Avatar
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
