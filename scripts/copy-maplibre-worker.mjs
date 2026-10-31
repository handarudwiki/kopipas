// MapLibre resolves its web worker relative to its own module URL, which bundlers rewrite.
// Serve the self-contained worker from /public and point MapLibre at it (see src/components/map.tsx).
import { copyFileSync, existsSync } from "node:fs";

const src = "node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs";
if (existsSync(src)) copyFileSync(src, "public/maplibre-gl-worker.mjs");
