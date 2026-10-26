const SHARE_CACHE = "share-target-temp-v1";

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method === "POST" && url.pathname.endsWith("/share-target/")) {
    event.respondWith(handleShareTarget(event));
  }
});

async function handleShareTarget(event) {
  try {
    const formData = await event.request.formData();
    const files = formData.getAll("files").filter((f) => f && typeof f === "object" && "size" in f);
    const cache = await caches.open(SHARE_CACHE);
    await cache.put(
      "share-payload",
      new Response(JSON.stringify({ fileCount: files.length }))
    );
    await Promise.all(
      files.map((file, i) =>
        cache.put(
          `share-file-${i}`,
          new Response(file, {
            headers: {
              "x-filename": encodeURIComponent(file.name || `shared-${i}`),
              "Content-Type": file.type || "application/octet-stream",
            },
          })
        )
      )
    );
  } catch (err) {
    // ignore - the app will simply find no pending shared files
  }
  const scopeUrl = new URL("../", event.request.url);
  return Response.redirect(`${scopeUrl.href}?share-target=1`, 303);
}
