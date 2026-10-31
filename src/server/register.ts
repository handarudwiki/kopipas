/**
 * Side-effect imports that register async job handlers and domain hooks. Imported by every API
 * route (src/lib/api.ts) so a job enqueued anywhere always finds its handler.
 */
import "./shipments";
import "./documents";
import "./risk";
import "./lots";
