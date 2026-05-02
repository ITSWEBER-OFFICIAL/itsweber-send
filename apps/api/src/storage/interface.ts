export interface StorageAdapter {
  /** Write data under shareId/name, creating the directory if necessary. */
  put(shareId: string, name: string, data: Buffer): Promise<void>;
  /** Read data for shareId/name. Throws if not found. */
  get(shareId: string, name: string): Promise<Buffer>;
  /** Return true if the share directory exists. */
  exists(shareId: string): Promise<boolean>;
  /** Remove the entire share directory and all contained files. */
  delete(shareId: string): Promise<void>;
  /**
   * Scan storage for shares whose meta.json expiresAt is before cutoff.
   * Used by the cleanup job to reconcile storage vs DB.
   */
  expireBefore(cutoff: Date): Promise<string[]>;
}
