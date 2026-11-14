import fs from "node:fs";
import { DEFAULT_INJECT } from "./defaults.js";
import {
  readInject, writeInject, resetInject, readFullInject, isCustomInject,
  readState, writeState, injectFile, dshHome,
} from "./inject.js";
import { status as patchStatus, apply as patchApply, revert as patchRevert, backup as patchBackup } from "./engine.js";
import { PATCH_GROUPS, applePatchList } from "../lib/patches/apple.mjs";
import { renderPage } from "./ui.js";
import { checkUpstream } from "./update.js";
import { UPSTREAM_BASELINE } from "./baseline.js";

const VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).version;
  } catch {
    return "0.0.0";
  }
})();

export const name = "dsh-apple-purge";
export const inject = ["systemPrompt", "webServer"];

const SECTION_NAME = "dsh-apple-purge";
const SECTION_ORDER = -99900;
const API = "/dsh-apple-purge";

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, code, data) {
  res.writeHead(code, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(data, null, 2));
}

let menuInjectCount = 0;
let menuInjectError = "";

function currentInject() {
  return readInject();
}

function applyPromptSection(ctx) {
  const hosts = [];
  const push = (host) => {
    if (host && !hosts.includes(host)) hosts.push(host);
  };
  try { push(ctx?.systemPrompt?.ctx); } catch { /* proxy not injected yet */ }
  push(ctx);

  const section = {
    name: SECTION_NAME,
    order: SECTION_ORDER,
    interpolate: false,
    text: () => currentInject(),
  };

  const disposers = [];
  let registered = false;
  let lastError = null;
  for (const host of hosts) {
    try {
      const dispose = host.systemPrompt.section(section);
      registered = true;
      if (typeof dispose === "function") disposers.push(dispose);
    } catch (error) {
      const message = String(error && error.message || error);
      if (message.includes("already registered")) registered = true;
      else lastError = error;
    }
  }
  if (!registered && lastError) throw lastError;
  if (disposers.length && typeof ctx.effect === "function") {
    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try { dispose(); } catch { /* ignore */ }
      }
    });
  }
  return registered;
}

export function apply(ctx, config) {
  const cfg = config && typeof config === "object" ? config : {};
  if (cfg.enabled === false) return;

  try {
    applyPromptSection(ctx);
  } catch (error) {
    console.warn("[dsh-apple-purge] prompt section failed:", String(error && error.message || error));
  }

  // 面板由侧栏入口 + 主区页面承载，这里不再注入账户菜单跳转。
  ctx.inject(["webServer"], (scope) => {
    const routes = [];
    const register = (path, handler, method) => {
      const dispose = scope.webServer.register({
        kind: "exact",
        path,
        handler: async (request, response) => {
          const wanted = String(method || "GET").split(",").map((item) => item.trim()).filter(Boolean);
          if (!wanted.includes(request.method)) {
            response.writeHead(405, { allow: wanted.join(", ") });
            response.end();
            return;
          }
          try {
            await handler(request, response);
          } catch (error) {
            sendJson(response, 500, { ok: false, error: String(error && error.message || error) });
          }
        },
      }, "dsh-apple-purge: " + path);
      if (typeof dispose === "function") routes.push(dispose);
    };

    register(API + "/status", async (request, response) => {
      const state = readState();
      const patches = patchStatus(state.modules);
      sendJson(response, 200, {
        ok: true,
        version: VERSION,
        host: dshHome(),
        section: SECTION_NAME,
        inject: { custom: isCustomInject(), file: injectFile(), length: currentInject().length },
        modules: state.modules,
        groups: PATCH_GROUPS.map((g) => ({ key: g.key, label: g.label, defaultEnabled: g.defaultEnabled, count: g.ids.length })),
        patches: patches.rows,
        counts: patches.counts,
        base: patches.base,
        lastApply: state.lastApply,
        menu: { injections: menuInjectCount, error: menuInjectError },
      });
    });

    register(API + "/text", async (request, response) => {
      if (request.method === "POST") {
        const body = await readJson(request);
        if (typeof body.text !== "string") {
          sendJson(response, 400, { ok: false, error: "text required" });
          return;
        }
        const file = writeInject(body.text);
        sendJson(response, 200, { ok: true, file, length: body.text.length });
        return;
      }
      const text = currentInject();
      sendJson(response, 200, {
        ok: true,
        text,
        custom: isCustomInject(),
        isDefault: text === DEFAULT_INJECT,
      });
    }, "GET,POST");

    register(API + "/reset", async (request, response) => {
      const text = resetInject();
      sendJson(response, 200, { ok: true, text, length: text.length });
    }, "POST");

    register(API + "/full", async (request, response) => {
      const text = readFullInject();
      sendJson(response, 200, { ok: true, text, length: text.length });
    });

    register(API + "/module", async (request, response) => {
      const body = await readJson(request);
      const key = String(body.key || "");
      const group = PATCH_GROUPS.find((item) => item.key === key);
      if (!group) {
        sendJson(response, 400, { ok: false, error: "unknown module" });
        return;
      }
      const state = readState();
      state.modules[key] = Boolean(body.enabled);
      writeState(state);
      sendJson(response, 200, { ok: true, modules: state.modules, patches: applePatchList(state.modules) });
    }, "POST");

    register(API + "/apply", async (request, response) => {
      const state = readState();
      const result = await patchApply(state.modules);
      const next = readState();
      next.lastApply = { at: new Date().toISOString(), summary: (result.hosts || []).map((h) => h.summary) };
      writeState(next);
      sendJson(response, 200, { ok: true, result });
    }, "POST");

    register(API + "/backup", async (request, response) => {
      const result = await patchBackup();
      sendJson(response, 200, { ok: true, result });
    }, "POST");

    register(API + "/revert", async (request, response) => {
      const result = await patchRevert();
      sendJson(response, 200, { ok: true, result });
    }, "POST");

    register(API + "/update", async (request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const data = await checkUpstream({
        force: url.searchParams.get("force") === "1",
        current: VERSION,
        baseline: UPSTREAM_BASELINE,
      });
      sendJson(response, 200, { ok: true, version: VERSION, ...data });
    });

    register(API + "/icon.png", async (request, response) => {
      const file = new URL("../icon-128.png", import.meta.url);
      const bytes = fs.readFileSync(file);
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      response.end(bytes);
    });

    register(API + "/icon-upstream.png", async (request, response) => {
      const bytes = fs.readFileSync(new URL("../icon-upstream.png", import.meta.url));
      response.writeHead(200, {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400",
      });
      response.end(bytes);
    });

    register(API + "/ui", async (request, response) => {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(renderPage());
    });

    if (typeof scope.effect === "function") {
      scope.effect(() => () => {
        for (const dispose of routes) {
          try { dispose(); } catch { /* ignore */ }
        }
      });
    }
  });

  return () => {
    /* routes and section are disposed by their own effect scopes */
  };
}

export default { name, inject, apply };
