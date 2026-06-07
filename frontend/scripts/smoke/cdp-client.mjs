import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT = 15_000;

export class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.ws.addEventListener("message", (event) => this.handleMessage(event));
  }

  async ready() {
    if (this.ws.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  close() {
    this.ws.close();
  }

  handleMessage(event) {
    const message = JSON.parse(event.data);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
      return;
    }
    for (const handler of this.handlers.get(message.method) ?? []) {
      handler(message.params);
    }
  }
}

export async function startViteServer({ port }) {
  const args = ["exec", "vite", "--host", "127.0.0.1", "--port", String(port), "--strictPort"];
  const child = spawnPackage("pnpm", args, {
    cwd: process.cwd(),
    env: { ...process.env, BROWSER: "none" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = collectLogs(child);
  await waitForHttp(`http://127.0.0.1:${port}/`, DEFAULT_TIMEOUT, logs);
  return { child, logs };
}

export async function startChrome({ debugPort, viewport }) {
  const executable = chromeExecutable();
  const profileDir = await mkdtemp(path.join(tmpdir(), "chronotrace-smoke-"));
  const args = [
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    `--window-size=${viewport.width},${viewport.height}`,
    "about:blank",
  ];
  const child = spawn(executable, args, { stdio: ["ignore", "pipe", "pipe"] });
  const logs = collectLogs(child);
  await waitForHttp(`http://127.0.0.1:${debugPort}/json/list`, DEFAULT_TIMEOUT, logs);
  return { child, logs, profileDir };
}

export async function connectToFirstPage(debugPort) {
  const targets = await fetchJson(`http://127.0.0.1:${debugPort}/json/list`);
  const page =
    targets.find((item) => item.type === "page" && item.url === "about:blank") ??
    targets.find((item) => item.type === "page");
  if (!page?.webSocketDebuggerUrl) throw new Error("Chrome page target not found");
  const client = new CdpClient(page.webSocketDebuggerUrl);
  await client.ready();
  return client;
}

export async function evaluate(client, fn, ...args) {
  const expression = `(${fn})(...${JSON.stringify(args)})`;
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Runtime.evaluate failed");
  }
  return result.result.value;
}

export async function waitForFunction(client, fn, args = [], timeout = DEFAULT_TIMEOUT) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await evaluate(client, fn, ...args);
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw lastError ?? new Error("Timed out waiting for browser condition");
}

export async function cleanupProcess(child) {
  if (!child || child.killed) return;
  if (process.platform === "win32") {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.on("exit", resolve);
      killer.on("error", resolve);
    });
    return;
  }
  child.kill("SIGTERM");
}

export async function removeProfile(profileDir) {
  if (profileDir) await rm(profileDir, { recursive: true, force: true });
}

function collectLogs(child) {
  const logs = [];
  child.stdout?.on("data", (data) => logs.push(String(data)));
  child.stderr?.on("data", (data) => logs.push(String(data)));
  return logs;
}

function spawnPackage(command, args, options) {
  if (process.platform !== "win32") return spawn(command, args, options);
  return spawn("cmd.exe", ["/d", "/s", "/c", [command, ...args].join(" ")], options);
}

async function waitForHttp(url, timeout, logs) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Timed out waiting for ${url}\n${logs.join("")}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return response.json();
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "google-chrome",
    "chromium",
  ].filter(Boolean);
  return candidates[0];
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
