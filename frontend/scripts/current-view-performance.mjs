import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  cleanupProcess,
  connectToFirstPage,
  evaluate,
  removeProfile,
  startChrome,
  startViteServer,
  waitForFunction,
} from "./smoke/cdp-client.mjs";
import { createPerformanceFixture } from "./smoke/current-view-performance-fixtures.mjs";

const appPort = Number(process.env.CURRENT_VIEW_PERF_PORT ?? 5199);
const debugPort = Number(process.env.CURRENT_VIEW_PERF_DEBUG_PORT ?? 9334);
const pageUrl = `http://127.0.0.1:${appPort}/schemas/77/records`;
const outputDir = path.resolve(".codex-tmp");
const scenarios = [
  { label: "1k-paged", rowCount: 1_000, returnedRows: 200, fieldCount: 16, changeSetCount: 12, bigEntryCount: 500, hugeEntryCount: 2_000 },
  { label: "10k-paged", rowCount: 10_000, returnedRows: 200, fieldCount: 16, changeSetCount: 12, bigEntryCount: 500, hugeEntryCount: 2_000 },
  { label: "10k-full-grid", rowCount: 10_000, returnedRows: 10_000, fieldCount: 16, changeSetCount: 12, bigEntryCount: 500, hugeEntryCount: 2_000 },
];

let vite;
let chrome;
let client;

try {
  vite = await startViteServer({ port: appPort });
  chrome = await startChrome({ debugPort, viewport: { width: 1440, height: 960 } });
  client = await connectToFirstPage(debugPort);
  await warmUpClient(client);
  const results = [];
  for (const scenario of scenarios) {
    results.push(await runScenario(client, scenario));
  }
  const report = {
    generatedAt: new Date().toISOString(),
    scenarios: results,
    notes: [
      "paged 场景模拟真实 UI 默认分页，10k 总量不会一次性进入主表 DOM。",
      "10k-full-grid 场景刻意让 fixture 返回 10k 行，用于单独压测前端虚拟列表和 TanStack row model。",
    ],
  };
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, "current-view-performance-latest.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  printSummary(results, reportPath);
} finally {
  client?.close();
  await cleanupProcess(chrome?.child);
  await cleanupProcess(vite?.child);
  await removeProfile(chrome?.profileDir);
}

async function runScenario(client, scenario) {
  const fixture = createPerformanceFixture(scenario);
  const errors = [];
  await prepareBrowser(client, fixture, errors);
  const startedAt = performance.now();
  await client.send("Page.navigate", { url: `${pageUrl}?perf=${scenario.label}` });
  await waitForText(client, `性能资产台账 ${scenario.label}`, 60_000);
  const gridReady = await waitForGrid(client, scenario.returnedRows, 60_000);
  const firstScreenMs = round(performance.now() - startedAt);
  const scroll = await measureGridScroll(client);
  const detail500Ms = await measureDetail(client, 501, "500 条大批次 diff");
  const fieldFocusMs = await measureFieldFocus(client);
  const detail2000Ms = await measureDetail(client, 502, "2000 条超大批次 diff");
  const compareMs = await measureCompare(client);
  if (errors.length > 0) throw new Error(`${scenario.label} browser errors:\n${errors.join("\n")}`);
  return {
    label: scenario.label,
    rowCount: scenario.rowCount,
    returnedRows: scenario.returnedRows,
    fieldCount: scenario.fieldCount,
    bigEntryCount: scenario.bigEntryCount,
    hugeEntryCount: scenario.hugeEntryCount,
    firstScreenMs,
    gridReady,
    mainTableScrollMs: scroll.durationMs,
    renderedRowsAfterScroll: scroll.renderedRows,
    detail500Ms,
    fieldAggregationFilterMs: fieldFocusMs,
    detail2000Ms,
    compareTwoLargeBatchesMs: compareMs,
    maxApiFixtureMs: Math.max(...fixture.apiCalls.map((call) => call.durationMs)),
    apiCallCount: fixture.apiCalls.length,
  };
}

async function warmUpClient(client) {
  const fixture = createPerformanceFixture({
    label: "warmup",
    rowCount: 100,
    returnedRows: 100,
    fieldCount: 8,
    changeSetCount: 4,
    bigEntryCount: 40,
    hugeEntryCount: 80,
  });
  const errors = [];
  await prepareBrowser(client, fixture, errors);
  await client.send("Page.navigate", { url: `${pageUrl}?perf=warmup` });
  await waitForText(client, "性能资产台账 warmup", 60_000);
  await waitForGrid(client, 100, 60_000);
  if (errors.length > 0) throw new Error(`warmup browser errors:\n${errors.join("\n")}`);
}

async function prepareBrowser(client, fixture, errors) {
  client.handlers?.clear?.();
  client.on("Runtime.exceptionThrown", (event) => errors.push(event.exceptionDetails.text));
  client.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") errors.push(event.args.map((arg) => arg.value).join(" "));
  });
  client.on("Fetch.requestPaused", (event) => void fulfillApiRequest(client, fixture, event));
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Fetch.disable").catch(() => undefined);
  await client.send("Fetch.enable", {
    patterns: [{ urlPattern: "*://*/api/v1/*", requestStage: "Request" }],
  });
}

async function fulfillApiRequest(client, fixture, event) {
  const response = await fixture.handleRequest(event.request.url, event.request.method);
  await client.send("Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: response.status,
    responseHeaders: response.headers,
    body: Buffer.from(JSON.stringify(response.body)).toString("base64"),
  });
}

async function waitForText(client, text, timeout) {
  await waitForFunction(client, (expected) => document.body.innerText.includes(expected), [text], timeout);
}

async function waitForGrid(client, expectedRows, timeout) {
  return waitForFunction(client, (rows) => {
    const node = document.querySelector("[data-virtualized='true']");
    if (!node) return null;
    const totalRows = Number(node.getAttribute("data-total-rows"));
    const renderedRows = Number(node.getAttribute("data-rendered-rows"));
    if (totalRows !== rows || renderedRows <= 0) return null;
    return { totalRows, renderedRows };
  }, [expectedRows], timeout);
}

async function measureGridScroll(client) {
  return evaluate(client, async () => {
    const node = document.querySelector("[data-virtualized='true']");
    const startedAt = performance.now();
    node.scrollTo({ top: node.scrollHeight, behavior: "auto" });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return {
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      renderedRows: Number(node.getAttribute("data-rendered-rows")),
    };
  });
}

async function measureDetail(client, id, expectedText) {
  await clickTab(client, "批次");
  const startedAt = performance.now();
  await clickByAria(client, `查看批次 #${id} 明细`);
  await waitForText(client, expectedText, 60_000);
  await waitForText(client, "字段聚合", 60_000);
  return round(performance.now() - startedAt);
}

async function measureFieldFocus(client) {
  const startedAt = performance.now();
  const clicked = await evaluate(client, () => {
    const section = [...document.querySelectorAll("section")]
      .find((item) => item.innerText.includes("字段聚合"));
    const button = [...(section?.querySelectorAll("button") ?? [])]
      .find((item) => item.innerText.includes("状态") && item.innerText.includes("status"));
    if (!button) return false;
    button.click();
    return true;
  });
  if (!clicked) throw new Error("Could not click status field aggregate");
  await waitForFunction(client, () => {
    const labels = [...document.querySelectorAll("#change-inspector-panel-detail button[aria-label^='定位字段']")]
      .map((item) => item.getAttribute("aria-label"));
    return labels.length > 0 && labels.every((label) => label === "定位字段 状态");
  }, [], 60_000);
  return round(performance.now() - startedAt);
}

async function measureCompare(client) {
  await clickTab(client, "批次");
  const startedAt = performance.now();
  await clickByAria(client, "设为对比 A：批次 #501");
  await clickByAria(client, "设为对比 B：批次 #502");
  await waitForText(client, "操作差异", 60_000);
  await waitForText(client, "字段分布差异", 60_000);
  return round(performance.now() - startedAt);
}

async function clickByAria(client, label) {
  const ok = await evaluate(client, (target) => {
    const element = [...document.querySelectorAll("button,input,select,[role='tab']")]
      .find((item) => item.getAttribute("aria-label") === target);
    if (!element) return false;
    element.click();
    return true;
  }, label);
  if (!ok) throw new Error(`Could not click aria-label: ${label}`);
}

async function clickTab(client, label) {
  const ok = await evaluate(client, (text) => {
    const tab = [...document.querySelectorAll("[role='tab']")]
      .find((item) => item.textContent.trim() === text);
    if (!tab) return false;
    tab.click();
    return true;
  }, label);
  if (!ok) throw new Error(`Could not click tab: ${label}`);
}

function printSummary(results, reportPath) {
  console.log(`current-view performance report: ${reportPath}`);
  for (const item of results) {
    console.log([
      item.label,
      `first=${item.firstScreenMs}ms`,
      `scroll=${item.mainTableScrollMs}ms`,
      `detail500=${item.detail500Ms}ms`,
      `detail2000=${item.detail2000Ms}ms`,
      `compare=${item.compareTwoLargeBatchesMs}ms`,
    ].join(" | "));
  }
}

function round(value) {
  return Math.round(value * 10) / 10;
}
