import fs from "node:fs";
import { stateDir } from "./inject.js";
import { UPSTREAM_REPO, UPSTREAM_BASELINE } from "./baseline.js";

const REPO = UPSTREAM_REPO;
const CACHE_TTL = 6 * 60 * 60 * 1000;
const TIMEOUT = 8000;

function cacheFile(home) {
  return stateDir(home) + "/update.json";
}

export function readCache(home) {
  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(home), "utf8"));
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

function writeCache(data, home) {
  try {
    fs.mkdirSync(stateDir(home), { recursive: true, mode: 0o700 });
    fs.writeFileSync(cacheFile(home), JSON.stringify(data, null, 2), { mode: 0o600 });
  } catch { /* cache is best effort */ }
}

export function compareVersions(a, b) {
  const pa = String(a || "").replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = String(b || "").replace(/^v/i, "").split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

async function withTimeout(run) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

// Raw package.json is the primary source: the GitHub API answers 403 for
// unauthenticated callers behind a shared address, while raw is a plain CDN
// read. The API stays as a fallback for a release with no master bump.
async function latestFromRaw(signal) {
  const res = await fetch("https://raw.githubusercontent.com/" + REPO + "/master/package.json", {
    headers: { "user-agent": "dsh-apple-purge" },
    signal,
  });
  if (!res.ok) throw new Error("raw HTTP " + res.status);
  const body = await res.json();
  const version = String(body.version || "").replace(/^v/i, "");
  if (!version) throw new Error("raw package.json has no version");
  return { version, url: "https://github.com/" + REPO + "/releases", source: "raw" };
}

async function latestFromApi(signal) {
  const res = await fetch("https://api.github.com/repos/" + REPO + "/releases/latest", {
    headers: { "user-agent": "dsh-apple-purge", accept: "application/vnd.github+json" },
    signal,
  });
  if (!res.ok) throw new Error("GitHub HTTP " + res.status);
  const body = await res.json();
  const version = String(body.tag_name || body.name || "").replace(/^v/i, "");
  if (!version) throw new Error("release has no tag");
  return { version, url: body.html_url || "https://github.com/" + REPO + "/releases", source: "api", publishedAt: body.published_at || "" };
}

export async function checkUpstream({ force = false, home, current, baseline = UPSTREAM_BASELINE } = {}) {
  const cached = readCache(home);
  const fresh = cached && cached.checkedAt && Date.now() - cached.checkedAt < CACHE_TTL;
  if (fresh && !force) return { ...cached, cached: true };

  const errors = [];
  for (const probe of [latestFromRaw, latestFromApi]) {
    try {
      const found = await withTimeout(probe);
      const data = {
        repo: REPO,
        latest: found.version,
        url: found.url,
        publishedAt: found.publishedAt || "",
        source: found.source,
        checkedAt: Date.now(),
        current: current || "",
        baseline,
        // Drift means upstream moved past the anchors this plugin was built on.
        hasDrift: compareVersions(found.version, baseline || "0.0.0") > 0,
        hasUpdate: compareVersions(found.version, current || "0.0.0") > 0,
        error: "",
      };
      writeCache(data, home);
      return { ...data, cached: false };
    } catch (error) {
      errors.push(String(error && error.message || error));
    }
  }

  const fallback = cached || {
    repo: REPO,
    latest: "",
    url: "https://github.com/" + REPO + "/releases",
    checkedAt: 0,
    current: current || "",
    baseline,
    hasDrift: false,
    hasUpdate: false,
  };
  return { ...fallback, error: errors.join("; ") || "unknown", cached: true };
}

export { REPO };
