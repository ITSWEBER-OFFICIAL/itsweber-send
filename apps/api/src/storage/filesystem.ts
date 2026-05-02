import { mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { existsSync, createWriteStream, createReadStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { StorageAdapter } from './interface.js';

export class FilesystemStorage implements StorageAdapter {
  constructor(private readonly basePath: string) {}

  private dir(shareId: string): string {
    return join(this.basePath, shareId);
  }

  private path(shareId: string, name: string): string {
    return join(this.dir(shareId), name);
  }

  async put(shareId: string, name: string, data: Buffer): Promise<void> {
    await mkdir(this.dir(shareId), { recursive: true });
    await writeFile(this.path(shareId, name), data);
  }

  async get(shareId: string, name: string): Promise<Buffer> {
    return readFile(this.path(shareId, name));
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

  async appendStream(
    shareId: string,
    name: string,
    source: Readable,
  ): Promise<{ bytesWritten: number }> {
    await mkdir(this.dir(shareId), { recursive: true });

    let bytesWritten = 0;
    const counter = async function* (src: Readable): AsyncIterable<Buffer> {
      for await (const chunk of src) {
        const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as ArrayBufferLike);
        bytesWritten += buf.byteLength;
        yield buf;
      }
    };

    const sink = createWriteStream(this.path(shareId, name), { flags: 'a' });
    await pipeline(counter(source), sink);
    return { bytesWritten };
  }

  async size(shareId: string, name: string): Promise<number | null> {
    try {
      const s = await stat(this.path(shareId, name));
      return s.size;
    } catch {
      return null;
    }
  }

  async getStream(
    shareId: string,
    name: string,
    range?: { start: number; end?: number },
  ): Promise<Readable> {
    if (!range) {
      return createReadStream(this.path(shareId, name));
    }
    const opts: { start: number; end?: number } = { start: range.start };
    if (typeof range.end === 'number') opts.end = range.end;
    return createReadStream(this.path(shareId, name), opts);
  }
}
