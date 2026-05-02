import { z } from 'zod';
import { LIMITS } from './constants.js';

// ---------------------------------------------------------------------------
// Manifest (encrypted payload — decrypted client-side only)
// ---------------------------------------------------------------------------

export const ManifestFileSchema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  blobId: z.string(), // e.g. "blob-0001"
  iv: z.string(), // base64url, 12 bytes
});
export type ManifestFile = z.infer<typeof ManifestFileSchema>;

export const ManifestSchema = z.object({
  version: z.literal(1),
  files: z.array(ManifestFileSchema).min(1),
  note: z.string().nullable(),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ---------------------------------------------------------------------------
// Upload request meta field
// ---------------------------------------------------------------------------

export const UploadMetaSchema = z.object({
  expiryHours: z
    .number()
    .int()
    .positive()
    .refine((v) => (LIMITS.expiryPresetsHours as readonly number[]).includes(v), {
      message: 'expiryHours must be one of the configured presets',
    }),
  downloadLimit: z
    .number()
    .int()
    .nonnegative()
    .refine((v) => (LIMITS.downloadLimitPresets as readonly number[]).includes(v), {
      message: 'downloadLimit must be one of the configured presets (0 = unlimited)',
    }),
  passwordProtected: z.boolean(),
  salt: z.string().nullable(),
  ivWrap: z.string().nullable(),
  wrappedKey: z.string().nullable(),
  fileCount: z.number().int().positive(),
  totalSizeEncrypted: z.number().int().nonnegative(),
});
export type UploadMeta = z.infer<typeof UploadMetaSchema>;

// ---------------------------------------------------------------------------
// Download manifest endpoint response
// ---------------------------------------------------------------------------

export const DownloadManifestResponseSchema = z.object({
  id: z.string(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  passwordRequired: z.boolean(),
  remainingDownloads: z.number().int().nonnegative().nullable(),
  manifestCiphertext: z.string(), // base64url
  manifestIv: z.string(), // base64url
  salt: z.string().nullable(),
  ivWrap: z.string().nullable(),
  wrappedKey: z.string().nullable(),
});
export type DownloadManifestResponse = z.infer<typeof DownloadManifestResponseSchema>;

/** Settings the uploader sends along with a new share. */
export const ShareSettingsSchema = z.object({
  expiryHours: z
    .number()
    .int()
    .positive()
    .refine((v) => (LIMITS.expiryPresetsHours as readonly number[]).includes(v), {
      message: 'expiryHours must be one of the configured presets',
    }),
  downloadLimit: z
    .number()
    .int()
    .nonnegative()
    .refine((v) => (LIMITS.downloadLimitPresets as readonly number[]).includes(v), {
      message: 'downloadLimit must be one of the configured presets (0 = unlimited)',
    }),
  password: z.boolean(),
  fourWordCode: z.boolean(),
});
export type ShareSettings = z.infer<typeof ShareSettingsSchema>;

/** Public metadata about a share, returned to the recipient before download. */
export const ShareMetaSchema = z.object({
  id: z.string().min(8),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  remainingDownloads: z.number().int().nonnegative().nullable(),
  fileCount: z.number().int().positive(),
  totalSizeBytes: z.number().int().positive(),
  passwordRequired: z.boolean(),
});
export type ShareMeta = z.infer<typeof ShareMetaSchema>;
