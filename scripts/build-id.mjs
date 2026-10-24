// One build id for the web bundle, shared by vite.config.ts (baked into the app) and
// scripts/build-ota.mjs (written to /ota/latest.json). The same commit gives the same id
// on Netlify, Vercel and GitHub Actions, so an APK built from a commit doesn't "update" to itself.
export function buildId(env = process.env) {
  const sha = env.COMMIT_REF || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || "";
  return sha ? sha.slice(0, 12) : `dev-${Date.now().toString(36)}`;
}
