// =============================================================================
// STORAGE HELPERS — signed URLs + user-scoped upload paths
// =============================================================================
// Use these in edge functions when working with private storage buckets.
// Object paths follow the convention `<auth.uid()>/<filename>` so the bucket
// policies (see sql/create-bucket.sql) can verify ownership by inspecting
// the path's first segment.
//
// All helpers expect a user-scoped Supabase client (from `_shared/auth.ts` →
// `createUserClient(req)`). RLS-on-storage will reject any access outside
// the user's own folder — these helpers just make the path construction
// and signed URL generation consistent.
// =============================================================================

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface UploadResult {
  /** Storage path written, e.g. "f7c1.../recipe-001.jpg" */
  path: string;
  /** The bucket the object lives in (echoed for convenience) */
  bucket: string;
}

export interface SignedUrlResult {
  /** Signed URL valid for `expiresIn` seconds */
  signedUrl: string;
  /** Wall-clock expiry as ISO string */
  expiresAt: string;
}

/**
 * Builds the canonical storage path for a user's object.
 * `<userId>/<unique-filename>` — first segment matches `auth.uid()` so
 * the storage policies pass.
 *
 * Always pass a unique filename (e.g., a UUID + extension) — never the
 * raw user-supplied filename, which can collide or contain path-traversal
 * sequences.
 */
export function userObjectPath(userId: string, filename: string): string {
  // Strip any path separators or `..` from the supplied filename to be safe.
  const safe = filename.replace(/[\\/]/g, "_").replace(/\.\./g, "_");
  return `${userId}/${safe}`;
}

/**
 * Uploads a file to the given private bucket at the canonical user path.
 *
 * Usage inside an edge function:
 *
 *   const client = createUserClient(req);
 *   const { path } = await uploadToUserFolder(
 *     client,
 *     "rcv_uploads",
 *     user.id,
 *     `${crypto.randomUUID()}.jpg`,
 *     fileBuffer,
 *     "image/jpeg"
 *   );
 */
export async function uploadToUserFolder(
  client: SupabaseClient,
  bucket: string,
  userId: string,
  filename: string,
  body: ArrayBuffer | Blob | Uint8Array,
  contentType: string
): Promise<UploadResult> {
  const path = userObjectPath(userId, filename);

  const { error } = await client.storage.from(bucket).upload(path, body, {
    contentType,
    upsert: false,                  // never overwrite silently
    cacheControl: "3600",
  });

  if (error) {
    throw new Error(`Upload to ${bucket}/${path} failed: ${error.message}`);
  }

  return { path, bucket };
}

/**
 * Generates a short-lived signed URL for a private object.
 *
 * `expiresIn` is in seconds. Default 60 (one minute) — short by design.
 * Long-lived signed URLs are a leak risk; if your UX needs a longer
 * window, generate a fresh one on demand instead.
 *
 * Usage:
 *   const { signedUrl } = await signedUrlFor(client, "rcv_uploads", path);
 *   return new Response(JSON.stringify({ url: signedUrl }), { ... });
 */
export async function signedUrlFor(
  client: SupabaseClient,
  bucket: string,
  path: string,
  expiresIn = 60
): Promise<SignedUrlResult> {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);

  if (error || !data) {
    throw new Error(
      `Signed URL for ${bucket}/${path} failed: ${error?.message ?? "no data"}`
    );
  }

  return {
    signedUrl: data.signedUrl,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
  };
}

/**
 * Deletes one or more objects from a user's folder. RLS will reject
 * deletion of objects outside the user's own folder, but we ALSO assert
 * the path prefix in app code as defense-in-depth.
 */
export async function deleteUserObjects(
  client: SupabaseClient,
  bucket: string,
  userId: string,
  paths: string[]
): Promise<void> {
  for (const p of paths) {
    if (!p.startsWith(`${userId}/`)) {
      throw new Error(
        `Refused to delete ${bucket}/${p}: path does not start with ${userId}/`
      );
    }
  }

  const { error } = await client.storage.from(bucket).remove(paths);
  if (error) {
    throw new Error(`Delete in ${bucket} failed: ${error.message}`);
  }
}
