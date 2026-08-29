import { createServerFn } from "@tanstack/react-start";

type UploadInput = { base64: string; name?: string };
type UploadResult = { url: string } | { error: string };

/**
 * The actual relay logic, kept separate from `createServerFn` so it can be
 * unit tested directly (TanStack's RPC transport is its own tested code;
 * this is the part specific to this app).
 */
export async function relayToImgbb(
  data: UploadInput,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<UploadResult> {
  if (!apiKey) {
    return { error: "IMGBB_API_KEY is not set on the server." };
  }

  const body = new URLSearchParams();
  body.set("image", data.base64);
  if (data.name) body.set("name", data.name);

  let response: Response;
  try {
    response = await fetchImpl(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: "POST",
      body,
    });
  } catch {
    return { error: "Could not reach ImgBB." };
  }

  if (!response.ok) {
    return { error: `ImgBB responded with ${response.status}.` };
  }

  const payload = (await response.json()) as {
    data?: { url?: string; display_url?: string };
    success?: boolean;
  };
  const url = payload.data?.url ?? payload.data?.display_url;
  if (!payload.success || !url) {
    return { error: "ImgBB did not return an image URL." };
  }

  return { url };
}

/**
 * Relays an image upload to ImgBB. Runs only on the server, so
 * IMGBB_API_KEY never reaches the browser bundle — the same shape as the
 * Vercel `api/upload-image.js` relay used by Kardex and Practex, just as a
 * TanStack Start server function instead of a standalone endpoint.
 *
 * Set IMGBB_API_KEY in your deployment's environment variables. Get a key
 * from https://api.imgbb.com/ (free, no approval wait).
 */
export const uploadImage = createServerFn({ method: "POST" })
  .validator((data: UploadInput) => data)
  .handler(async ({ data }): Promise<UploadResult> =>
    relayToImgbb(data, process.env["IMGBB_API_KEY"]),
  );
