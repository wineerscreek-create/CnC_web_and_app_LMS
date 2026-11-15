'use client';

import * as React from 'react';
import { useAppSelector } from '@/store';
import { syncEngine } from '@/lib/offline/syncEngine';
import { calculateStorageUsage, offlineDB } from '@/lib/offline/db';
import { toast } from 'sonner';

interface StorageUsageData {
  totalBytes: number;
  courseCount: number;
  materialCount: number;
  gameCount: number;
  questionSetCount: number;
  pendingSyncCount: number;
}

interface OfflineContextValue {
  isOnline: boolean;
  pendingCount: number;
  lastSyncTime: string | null;
  isSyncing: boolean;
  storageUsage: StorageUsageData;
  triggerManualSync: () => Promise<void>;
  refreshStorageUsage: () => Promise<void>;
}

const defaultStorageUsage: StorageUsageData = {
  totalBytes: 0,
  courseCount: 0,
  materialCount: 0,
  gameCount: 0,
  questionSetCount: 0,
  pendingSyncCount: 0,
};

const OfflineContext = React.createContext<OfflineContextValue>({
  isOnline: true,
  pendingCount: 0,
  lastSyncTime: null,
  isSyncing: false,
  storageUsage: defaultStorageUsage,
  triggerManualSync: async () => {},
  refreshStorageUsage: async () => {},
});

export function OfflineProvider({ children }: { children: React.ReactNode }) {
  const user = useAppSelector((state) => state.auth.user);
  const [isOnline, setIsOnline] = React.useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = React.useState<number>(0);
  const [lastSyncTime, setLastSyncTime] = React.useState<string | null>(null);
  const [isSyncing, setIsSyncing] = React.useState<boolean>(false);
  const [storageUsage, setStorageUsage] = React.useState<StorageUsageData>(defaultStorageUsage);

  // Initialize syncEngine with user credentials and attach network listeners
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Internet connection restored. Synchronizing offline data…');
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning('You are offline. Downloaded courses and offline modes remain available.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const refreshStorageUsage = React.useCallback(async () => {
    if (!user?.id) return;
    try {
      const stats = await calculateStorageUsage(user.id);
      setStorageUsage(stats);
    } catch {
      // Ignore in background
    }
  }, [user?.id]);

  React.useEffect(() => {
    if (user?.id) {
      syncEngine.init(user.id, user.institutionId || null);
      syncEngine.setScope(user.id, user.institutionId || null);

      const unsubscribe = syncEngine.subscribeToPendingCount((count) => {
        setPendingCount(count);
      });

      // Load last sync metadata
      offlineDB.syncMetadata.get(`meta_${user.id}`).then((meta) => {
        if (meta?.lastSuccessfulSync) {
          setLastSyncTime(meta.lastSuccessfulSync);
        }
      });

      void refreshStorageUsage();

      return () => {
        unsubscribe();
      };
    }
  }, [user?.id, user?.institutionId, refreshStorageUsage]);

  const triggerManualSync = React.useCallback(async () => {
    if (!isOnline) {
      toast.error('Cannot synchronize while offline. Please connect to the internet.');
      return;
    }
    setIsSyncing(true);
    try {
      const { processed, failed, conflicts } = await syncEngine.triggerSync();
      if (processed > 0) {
        toast.success(`Synchronized ${processed} offline operation(s) successfully.`);
      } else if (conflicts > 0) {
        toast.warning(`${conflicts} conflict(s) detected during synchronization.`);
      } else if (failed > 0) {
        toast.error(`Sync finished with ${failed} error(s). Will retry automatically.`);
      } else {
        toast.info('All data is already in sync.');
      }

      if (user?.id) {
        const meta = await offlineDB.syncMetadata.get(`meta_${user.id}`);
        if (meta?.lastSuccessfulSync) setLastSyncTime(meta.lastSuccessfulSync);
      }
      await refreshStorageUsage();
    } catch (caught: any) {
      toast.error(caught?.message || 'Synchronization failed.');
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline, user?.id, refreshStorageUsage]);

  return (
    <OfflineContext.Provider
      value={{
        isOnline,
        pendingCount,
        lastSyncTime,
        isSyncing,
        storageUsage,
        triggerManualSync,
        refreshStorageUsage,
      }}
    >
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return React.useContext(OfflineContext);
}
