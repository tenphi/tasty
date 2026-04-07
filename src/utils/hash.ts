/**
 * Fast string hash (djb2) for deduplication keys.
 * Not cryptographic — just collision-resistant enough for cache keys.
 */
export function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
