import { mkdir, writeFile, readFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { StorageAdapter } from './interface.js';

export class FilesystemStorage implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  private dir(shareId: string): string {
    return join(this.basePath, shareId);
  }

  async put(shareId: string, name: string, data: Buffer): Promise<void> {
    await mkdir(this.dir(shareId), { recursive: true });
    await writeFile(join(this.dir(shareId), name), data);
  }

  async get(shareId: string, name: string): Promise<Buffer> {
    return readFile(join(this.dir(shareId), name));
  }

  async exists(shareId: string): Promise<boolean> {
    return existsSync(this.dir(shareId));
  }

  async delete(shareId: string): Promise<void> {
    await rm(this.dir(shareId), { recursive: true, force: true });
  }

  async expireBefore(cutoff: Date): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(this.basePath, { withFileTypes: true });
    } catch {
      return [];
    }

    const expired: string[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await readFile(join(this.basePath, entry.name, 'meta.json'), 'utf8');
        const meta = JSON.parse(raw) as { expiresAt?: string };
        if (meta.expiresAt && new Date(meta.expiresAt) < cutoff) {
          expired.push(entry.name);
        }
      } catch {
        // Skip unreadable or malformed entries
      }
    }
    return expired;
  }
}
