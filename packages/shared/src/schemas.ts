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

// Manifest v2 (chunked AES-GCM, default from v1.1) — see packages/crypto-spec/README.md
export const ManifestChunkSchema = z.object({
  iv: z.string(), // base64url, 12 bytes
  cipherSize: z.number().int().positive(),
});
export type ManifestChunk = z.infer<typeof ManifestChunkSchema>;

export const ManifestFileV2Schema = z.object({
  name: z.string(),
  size: z.number().int().nonnegative(),
  mime: z.string(),
  blobId: z.string(),
  chunkSize: z.number().int().positive(),
  chunks: z.array(ManifestChunkSchema).min(1),
});
export type ManifestFileV2 = z.infer<typeof ManifestFileV2Schema>;

export const ManifestV2Schema = z.object({
  version: z.literal(2),
  files: z.array(ManifestFileV2Schema).min(1),
  note: z.string().nullable(),
});
export type ManifestV2 = z.infer<typeof ManifestV2Schema>;

export const AnyManifestSchema = z.union([ManifestSchema, ManifestV2Schema]);
export type AnyManifest = z.infer<typeof AnyManifestSchema>;

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

// ---------------------------------------------------------------------------
// Resumable upload protocol (v1.1)
// ---------------------------------------------------------------------------

export const ResumableUploadBlobPlanSchema = z.object({
  blobId: z.string().regex(/^blob-\d{4}$/),
  cipherSize: z.number().int().positive(),
  chunkCount: z.number().int().positive(),
});
export type ResumableUploadBlobPlan = z.infer<typeof ResumableUploadBlobPlanSchema>;

export const ResumableUploadCreateRequestSchema = z.object({
  blobs: z.array(ResumableUploadBlobPlanSchema).min(1),
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
  /**
   * Opt-in flag for the "downloaded" notification. The server ignores this
   * for anonymous uploads and otherwise derives the recipient address from
   * the authenticated session (`request.user.email`) — clients never get
   * to pick the recipient, so an open instance cannot be turned into an
   * unsolicited mailer for arbitrary addresses.
   */
  notifyOnDownload: z.boolean().optional(),
});
export type ResumableUploadCreateRequest = z.infer<typeof ResumableUploadCreateRequestSchema>;

export const ResumableUploadCreateResponseSchema = z.object({
  uploadId: z.string(),
  shareId: z.string(),
  chunkSize: z.number().int().positive(),
  maxBlobBytes: z.number().int().positive(),
  expiresAt: z.string().datetime(),
});
export type ResumableUploadCreateResponse = z.infer<typeof ResumableUploadCreateResponseSchema>;

export const ResumableUploadStateSchema = z.object({
  uploadId: z.string(),
  shareId: z.string(),
  expiresAt: z.string().datetime(),
  finalized: z.boolean(),
  blobs: z.array(
    z.object({
      blobId: z.string(),
      cipherSize: z.number().int().positive(),
      chunkCount: z.number().int().positive(),
      receivedBytes: z.number().int().nonnegative(),
      receivedChunks: z.number().int().nonnegative(),
    }),
  ),
});
export type ResumableUploadState = z.infer<typeof ResumableUploadStateSchema>;

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
