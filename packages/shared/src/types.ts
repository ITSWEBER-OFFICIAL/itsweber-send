/** Storage backend identifier. */
export type StorageBackend = 'filesystem' | 's3';

/** Theme preference written to the `data-theme` attribute. */
export type ThemeMode = 'light' | 'dark' | 'system';

/** Result of a server-side share lookup. */
export interface ShareLookup {
  found: boolean;
  expired: boolean;
  exhausted: boolean;
  passwordRequired: boolean;
}

/** Authenticated user as returned by /api/v1/auth/me */
export interface AuthUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  quotaBytes: number;
}

/** Account upload list entry */
export interface AccountUpload {
  id: string;
  createdAt: string;
  expiresAt: string;
  expired: boolean;
  downloadLimit: number;
  downloadsUsed: number;
  totalSizeBytes: number;
  passwordProtected: boolean;
}

/** Admin stats response */
export interface AdminStats {
  totalUsers: number;
  totalShares: number;
  activeShares: number;
  totalStorageBytes: number;
}
