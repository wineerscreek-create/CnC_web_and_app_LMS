import { createAsyncThunk, createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { ApiError, api, setAccessToken } from '@/lib/api';
import type { Role } from '@/lib/roleRoutes';
import { purgeUserOfflineData, setActiveSessionMeta, setCurrentActiveUserId } from '@/lib/offline/db';

const SESSION_STORAGE_KEY = 'winners_creek_cached_session';

function getStoredOfflineUser(): SessionUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

function setStoredOfflineUser(user: SessionUser | null) {
  if (typeof window === 'undefined') return;
  try {
    if (user) {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
      setActiveSessionMeta({
        userId: user.id,
        institutionId: user.institutionId || user.collegeId || null,
        role: user.role,
      });
      setCurrentActiveUserId(user.id);
    } else {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      setActiveSessionMeta(null);
      setCurrentActiveUserId(null);
    }
  } catch {
    // Ignore storage quota/security errors
  }
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  institutionId?: string | null;
  role: Role;
  roleLabel: string;
  collegeId?: string | null;
  collegeName?: string | null;
  departmentId?: string | null;
  departmentName?: string | null;
  emailVerified: boolean;
  status: string;
  avatarColor?: string | null;
  mustChangePassword: boolean;
  home: string;
  preferences?: Record<string, boolean>;
  assignedBatchIds?: string[];
  profile?: Record<string, any> | null;
}

export type AuthStatus = 'idle' | 'restoring' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  error: string | null;
  signingIn: boolean;
}

const initialState: AuthState = {
  status: 'idle',
  user: null,
  error: null,
  signingIn: false,
};

/** Rehydrate from the HttpOnly refresh cookie on first load, or offline cache if disconnected. */
export const restoreSession = createAsyncThunk('auth/restore', async (_, { rejectWithValue }) => {
  try {
    const token = await api.refresh();
    if (!token) {
      // Offline fallback: if network is down or disconnected, allow cached session
      const offlineUser = getStoredOfflineUser();
      if (offlineUser) {
        setStoredOfflineUser(offlineUser);
        return offlineUser;
      }
      return rejectWithValue('anonymous');
    }
    const me = await api.get('/auth/me');
    const user = me.data as SessionUser;
    setStoredOfflineUser(user);
    return user;
  } catch (err) {
    const offlineUser = getStoredOfflineUser();
    if (offlineUser) {
      setStoredOfflineUser(offlineUser);
      return offlineUser;
    }
    return rejectWithValue('anonymous');
  }
});

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (
    payload: { identifier: string; password: string; rememberMe?: boolean },
    { rejectWithValue },
  ) => {
    try {
      const response = await api.post('/auth/login', payload);
      if (!response.success) {
        return rejectWithValue({
          message: response.message || 'Sign-in failed',
          verificationRequired: response.data?.verificationRequired,
          email: response.data?.email,
        });
      }
      setAccessToken(response.data.accessToken);
      return response.data.user as SessionUser;
    } catch (error) {
      const apiError = error as ApiError;
      return rejectWithValue({
        message: apiError.message,
        code: apiError.code,
        verificationRequired: (apiError as any).data?.verificationRequired,
        email: (apiError as any).data?.email,
      });
    }
  },
);

export const signOut = createAsyncThunk('auth/signOut', async () => {
  try {
    await api.post('/auth/logout');
  } finally {
    setAccessToken(null);
  }
});

export const signOutEverywhere = createAsyncThunk('auth/signOutAll', async () => {
  try {
    await api.post('/auth/logout-all');
  } finally {
    setAccessToken(null);
  }
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    sessionExpired(state) {
      if (state.user?.id) {
        purgeUserOfflineData(state.user.id).catch(() => {});
      }
      setStoredOfflineUser(null);
      state.status = 'anonymous';
      state.user = null;
      setAccessToken(null);
    },
    clearAuthError(state) {
      state.error = null;
    },
    userUpdated(state, action: PayloadAction<Partial<SessionUser>>) {
      if (state.user) {
        state.user = { ...state.user, ...action.payload };
        setStoredOfflineUser(state.user);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(restoreSession.pending, (state) => {
        state.status = 'restoring';
      })
      .addCase(restoreSession.fulfilled, (state, action) => {
        state.status = 'authenticated';
        state.user = action.payload;
        setStoredOfflineUser(action.payload);
      })
      .addCase(restoreSession.rejected, (state) => {
        state.status = 'anonymous';
        state.user = null;
      })
      .addCase(signIn.pending, (state) => {
        state.signingIn = true;
        state.error = null;
      })
      .addCase(signIn.fulfilled, (state, action) => {
        state.signingIn = false;
        state.status = 'authenticated';
        state.user = action.payload;
        setStoredOfflineUser(action.payload);
        state.error = null;
      })
      .addCase(signIn.rejected, (state, action) => {
        state.signingIn = false;
        state.status = 'anonymous';
        state.error = (action.payload as { message?: string })?.message ?? 'Sign-in failed';
      })
      .addCase(signOut.fulfilled, (state) => {
        if (state.user?.id) {
          purgeUserOfflineData(state.user.id).catch(() => {});
        }
        setStoredOfflineUser(null);
        state.status = 'anonymous';
        state.user = null;
      })
      .addCase(signOutEverywhere.fulfilled, (state) => {
        if (state.user?.id) {
          purgeUserOfflineData(state.user.id).catch(() => {});
        }
        setStoredOfflineUser(null);
        state.status = 'anonymous';
        state.user = null;
      });
  },
});

export const { sessionExpired, clearAuthError, userUpdated } = authSlice.actions;
export default authSlice.reducer;
