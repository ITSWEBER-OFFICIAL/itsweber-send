import type { AuthUser } from '@itsweber-send/shared';

class AuthStore {
  user = $state<AuthUser | null>(null);
  loaded = $state(false);

  async load(): Promise<void> {
    try {
      const res = await fetch('/api/v1/auth/me');
      this.user = res.ok ? ((await res.json()) as AuthUser) : null;
    } catch {
      this.user = null;
    }
    this.loaded = true;
  }

  async logout(): Promise<void> {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    this.user = null;
  }
}

export const auth = new AuthStore();
