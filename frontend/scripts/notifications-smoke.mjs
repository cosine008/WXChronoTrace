import {
  cleanupProcess,
  connectToFirstPage,
  evaluate,
  removeProfile,
  startChrome,
  startViteServer,
  waitForFunction,
} from "./smoke/cdp-client.mjs";
import { handleCurrentViewApiRequest } from "./smoke/current-view-fixtures.mjs";

const appPort = Number(process.env.NOTIFICATIONS_SMOKE_PORT ?? 5199);
const debugPort = Number(process.env.NOTIFICATIONS_SMOKE_DEBUG_PORT ?? 9334);
const pageUrl = `http://127.0.0.1:${appPort}/schemas/42/records`;
const errors = [];
const apiCalls = [];

let vite;
let chrome;
let client;

async function main() {
  try {
    vite = await startViteServer({ port: appPort });
    chrome = await startChrome({ debugPort, viewport: { width: 1280, height: 900 } });
    client = await connectToFirstPage(debugPort);
    await prepareBrowser(client);
    await client.send("Page.navigate", { url: pageUrl });
    await waitForText(client, "固定资产台账");
    await assertNotificationBellAndDrawer(client);
    await assertNotificationNavigation(client);
    assertNoBrowserErrors();
    console.log("notifications smoke passed");
  } finally {
    client?.close();
    await cleanupProcess(chrome?.child);
    await cleanupProcess(vite?.child);
    await removeProfile(chrome?.profileDir);
  }
}

async function prepareBrowser(client) {
  client.on("Runtime.exceptionThrown", (event) => errors.push(event.exceptionDetails.text));
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") errors.push(event.args.map((arg) => arg.value).join(" "));
  });
  client.on("Fetch.requestPaused", (event) => void fulfillApiRequest(client, event));
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: "*://*/api/v1/*", requestStage: "Request" }],
  });
}

async function fulfillApiRequest(client, event) {
  const response = await handleNotificationSmokeRequest(event.request.url, event.request.method);
  await client.send("Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: response.status,
    responseHeaders: response.headers,
    body: Buffer.from(JSON.stringify(response.body)).toString("base64"),
  });
}

async function handleNotificationSmokeRequest(url, method) {
  const requestUrl = new URL(url);
  const path = stripApiPrefix(requestUrl.pathname);
  apiCalls.push({ path, method, params: Object.fromEntries(requestUrl.searchParams) });

  if (method === "GET" && path === "/auth/csrf") {
    return {
      status: 200,
      headers: [
        { name: "content-type", value: "application/json; charset=utf-8" },
        { name: "set-cookie", value: "csrftoken=notification-smoke-token; Path=/; SameSite=Lax" },
      ],
      body: { ok: true },
    };
  }
  if (method === "GET" && path === "/notifications/summary") {
    return jsonResponse(200, {
      unread_count: unreadNotifications().length,
      latest_created_at: "2026-06-05T10:00:00Z",
    });
  }
  if (method === "GET" && path === "/notifications") {
    const status = requestUrl.searchParams.get("status") ?? "all";
    const results = status === "unread" ? unreadNotifications() : notifications;
    return jsonResponse(200, {
      count: results.length,
      page: 1,
      page_size: 50,
      total_pages: 1,
      results,
    });
  }
  const readId = path.match(/^\/notifications\/(\d+)\/read$/)?.[1];
  if (method === "POST" && readId) {
    const notification = notifications.find((item) => item.id === Number(readId));
    if (!notification) return jsonResponse(404, { detail: "notification not found" });
    notification.read_at = "2026-06-05T10:01:00Z";
    return jsonResponse(200, notification);
  }
  const archiveId = path.match(/^\/notifications\/(\d+)\/archive$/)?.[1];
  if (method === "POST" && archiveId) {
    const notification = notifications.find((item) => item.id === Number(archiveId));
    if (!notification) return jsonResponse(404, { detail: "notification not found" });
    notification.read_at ??= "2026-06-05T10:01:00Z";
    notification.archived_at = "2026-06-05T10:02:00Z";
    return jsonResponse(200, notification);
  }
  if (method === "POST" && path === "/notifications/mark-read") {
    const updated = unreadNotifications().length;
    for (const notification of notifications) {
      notification.read_at ??= "2026-06-05T10:01:00Z";
    }
    return jsonResponse(200, { updated_count: updated });
  }
  if (method === "GET" && path === "/comments/summary") {
    return jsonResponse(200, {
      schema_id: 42,
      entities: {
        501: {
          row: { open_count: 1, total_count: 1, unread_count: 1 },
          cells: {},
        },
      },
    });
  }
  if (method === "GET" && path === "/comments/threads") {
    return jsonResponse(200, { count: 1, results: [commentThread] });
  }
  if (method === "POST" && path === "/comments/threads/77/read") {
    commentThread.unread = false;
    return jsonResponse(200, commentThread);
  }
  return handleCurrentViewApiRequest(url, method);
}

async function assertNotificationBellAndDrawer(client) {
  await waitForFunction(client, () => {
    const button = document.querySelector("button[title='通知']");
    return button?.textContent?.includes("2");
  });
  await clickByTitle(client, "通知");
  await waitForText(client, "你被提及");
  await waitForText(client, "导出已完成");
  await waitForText(client, "未读");
  await clickByText(client, "未读");
  await waitForText(client, "你被提及");
}

async function assertNotificationNavigation(client) {
  await clickByText(client, "你被提及");
  await waitUntil(() =>
    apiCalls.some((call) => call.method === "POST" && call.path === "/notifications/101/read")
  );
  await waitForFunction(client, () =>
    window.location.pathname === "/schemas/42/records" &&
    window.location.search.includes("comment_thread=77") &&
    window.location.search.includes("comment_anchor=row") &&
    window.location.search.includes("entity_id=501")
  );
  await waitForText(client, "评论");
  await waitForText(client, "请复核资产台账。");
  await waitUntil(() =>
    apiCalls.some((call) => call.method === "POST" && call.path === "/comments/threads/77/read")
  );
}

async function waitForText(client, text) {
  await waitForFunction(client, (expected) => document.body.innerText.includes(expected), [text]);
}

async function clickByTitle(client, title) {
  const ok = await evaluate(client, (expected) => {
    const button = document.querySelector(`button[title='${expected}']`);
    if (!button) return false;
    button.click();
    return true;
  }, title);
  if (!ok) throw new Error(`Could not click title: ${title}`);
}

async function clickByText(client, text) {
  const ok = await evaluate(client, (expected) => {
    const button = [...document.querySelectorAll("button")]
      .find((item) => item.innerText.includes(expected));
    if (!button) return false;
    button.click();
    return true;
  }, text);
  if (!ok) throw new Error(`Could not click text: ${text}`);
}

function assertNoBrowserErrors() {
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

async function waitUntil(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for Node-side condition. Recent API calls: ${JSON.stringify(apiCalls.slice(-10))}`);
}

function unreadNotifications() {
  return notifications.filter((item) => !item.read_at && !item.archived_at);
}

const actor = { id: 8, username: "reviewer", display_name: "reviewer" };

const notifications = [
  {
    id: 101,
    type: "comment_mention",
    severity: "info",
    title: "你被提及",
    body: "reviewer 在评论中提到了你：固定资产台账",
    target_kind: "comment_thread",
    target_id: "77",
    target_url: "/schemas/42/records?comment_thread=77&comment_anchor=row&entity_id=501",
    payload: { schema_id: 42, thread_id: 77, comment_id: 301 },
    actor,
    read_at: null,
    archived_at: null,
    created_at: "2026-06-05T10:00:00Z",
    expires_at: null,
  },
  {
    id: 102,
    type: "export_finished",
    severity: "success",
    title: "导出已完成",
    body: "asset_register.xlsx 已生成，可以下载。",
    target_kind: "export_job",
    target_id: "job-1",
    target_url: "/schemas/42/records/export?job=job-1",
    payload: { schema_id: 42, job_code: "job-1" },
    actor: null,
    read_at: null,
    archived_at: null,
    created_at: "2026-06-05T09:59:00Z",
    expires_at: null,
  },
];

const commentThread = {
  id: 77,
  schema_id: 42,
  anchor_type: "row",
  entity_id: 501,
  field_key: "",
  status: "open",
  created_by_id: 8,
  created_by_username: "reviewer",
  created_at: "2026-06-05T10:00:00Z",
  updated_at: "2026-06-05T10:00:00Z",
  last_activity_at: "2026-06-05T10:00:00Z",
  resolved_by_id: null,
  resolved_by_username: "",
  resolved_at: null,
  comment_count: 1,
  context: {
    created_at_context_date: "2026-05-21",
    record_id_at_creation: 9001,
    valid_from: "2026-05-01",
    valid_to: null,
    value_snapshot: null,
  },
  comments: [
    {
      id: 301,
      body: "请复核资产台账。",
      body_format: "plain",
      created_by_id: 8,
      created_by_username: "reviewer",
      created_at: "2026-06-05T10:00:00Z",
      edited_at: null,
      deleted_at: null,
      is_system: false,
      mentions: [{ user_id: 7, username: "admin" }],
    },
  ],
  unread: true,
};

await main();

function stripApiPrefix(path) {
  return path.replace(/^\/api\/v1/, "").replace(/\/$/, "");
}

function jsonResponse(status, body) {
  return {
    status,
    headers: [{ name: "content-type", value: "application/json; charset=utf-8" }],
    body,
  };
}
