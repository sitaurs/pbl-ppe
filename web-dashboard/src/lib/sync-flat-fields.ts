// lib/sync-flat-fields.ts
// Syncs flat fields from nested objects to maintain backward compatibility
// with ServiceAPDBackend.py which reads flat fields directly from db.json.
// Requirements: 9.2

/**
 * Synchronizes flat fields from nested objects for backward compatibility.
 * - camera.url → cameraSource (always synced)
 * - When camera is null → cameraSource = "0" (fallback)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function syncFlatFields(node: any): any {
  const synced = { ...node };

  // Sync cameraSource from camera.url
  if (synced.camera && synced.camera.url) {
    synced.cameraSource = synced.camera.url;
  } else if (synced.camera === null) {
    synced.cameraSource = '0';
  }

  return synced;
}
