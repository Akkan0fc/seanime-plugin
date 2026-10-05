# Cached Discover Schedule

SeaAnime's built-in **Discover → Schedule** screen creates fresh, time-based
query keys whenever it opens. SeaAnime plugins cannot change that internal
React Query configuration, so this plugin supplies a replacement schedule
screen that caches the same AniList data for the current app session.

It has the requested behaviour:

- The first open fetches the next two weeks of the Discover schedule (two
  AniList pages, as the built-in view does).
- Later opens reuse the in-memory result; closing SeaAnime clears it.
- **Refresh** is the only in-app action that discards the cached data and
  fetches again.
- The Discover page gets an **Open cached schedule** shortcut, and the main
  sidebar gets a **Cached Schedule** item.

## Install for local development

1. In `cached-discover-schedule.json`, set `payloadURI` to the absolute path
   of `discover-schedule-cache.ts` on your machine. It is already set for this
   workspace.
2. Copy `cached-discover-schedule.json` into SeaAnime's data-directory
   `extensions` folder.
3. Restart SeaAnime, enable **Cached Discover Schedule**, and approve its
   AniList permission.
4. Use **Open cached schedule** from Discover, or the **Cached Schedule**
   sidebar item. Use **Refresh** in the upper-right when you want new data.

`isDevelopment` is deliberately enabled, so SeaAnime can reload the plugin
while you edit the TypeScript file. Before sharing it, host the script and
manifest, change `payloadURI` to that public script URL, and remove
`isDevelopment`.

## Why this is a replacement screen

The plugin API can add UI, persist its own data, and call AniList, but it
cannot edit or invalidate the native Discover screen's private React Query
cache. A button injected into the native screen could clear SeaAnime's
server-side cache, but it could not stop the native tab from making its own
request on every visit. This implementation avoids making that misleading
promise and caches the actual schedule it displays.
