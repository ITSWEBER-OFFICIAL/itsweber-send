import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import type { StorageAdapter } from './interface.js';

function key(shareId: string, name: string): string {
  return `${shareId}/${name}`;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as any));
  }
  return Buffer.concat(chunks);
}

export class S3Storage implements StorageAdapter {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    options: {
      endpoint?: string;
      region?: string;
      forcePathStyle?: boolean;
    } = {},
  ) {
    this.client = new S3Client({
      region: options.region ?? 'us-east-1',
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      forcePathStyle: options.forcePathStyle ?? false,
    });
  }

  async put(shareId: string, name: string, data: Buffer): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key(shareId, name),
        Body: data,
      }),
    );
  }

  async get(shareId: string, name: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key(shareId, name),
      }),
    );
    if (!response.Body) {
      throw new Error(`Empty response body for ${key(shareId, name)}`);
    }
    return streamToBuffer(response.Body as NodeJS.ReadableStream);
  }

  async exists(shareId: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: key(shareId, 'meta.json'),
        }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async delete(shareId: string): Promise<void> {
    const prefix = `${shareId}/`;
    let continuationToken: string | undefined;

    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];
      if (objects.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: objects, Quiet: true },
          }),
        );
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async expireBefore(cutoff: Date): Promise<string[]> {
    const expired: string[] = [];
    let continuationToken: string | undefined;

    // List only meta.json objects — one per share, minimal data transfer.
    do {
      const list = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          ContinuationToken: continuationToken,
        }),
      );

      const metaKeys = (list.Contents ?? [])
        .map((o) => o.Key!)
        .filter((k) => k.endsWith('/meta.json'));

      for (const metaKey of metaKeys) {
        try {
          const resp = await this.client.send(
            new GetObjectCommand({ Bucket: this.bucket, Key: metaKey }),
          );
          const raw = (await streamToBuffer(resp.Body as NodeJS.ReadableStream)).toString('utf8');
          const meta = JSON.parse(raw) as { expiresAt?: string };
          if (meta.expiresAt && new Date(meta.expiresAt) < cutoff) {
            expired.push(metaKey.replace('/meta.json', ''));
          }
        } catch {
          // Skip unreadable objects
        }
      }

      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } while (continuationToken);

    return expired;
  }
}
