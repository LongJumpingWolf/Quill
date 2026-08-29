import assert from "node:assert/strict";
import test from "node:test";

import { relayToImgbb } from "../src/server-fn/upload-image.ts";

test("returns an error, not a throw, when no API key is configured", async () => {
  const result = await relayToImgbb({ base64: "abc" }, undefined);
  assert.deepEqual(result, { error: "IMGBB_API_KEY is not set on the server." });
});

test("sends the image and key as ImgBB expects and returns its url", async () => {
  let seenUrl = "";
  let seenBody = "";
  const fakeFetch = async (url, init) => {
    seenUrl = String(url);
    seenBody = String(init?.body);
    return new Response(
      JSON.stringify({ success: true, data: { url: "https://i.ibb.co/abc/x.png" } }),
      {
        status: 200,
      },
    );
  };

  const result = await relayToImgbb({ base64: "ZmFrZQ==", name: "x.png" }, "my-key", fakeFetch);

  assert.equal(seenUrl, "https://api.imgbb.com/1/upload?key=my-key");
  assert.match(seenBody, /image=ZmFrZQ%3D%3D/);
  assert.match(seenBody, /name=x\.png/);
  assert.deepEqual(result, { url: "https://i.ibb.co/abc/x.png" });
});

test("falls back to display_url when url is absent", async () => {
  const fakeFetch = async () =>
    new Response(
      JSON.stringify({ success: true, data: { display_url: "https://i.ibb.co/abc/y.png" } }),
      {
        status: 200,
      },
    );
  const result = await relayToImgbb({ base64: "x" }, "key", fakeFetch);
  assert.deepEqual(result, { url: "https://i.ibb.co/abc/y.png" });
});

test("surfaces a non-2xx response as an error instead of throwing", async () => {
  const fakeFetch = async () => new Response("nope", { status: 400 });
  const result = await relayToImgbb({ base64: "x" }, "key", fakeFetch);
  assert.deepEqual(result, { error: "ImgBB responded with 400." });
});

test("surfaces success:false as an error even with a 200 response", async () => {
  const fakeFetch = async () => new Response(JSON.stringify({ success: false }), { status: 200 });
  const result = await relayToImgbb({ base64: "x" }, "key", fakeFetch);
  assert.deepEqual(result, { error: "ImgBB did not return an image URL." });
});

test("a network failure is reported, not thrown", async () => {
  const fakeFetch = async () => {
    throw new Error("network down");
  };
  const result = await relayToImgbb({ base64: "x" }, "key", fakeFetch);
  assert.deepEqual(result, { error: "Could not reach ImgBB." });
});
