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

const verificationDate = "2026-05-26";
const appPort = Number(process.env.COMPONENT_RECOGNITION_PORT ?? 5207);
const debugPort = Number(process.env.COMPONENT_RECOGNITION_DEBUG_PORT ?? 9347);
const outputDir = path.resolve(
  process.env.COMPONENT_RECOGNITION_OUTPUT_DIR ??
    path.join("..", "docs", "verification", "8.4-component-recognition", verificationDate)
);
const pageUrl = `http://127.0.0.1:${appPort}/__verification/component-recognition`;

const cases = [
  { key: "desktop-light", theme: "light", viewport: { width: 1440, height: 1200, mobile: false } },
  { key: "desktop-dark", theme: "dark", viewport: { width: 1440, height: 1200, mobile: false } },
  { key: "mobile-light", theme: "light", viewport: { width: 390, height: 1000, mobile: true } },
  { key: "mobile-dark", theme: "dark", viewport: { width: 390, height: 1000, mobile: true } },
];

const requiredSections = [
  "metrics",
  "time",
  "tokens",
  "schema-object",
  "audit",
  "workbench",
  "wizard",
];

const messages = [];
const screenshots = [];
const overflows = [];
const apiRequests = [];
const unexpectedApiRequests = [];
let vite;
let chrome;
let client;

try {
  await mkdir(outputDir, { recursive: true });
  vite = await startViteServer({ port: appPort });
  chrome = await startChrome({ debugPort, viewport: cases[0].viewport });
  client = await connectToFirstPage(debugPort);
  await prepareBrowser(client);

  for (const item of cases) {
    await configureViewport(client, item.viewport, item.theme);
    await client.send("Page.navigate", { url: pageUrl });
    await waitForFunction(client, () => document.readyState === "complete");
    await waitForFunction(
      client,
      (sections) =>
        sections.every((section) =>
          document.querySelector(`[data-verification-section='${section}']`)
        ),
      [requiredSections],
      15_000
    );
    await waitForFunction(client, () => !document.body.innerText.includes("loading..."));
    await evaluate(client, async () => {
      await document.fonts?.ready;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
      return true;
    });

    const overflow = await pageOverflow(client);
    overflows.push({ case: item.key, ...overflow });
    if (overflow.overflowX > 1) {
      throw new Error(`${item.key} has horizontal overflow ${overflow.overflowX}px`);
    }

    const image = `${item.key}.png`;
    await captureFullPage(client, path.join(outputDir, image));
    screenshots.push({ case: item.key, mode: "color", path: image });

    const grayImage = `${item.key}-gray.png`;
    await setGrayscale(client, true);
    await captureFullPage(client, path.join(outputDir, grayImage));
    await setGrayscale(client, false);
    screenshots.push({ case: item.key, mode: "grayscale", path: grayImage });
  }

  if (messages.length > 0) {
    throw new Error(`Browser console/runtime messages found:\n${messages.join("\n")}`);
  }
  if (unexpectedApiRequests.length > 0) {
    throw new Error(`Unexpected API requests found:\n${unexpectedApiRequests.join("\n")}`);
  }

  const summary = {
    generated_at: new Date().toISOString(),
    page_url: pageUrl,
    required_sections: requiredSections,
    screenshots,
    overflows,
    messages,
    api_requests: apiRequests,
    unexpected_api_requests: unexpectedApiRequests,
  };
  await writeFile(path.join(outputDir, "summary.json"), JSON.stringify(summary, null, 2), "utf8");
  await writeFile(path.join(outputDir, "verification.md"), verificationMarkdown(summary), "utf8");

  console.log(`component recognition screenshots written to ${outputDir}`);
} finally {
  client?.close();
  await cleanupProcess(chrome?.child);
  await cleanupProcess(vite?.child);
  try {
    await removeProfile(chrome?.profileDir);
  } catch (error) {
    console.warn(`profile cleanup warning: ${error.message}`);
  }
}

async function prepareBrowser(activeClient) {
  activeClient.on("Runtime.exceptionThrown", (event) => {
    messages.push(`runtime: ${event.exceptionDetails.text}`);
  });
  activeClient.on("Runtime.consoleAPICalled", (event) => {
    if (event.type !== "error" && event.type !== "warning") return;
    const text = event.args.map((arg) => arg.value ?? arg.description ?? "").join(" ");
    messages.push(`${event.type}: ${text}`);
  });
  activeClient.on("Fetch.requestPaused", (event) => void fulfillApiRequest(activeClient, event));
  await activeClient.send("Page.enable");
  await activeClient.send("Runtime.enable");
  await activeClient.send("Fetch.enable", {
    patterns: [{ urlPattern: "*://*/api/v1/*", requestStage: "Request" }],
  });
}

async function fulfillApiRequest(activeClient, event) {
  const url = new URL(event.request.url);
  apiRequests.push(`${event.request.method} ${url.pathname}`);
  const isBootstrapAuth = event.request.method === "GET" && url.pathname === "/api/v1/auth/me";
  if (!isBootstrapAuth) {
    unexpectedApiRequests.push(`${event.request.method} ${url.pathname}`);
  }
  const body = isBootstrapAuth
    ? {
        id: 1,
        username: "admin",
        display_name: "Admin",
        email: "admin@example.test",
        is_staff: true,
        is_superuser: true,
        is_employed: true,
        left_at: null,
      }
    : { detail: "unexpected API request during component recognition verification" };
  await activeClient.send("Fetch.fulfillRequest", {
    requestId: event.requestId,
    responseCode: isBootstrapAuth ? 200 : 500,
    responseHeaders: [{ name: "Content-Type", value: "application/json" }],
    body: Buffer.from(JSON.stringify(body)).toString("base64"),
  });
}

async function configureViewport(activeClient, viewport, theme) {
  await activeClient.send("Emulation.setDeviceMetricsOverride", {
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: 1,
    mobile: viewport.mobile,
  });
  await activeClient.send("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-color-scheme", value: theme }],
  });
}

async function captureFullPage(activeClient, filePath) {
  const metrics = await activeClient.send("Page.getLayoutMetrics");
  const contentSize = metrics.cssContentSize;
  const width = Math.ceil(contentSize.width);
  const height = Math.ceil(contentSize.height);
  const screenshot = await activeClient.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width, height, scale: 1 },
  });
  await writeFile(filePath, Buffer.from(screenshot.data, "base64"));
}

async function setGrayscale(activeClient, enabled) {
  await evaluate(activeClient, (value) => {
    document.documentElement.style.filter = value ? "grayscale(1)" : "";
  }, enabled);
}

async function pageOverflow(activeClient) {
  return evaluate(activeClient, () => {
    const root = document.documentElement;
    return {
      scrollWidth: root.scrollWidth,
      clientWidth: root.clientWidth,
      overflowX: Math.max(0, root.scrollWidth - root.clientWidth),
    };
  });
}

function verificationMarkdown(summary) {
  const screenshotRows = summary.screenshots
    .map((item) => `| ${item.case} | ${item.mode} | [${item.path}](./${item.path}) |`)
    .join("\n");
  const overflowRows = summary.overflows
    .map((item) => `| ${item.case} | ${item.scrollWidth} | ${item.clientWidth} | ${item.overflowX}px |`)
    .join("\n");

  return `# 8.4 组件识别截图验收记录

创建日期：${verificationDate}

## 覆盖范围

- MetricGrid / MetricStrip：以 DataMetric card/strip 两种编排覆盖。
- TimePointIndicator / ChronoTimeRail：以 TimePointIndicator 和 TimelineScrubber 覆盖。
- ChangeBadge / StatusBadge / PermissionTag / AuditMarker：覆盖全部关键状态形态。
- SchemaObjectRow：覆盖 dashboard / admin / compact 三种密度。
- AuditTimeline：以 AuditDayGroup / AuditLogRow 覆盖日期组、事件 marker、敏感风险 rail。
- Workbench 三类对象 row：覆盖资料卡、笔记、材料。
- Schema Wizard 首屏与字段设计：覆盖基本信息表单、SchemaIconPicker、SchemaDraftObjectPreview 与 FieldDesigner。

## 截图清单

| 场景 | 类型 | 文件 |
|---|---|---|
${screenshotRows}

## 灰度检查结论

已为 light/dark 与 desktop/mobile 四个场景分别保存灰度截图。样张中关键语义均同时使用形状、符号、线型、位置或结构表达，不只依赖颜色：

- 指标卡使用左侧 ruler、数字井、tone 角标和 drill-down 标识。
- 时间状态使用实心/空心/菱形 pin 与实线/虚线 rail。
- change/status/permission/audit token 使用 glyph bay、流程点、图标铭牌、边框线型和风险 rail。
- SchemaObjectRow、AuditTimeline、Workbench row 与 Wizard 字段行使用固定列位、对象 icon、field port、marker bay 与状态 token。

灰度截图用于人工视觉验收；本脚本只负责生成证据和检查横向溢出、console/runtime 消息。

## 横向溢出检查

| 场景 | scrollWidth | clientWidth | overflowX |
|---|---:|---:|---:|
${overflowRows}

## 自动检查结果

- console error/warn：${summary.messages.length}
- runtime exception：${summary.messages.filter((item) => item.startsWith("runtime:")).length}
- required sections：${summary.required_sections.join(", ")}
- API 请求白名单：仅允许启动阶段 \`GET /api/v1/auth/me\`，业务组件样张不读取后端业务数据。
- 意外 API 请求：${summary.unexpected_api_requests.length}

## 仍需人工判断

- 灰度图下各组件的语义辨识度需要最终人工目视确认。
- 样张使用固定 fixtures，真实业务数据极长字段、极大数量与稀有状态仍需后续页面级抽查。
`;
}
