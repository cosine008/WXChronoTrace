import {
  cleanupProcess,
  connectToFirstPage,
  evaluate,
  removeProfile,
  startChrome,
  startViteServer,
  waitForFunction,
} from "./smoke/cdp-client.mjs";
import { apiCalls, handleCurrentViewApiRequest } from "./smoke/current-view-fixtures.mjs";

const appPort = Number(process.env.CURRENT_VIEW_SMOKE_PORT ?? 5198);
const debugPort = Number(process.env.CURRENT_VIEW_SMOKE_DEBUG_PORT ?? 9333);
const pageUrl = `http://127.0.0.1:${appPort}/schemas/42/records`;
const errors = [];

let vite;
let chrome;
let client;

try {
  vite = await startViteServer({ port: appPort });
  chrome = await startChrome({ debugPort, viewport: { width: 1280, height: 900 } });
  client = await connectToFirstPage(debugPort);
  await prepareBrowser(client);
  await client.send("Page.navigate", { url: pageUrl });
  await waitForText(client, "固定资产台账");
  await assertPageBasics(client);
  await assertColumnSettingsClosesOnOutsideClick(client);
  await assertFilterChips(client);
  await assertDetailFieldAggregation(client);
  await assertDetailPaneScrollsToBottom(client);
  await assertCompareTab(client);
  await assertNarrowViewport(client);
  assertNoBrowserErrors();
  console.log("current-view smoke passed");
} finally {
  client?.close();
  await cleanupProcess(chrome?.child);
  await cleanupProcess(vite?.child);
  await removeProfile(chrome?.profileDir);
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
  const response = await handleCurrentViewApiRequest(event.request.url, event.request.method);
  await client.send("Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: response.status,
    responseHeaders: response.headers,
    body: Buffer.from(JSON.stringify(response.body)).toString("base64"),
  });
}

async function assertPageBasics(client) {
  await assertText(client, "变更检查器");
  await assertText(client, "A-001");
  const grid = await evaluate(client, () => {
    const node = document.querySelector("[data-virtualized='true']");
    return node
      ? {
          totalRows: Number(node.getAttribute("data-total-rows")),
          renderedRows: Number(node.getAttribute("data-rendered-rows")),
        }
      : null;
  });
  if (!grid || grid.totalRows < 1 || grid.renderedRows < 1) {
    throw new Error("Current grid did not render virtualized rows");
  }
  await waitForText(client, "筛选总数");
  await waitForText(client, "当前快照全量");
  await waitForText(client, "导出快照");
  await waitUntil(() =>
    apiCalls.some((call) =>
      call.path === "/schemas/42/stats/summary" &&
      call.params.ordering === "business_code" &&
      call.params.page === undefined &&
      call.params.page_size === undefined
    )
  );
  try {
    await waitUntil(() =>
      apiCalls.some((call) =>
        call.path === "/schemas/42/stats/distribution" &&
        call.params.field === "visibility" &&
        call.params.page === undefined &&
        call.params.page_size === undefined
      )
    );
  } catch (error) {
    const distributionCalls = apiCalls.filter(
      (call) => call.path === "/schemas/42/stats/distribution"
    );
    throw new Error(
      `Expected visible distribution field request, got ${JSON.stringify(distributionCalls)}`,
      { cause: error }
    );
  }
}

async function assertColumnSettingsClosesOnOutsideClick(client) {
  const openResult = await evaluate(client, () => {
    const details = document.querySelector("details");
    const summary = details?.querySelector("summary");
    if (!details || !summary) return { ok: false, reason: "missing column settings trigger" };

    summary.click();
    return { ok: true, reason: "" };
  });
  if (!openResult.ok) {
    throw new Error(`Column settings outside click failed: ${openResult.reason}`);
  }
  await waitForFunction(client, () => document.querySelector("details")?.open);

  const closeResult = await evaluate(client, () => {
    const details = document.querySelector("details");
    const grid = document.querySelector("[data-virtualized='true']");
    if (!details || !grid) return { ok: false, reason: "missing elements" };

    const ownerToggle = [...details.querySelectorAll("button")]
      .find((button) => button.textContent?.includes("owner"));
    if (!ownerToggle) return { ok: false, reason: "missing owner column toggle" };

    ownerToggle.click();
    ownerToggle.click();
    grid.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    grid.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    return { ok: true, reason: "" };
  });
  if (!closeResult.ok) {
    throw new Error(`Column settings outside click failed: ${closeResult.reason}`);
  }

  try {
    await waitForFunction(client, () => !document.querySelector("details")?.open, [], 2_000);
  } catch {
    throw new Error("Column settings outside click failed: column settings stayed open");
  }
}

async function assertFilterChips(client) {
  await clickByAria(client, "展开变更筛选");
  await selectByAria(client, "批次状态", "applied");
  await selectByAria(client, "创建者", "mine");
  await fillByAria(client, "创建日期起", "2026-05-01");
  await fillByAria(client, "创建日期止", "2026-05-21");
  await assertText(client, "状态：已生效");
  await assertText(client, "创建者：我");
  await assertText(client, "起始：2026-05-01");
  await assertText(client, "截止：2026-05-21");
  await waitUntil(() =>
    apiCalls.some((call) =>
      call.path === "/schemas/42/changesets" &&
      call.params.status === "applied" &&
      call.params.created_by === "7" &&
      call.params.created_from === "2026-05-01" &&
      call.params.created_to === "2026-05-21"
    )
  );
  await clickByAria(client, "清除筛选：状态：已生效");
  await waitForFunction(client, () => !document.body.innerText.includes("状态：已生效"));
  await assertText(client, "创建者：我");
  await assertText(client, "起始：2026-05-01");
  await assertText(client, "截止：2026-05-21");
}

async function assertDetailFieldAggregation(client) {
  await clickByAria(client, "查看批次 #301 明细");
  await waitForText(client, "字段聚合");
  await assertText(client, "5月资产状态批量更新");
  const before = await fieldLocateLabels(client);
  assertIncludes(before, "定位字段 状态");
  assertIncludes(before, "定位字段 负责人");
  await clickByAria(client, "定位实体 A-112");
  await waitUntil(() =>
    apiCalls.some((call) =>
      call.path === "/schemas/42/records/locate" &&
      call.params.entity_id === "612" &&
      call.params.page_size === "100"
    )
  );
  await waitForFunction(client, () => {
    const grid = document.querySelector("[data-virtualized='true']");
    return grid?.innerText.includes("A-112") && document.body.innerText.includes("2 / 2");
  });
  await clickFieldAggregate(client, "状态", "status");
  await waitForFunction(client, () => {
    const labels = [...document.querySelectorAll("#change-inspector-panel-detail button[aria-label^='定位字段']")]
      .map((item) => item.getAttribute("aria-label"));
    return labels.includes("定位字段 状态") && !labels.includes("定位字段 负责人");
  });
}

async function assertDetailPaneScrollsToBottom(client) {
  const result = await evaluate(client, () => {
    const pane = document.querySelector("#change-inspector-panel-detail > div");
    const panel = document.querySelector("#change-inspector-panel-detail");
    if (!(pane instanceof HTMLElement)) {
      return { ok: false, reason: "missing detail scroll pane" };
    }
    const maxTop = pane.scrollHeight - pane.clientHeight;
    pane.scrollTop = maxTop;
    return {
      ok: maxTop > 0 && pane.scrollTop >= maxTop - 1,
      reason: JSON.stringify({
        maxTop,
        paneClientHeight: pane.clientHeight,
        paneScrollHeight: pane.scrollHeight,
        paneScrollTop: pane.scrollTop,
        panelClientHeight: panel instanceof HTMLElement ? panel.clientHeight : null,
      }),
    };
  });
  if (!result.ok) {
    throw new Error(`Detail pane could not scroll to bottom: ${result.reason}`);
  }
}

async function assertCompareTab(client) {
  await clickTab(client, "批次");
  await clickByAria(client, "设为对比 A：批次 #301");
  await clickByAria(client, "设为对比 B：批次 #302");
  await waitForText(client, "批次对比");
  await waitForText(client, "操作差异");
  await waitForText(client, "字段分布差异");
  await waitUntil(() =>
    apiCalls.some((call) =>
      call.path === "/schemas/42/changesets/compare" &&
      call.params.left === "301" &&
      call.params.right === "302"
    )
  );
}

async function assertNarrowViewport(client) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 900,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.navigate", { url: pageUrl });
  await waitForText(client, "固定资产台账");
  const overflow = await waitForFunction(client, () => {
    const root = document.documentElement;
    const body = document.body;
    return {
      rootClient: root.clientWidth,
      rootScroll: root.scrollWidth,
      bodyScroll: body.scrollWidth,
      windowWidth: window.innerWidth,
      ok: root.scrollWidth <= root.clientWidth + 1 && body.scrollWidth <= window.innerWidth + 1,
    };
  });
  if (!overflow.ok) throw new Error(`390px viewport overflow: ${JSON.stringify(overflow)}`);
}

async function waitForText(client, text) {
  await waitForFunction(client, (expected) => document.body.innerText.includes(expected), [text]);
}

async function assertText(client, text) {
  const found = await evaluate(client, (expected) => document.body.innerText.includes(expected), text);
  if (!found) throw new Error(`Expected page text: ${text}`);
}

function assertNoBrowserErrors() {
  if (errors.length > 0) throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

async function clickByAria(client, label) {
  const ok = await evaluate(client, clickElementByAria, label);
  if (!ok) throw new Error(`Could not click aria-label: ${label}`);
}

async function selectByAria(client, label, value) {
  const ok = await evaluate(client, setControlValue, label, value);
  if (!ok) throw new Error(`Could not select ${label}=${value}`);
}

async function fillByAria(client, label, value) {
  const ok = await evaluate(client, setControlValue, label, value);
  if (!ok) throw new Error(`Could not fill ${label}=${value}`);
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

async function clickFieldAggregate(client, label, key) {
  const ok = await evaluate(client, (fieldLabel, fieldKey) => {
    const section = [...document.querySelectorAll("section")]
      .find((item) => item.innerText.includes("字段聚合"));
    const button = [...(section?.querySelectorAll("button") ?? [])]
      .find((item) => item.innerText.includes(fieldLabel) && item.innerText.includes(fieldKey));
    if (!button) return false;
    button.click();
    return true;
  }, label, key);
  if (!ok) throw new Error(`Could not click field aggregate: ${label}/${key}`);
}

async function fieldLocateLabels(client) {
  return evaluate(client, () =>
    [...document.querySelectorAll("#change-inspector-panel-detail button[aria-label^='定位字段']")]
      .map((item) => item.getAttribute("aria-label"))
  );
}

function clickElementByAria(label) {
  const element = [...document.querySelectorAll("button,input,select,[role='tab']")]
    .find((item) => item.getAttribute("aria-label") === label);
  if (!element) return false;
  element.click();
  return true;
}

function setControlValue(label, value) {
  const element = [...document.querySelectorAll("input,select")]
    .find((item) => item.getAttribute("aria-label") === label);
  if (!element) return false;
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function assertIncludes(values, expected) {
  if (!values.includes(expected)) {
    throw new Error(`Expected ${expected} in ${JSON.stringify(values)}`);
  }
}

async function waitUntil(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for Node-side condition");
}
