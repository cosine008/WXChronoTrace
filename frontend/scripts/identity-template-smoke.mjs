import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cleanupProcess,
  connectToFirstPage,
  evaluate,
  removeProfile,
  startChrome,
  waitForFunction,
} from "./smoke/cdp-client.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const backendRoot = path.resolve(frontendRoot, "..", "backend");
const appUrl = process.env.IDENTITY_TEMPLATE_SMOKE_APP_URL ?? "http://127.0.0.1:5173";
const smokeUser = process.env.IDENTITY_TEMPLATE_SMOKE_USER ?? "identity_smoke_admin";
const smokePassword = process.env.IDENTITY_TEMPLATE_SMOKE_PASSWORD ?? "smoke-admin-123";
const errors = [];

let chrome;
let client;

try {
  await waitForHttp(`${appUrl}/`, "frontend app");
  await waitForHttp(`${appUrl}/api/v1/auth/csrf`, "backend API");
  const fixture = await prepareFixture(smokeUser, smokePassword);
  const debugPort =
    Number(process.env.IDENTITY_TEMPLATE_SMOKE_DEBUG_PORT) || (await findAvailablePort(9444));

  chrome = await startChrome({ debugPort, viewport: { width: 1280, height: 900 } });
  client = await connectToFirstPage(debugPort);
  await prepareBrowser(client);
  await login(client, smokeUser, smokePassword);

  await openSettings(client, fixture);
  await saveTemplate(client, fixture.schemaId, fixture.normalTemplate);
  await assertSettingsPreview(client, fixture.normalDisplay);
  await assertCurrentViewDisplay(client, fixture, fixture.normalDisplay);
  await assertCurrentExport(client, fixture, fixture.normalDisplay);
  await assertImportPreview(client, fixture, fixture.normalDisplay);
  await openSettings(client, fixture);
  await saveTemplate(client, fixture.schemaId, fixture.sensitiveTemplate);
  await assertSensitiveTemplateMasking(client, fixture);
  await clearTemplate(client, fixture);
  await assertNoBrowserErrors();

  console.log("identity-template smoke passed");
} finally {
  client?.close();
  await cleanupProcess(chrome?.child);
  await removeChromeProfile(chrome?.profileDir);
}

async function prepareFixture(username, password) {
  const code = `
import base64
import datetime as dt
import json
from io import BytesIO

from django.contrib.auth.models import User
from django.utils import timezone
from openpyxl import Workbook

from apps.changesets.models import ChangeEntry, ChangeSet
from apps.schemas.models import DataSchema, SchemaVersion
from apps.temporal.models import Entity, TemporalRecord

username = ${JSON.stringify(username)}
password = ${JSON.stringify(password)}
schema_code = "identity_template_smoke"
record_payload = {
    "employee_no": "E001",
    "name": "张伟",
    "id_no": "110105199001011234",
    "department": "运营",
}
fields = [
    {"key": "employee_no", "label": "员工号", "type": "text", "required": True, "introduced_in_version": 1},
    {"key": "name", "label": "姓名", "type": "text", "introduced_in_version": 1},
    {
        "key": "id_no",
        "label": "身份证号",
        "type": "text",
        "sensitive": True,
        "masking": {"mode": "partial", "visible_roles": ["admin", "owner"]},
        "introduced_in_version": 1,
    },
    {"key": "department", "label": "部门", "type": "text", "introduced_in_version": 1},
]

user, _ = User.objects.get_or_create(username=username)
user.set_password(password)
user.is_staff = True
user.is_superuser = True
user.is_active = True
user.save(update_fields=["password", "is_staff", "is_superuser", "is_active"])

schema, created = DataSchema.objects.get_or_create(
    schema_code=schema_code,
    defaults={
        "name": "实体展示模板 Smoke",
        "description": "P3.1 identity display template smoke fixture",
        "icon": "users",
        "temporal_mode": DataSchema.TemporalMode.CONTINUOUS,
        "period_unit": None,
        "identity_field_key": "employee_no",
        "fields_config": fields,
        "current_version": 1,
        "owner": user,
        "visibility": DataSchema.Visibility.SHARED,
        "approval_required": False,
        "created_by": user,
    },
)
schema.name = "实体展示模板 Smoke"
schema.description = "P3.1 identity display template smoke fixture"
schema.icon = "users"
schema.temporal_mode = DataSchema.TemporalMode.CONTINUOUS
schema.period_unit = None
schema.identity_field_key = "employee_no"
schema.fields_config = fields
schema.owner = user
schema.visibility = DataSchema.Visibility.SHARED
schema.approval_required = False
schema.created_by = user
if created or schema.current_version < 1:
    schema.current_version = 1
schema.save()

SchemaVersion.objects.get_or_create(
    schema=schema,
    version=schema.current_version,
    defaults={"fields_config": schema.fields_config, "changelog": "smoke fixture", "created_by": user},
)

change_set, _ = ChangeSet.objects.get_or_create(
    schema=schema,
    summary="identity template smoke seed",
    defaults={
        "status": ChangeSet.Status.APPLIED,
        "created_by": user,
        "applied_at": timezone.now(),
        "source": ChangeSet.Source.MANUAL,
    },
)
if change_set.status != ChangeSet.Status.APPLIED:
    change_set.status = ChangeSet.Status.APPLIED
    change_set.applied_at = timezone.now()
    change_set.created_by = user
    change_set.save(update_fields=["status", "applied_at", "created_by"])

entity, _ = Entity.objects.get_or_create(
    schema=schema,
    business_code="E001",
    defaults={"created_by": user},
)
record = (
    TemporalRecord.objects.filter(entity=entity, is_superseded=False, valid_to__isnull=True)
    .order_by("-valid_from", "-id")
    .first()
)
if record is None:
    record = TemporalRecord.objects.create(
        entity=entity,
        schema_version=schema.current_version,
        data_payload=record_payload,
        valid_from=dt.date(2026, 1, 1),
        change_set=change_set,
        recorded_by=user,
    )
else:
    record.schema_version = schema.current_version
    record.data_payload = record_payload
    record.valid_from = dt.date(2026, 1, 1)
    record.change_set = change_set
    record.recorded_by = user
    record.save(update_fields=["schema_version", "data_payload", "valid_from", "change_set", "recorded_by"])

entry = ChangeEntry.objects.filter(
    change_set=change_set,
    entity=entity,
    action=ChangeEntry.Action.CREATE,
).first()
if entry is None:
    ChangeEntry.objects.create(
        change_set=change_set,
        entity=entity,
        action=ChangeEntry.Action.CREATE,
        data_after=record.data_payload,
        valid_from=record.valid_from,
        new_record=record,
    )
else:
    entry.data_after = record.data_payload
    entry.valid_from = record.valid_from
    entry.new_record = record
    entry.save(update_fields=["data_after", "valid_from", "new_record"])

workbook = Workbook()
sheet = workbook.active
sheet.append(["员工号", "姓名", "身份证号", "部门", "valid_from"])
sheet.append(["E001", "张伟", "110105199001011234", "运营", "2026-05-22"])
buffer = BytesIO()
workbook.save(buffer)

print(json.dumps({
    "schemaId": schema.id,
    "schemaCode": schema.schema_code,
    "schemaName": schema.name,
    "normalTemplate": "{employee_no} / {name}",
    "sensitiveTemplate": "{employee_no} / {id_no}",
    "normalDisplay": "E001 / 张伟",
    "sensitiveDisplay": "E001 / 110***********1234",
    "rawSensitive": "110105199001011234",
    "defaultDisplay": "E001",
    "xlsxBase64": base64.b64encode(buffer.getvalue()).decode("ascii"),
}, ensure_ascii=True))
`;
  const stdout = await runDjangoShell(code);
  const jsonLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);
  if (!jsonLine) throw new Error("Smoke fixture did not return JSON");
  return JSON.parse(jsonLine);
}

async function runDjangoShell(code) {
  const python = process.env.PYTHON ?? defaultPythonPath();
  const managePy = path.join(backendRoot, "manage.py");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [managePy, "shell", "-c", code], {
      cwd: backendRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve(stdout.join(""));
      else reject(new Error(`Django fixture failed with exit ${code}\n${stderr.join("")}`));
    });
  });
}

function defaultPythonPath() {
  if (process.platform === "win32") {
    return path.join(backendRoot, ".venv", "Scripts", "python.exe");
  }
  return path.join(backendRoot, ".venv", "bin", "python");
}

async function prepareBrowser(cdp) {
  cdp.on("Runtime.exceptionThrown", (event) => {
    errors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text);
  });
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type !== "error") return;
    errors.push(event.args.map(formatConsoleArg).filter(Boolean).join(" "));
  });
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
}

async function login(cdp, username, password) {
  await navigate(cdp, `${appUrl}/login`);
  const result = await evaluate(
    cdp,
    async (loginUsername, loginPassword) => {
      const csrfResponse = await fetch("/api/v1/auth/csrf", { credentials: "include" });
      if (!csrfResponse.ok) {
        return { ok: false, status: csrfResponse.status, body: await csrfResponse.text() };
      }
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": readCookie("csrftoken"),
        },
        body: JSON.stringify({
          username: loginUsername,
          password: loginPassword,
          remember: true,
        }),
      });
      return {
        ok: response.ok,
        status: response.status,
        body: await response.text(),
      };

      function readCookie(name) {
        const prefix = `${name}=`;
        const cookie = document.cookie
          .split("; ")
          .filter((item) => item.startsWith(prefix))
          .at(-1);
        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
      }
    },
    username,
    password
  );
  if (!result.ok) {
    throw new Error(`Login failed: HTTP ${result.status} ${result.body}`);
  }
}

async function openSettings(cdp, fixture) {
  await navigate(cdp, `${appUrl}/schemas/${fixture.schemaId}/settings`);
  await waitForText(cdp, fixture.schemaName);
  await waitForText(cdp, "实体展示格式");
}

async function saveTemplate(cdp, schemaId, template) {
  const focused = await evaluate(cdp, focusTemplateTextarea);
  if (!focused) throw new Error("Identity display template textarea was not found");
  await cdp.send("Input.insertText", { text: template });
  await waitForFunction(cdp, templateTextareaHasValue, [template], 5_000);
  await waitForFunction(cdp, panelButtonEnabled, ["保存"], 5_000);
  const clicked = await evaluate(cdp, clickPanelButton, "保存");
  if (!clicked) throw new Error("Identity display template save button was not found");
  await waitForSchemaTemplate(cdp, schemaId, template);
}

async function assertSettingsPreview(cdp, expectedDisplay) {
  await waitForText(cdp, expectedDisplay);
}

async function assertCurrentViewDisplay(cdp, fixture, expectedDisplay) {
  await navigate(cdp, `${appUrl}/schemas/${fixture.schemaId}/records`);
  await waitForText(cdp, fixture.schemaName);
  await waitForText(cdp, expectedDisplay);
  const displayCode = await currentDisplayCode(cdp, fixture.schemaId);
  if (displayCode !== expectedDisplay) {
    throw new Error(`Current view display_code mismatch: expected ${expectedDisplay}, got ${displayCode}`);
  }
}

async function assertCurrentExport(cdp, fixture, expectedDisplay) {
  const result = await evaluate(
    cdp,
    async (schemaId) => {
      const response = await fetch(
        `/api/v1/schemas/${schemaId}/export/current?format=csv&at=2026-05-22`,
        { credentials: "include" }
      );
      return {
        ok: response.ok,
        status: response.status,
        text: await response.text(),
      };
    },
    fixture.schemaId
  );
  if (!result.ok) throw new Error(`Current export failed: HTTP ${result.status} ${result.text}`);
  if (!result.text.includes(expectedDisplay)) {
    throw new Error(`Current export did not contain display code ${expectedDisplay}`);
  }
}

async function assertImportPreview(cdp, fixture, expectedDisplay) {
  const result = await evaluate(
    cdp,
    async (schemaId, xlsxBase64) => {
      await fetch("/api/v1/auth/csrf", { credentials: "include" });
      const bytes = Uint8Array.from(atob(xlsxBase64), (char) => char.charCodeAt(0));
      const file = new File(
        [bytes],
        "identity-template-smoke.xlsx",
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
      const formData = new FormData();
      formData.append("file", file);
      formData.append("at", "2026-05-22");
      formData.append("missing_policy", "keep");
      const response = await fetch(`/api/v1/schemas/${schemaId}/import/preview`, {
        method: "POST",
        credentials: "include",
        headers: { "X-CSRFToken": readCookie("csrftoken") },
        body: formData,
      });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        payload: text ? JSON.parse(text) : null,
        text,
      };

      function readCookie(name) {
        const prefix = `${name}=`;
        const cookie = document.cookie
          .split("; ")
          .filter((item) => item.startsWith(prefix))
          .at(-1);
        return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : "";
      }
    },
    fixture.schemaId,
    fixture.xlsxBase64
  );
  if (!result.ok) throw new Error(`Import preview failed: HTTP ${result.status} ${result.text}`);
  const rowDisplay = result.payload?.rows?.[0]?.display_code;
  if (rowDisplay !== expectedDisplay) {
    throw new Error(`Import preview display_code mismatch: expected ${expectedDisplay}, got ${rowDisplay}`);
  }
}

async function assertSensitiveTemplateMasking(cdp, fixture) {
  await openSettings(cdp, fixture);
  await waitForText(cdp, fixture.sensitiveDisplay);
  const previewText = await evaluate(cdp, () => {
    const panels = [...document.querySelectorAll("div")];
    const panel = panels.find((item) => item.querySelector("h3")?.textContent?.includes("当前数据样例"));
    return panel?.textContent ?? "";
  });
  if (!previewText.includes(fixture.sensitiveDisplay)) {
    throw new Error("Settings preview did not render masked sensitive display code");
  }
  if (previewText.includes(fixture.rawSensitive)) {
    throw new Error("Settings preview leaked raw sensitive field value");
  }
  const displayCode = await currentDisplayCode(cdp, fixture.schemaId);
  if (displayCode !== fixture.sensitiveDisplay) {
    throw new Error(
      `Sensitive display_code mismatch: expected ${fixture.sensitiveDisplay}, got ${displayCode}`
    );
  }
  if (displayCode.includes(fixture.rawSensitive)) {
    throw new Error("Current records display_code leaked raw sensitive field value");
  }
}

async function clearTemplate(cdp, fixture) {
  const clicked = await evaluate(cdp, clickPanelButton, "清空模板");
  if (!clicked) throw new Error("Identity display template clear button was not found");
  await waitForSchemaTemplate(cdp, fixture.schemaId, "");
  await navigate(cdp, `${appUrl}/schemas/${fixture.schemaId}/records`);
  await waitForText(cdp, fixture.defaultDisplay);
  const hasCustomDisplay = await evaluate(
    cdp,
    (display) => document.body.innerText.includes(display),
    fixture.normalDisplay
  );
  if (hasCustomDisplay) {
    throw new Error("Current view still rendered custom display template after clearing it");
  }
  const displayCode = await currentDisplayCode(cdp, fixture.schemaId);
  if (displayCode !== fixture.defaultDisplay) {
    throw new Error(`Cleared display_code mismatch: expected ${fixture.defaultDisplay}, got ${displayCode}`);
  }
}

async function currentDisplayCode(cdp, schemaId) {
  return waitForFunction(
    cdp,
    async (id) => {
      const response = await fetch(`/api/v1/schemas/${id}/records/?page_size=1&at=2026-05-22`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return payload.results?.[0]?.display_code || false;
    },
    [schemaId],
    10_000
  );
}

async function waitForSchemaTemplate(cdp, schemaId, expectedTemplate) {
  await waitForFunction(
    cdp,
    async (id, expected) => {
      const response = await fetch(`/api/v1/schemas/${id}/`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!response.ok) return false;
      const payload = await response.json();
      return (payload.identity_display_template ?? "") === expected;
    },
    [schemaId, expectedTemplate],
    10_000
  );
}

async function navigate(cdp, url) {
  await cdp.send("Page.navigate", { url });
  await waitForFunction(cdp, () => document.readyState !== "loading");
}

async function waitForText(cdp, text) {
  await waitForFunction(cdp, (expected) => document.body.innerText.includes(expected), [text]);
}

function focusTemplateTextarea() {
  const section = [...document.querySelectorAll("section")]
    .find((item) => item.innerText.includes("实体展示格式"));
  const textarea = section?.querySelector("textarea");
  if (!textarea) return false;
  textarea.focus();
  textarea.setSelectionRange(0, textarea.value.length);
  return true;
}

function panelButtonEnabled(label) {
  const section = [...document.querySelectorAll("section")]
    .find((item) => item.innerText.includes("实体展示格式"));
  return [...(section?.querySelectorAll("button") ?? [])]
    .some((item) => item.textContent?.trim() === label && !item.disabled);
}

function templateTextareaHasValue(expected) {
  const section = [...document.querySelectorAll("section")]
    .find((item) => item.innerText.includes("实体展示格式"));
  return section?.querySelector("textarea")?.value === expected;
}

function clickPanelButton(label) {
  const section = [...document.querySelectorAll("section")]
    .find((item) => item.innerText.includes("实体展示格式"));
  const button = [...(section?.querySelectorAll("button") ?? [])]
    .find((item) => item.textContent?.trim() === label && !item.disabled);
  if (!button) return false;
  button.click();
  return true;
}

async function assertNoBrowserErrors() {
  if (errors.length > 0) {
    throw new Error(`Browser errors:\n${errors.filter(Boolean).join("\n")}`);
  }
}

async function waitForHttp(url, label) {
  const deadline = Date.now() + 15_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = new Error(`${label} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(150);
  }
  throw new Error(`Timed out waiting for ${label} at ${url}: ${lastError?.message ?? "unknown error"}`);
}

async function findAvailablePort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await portIsAvailable(port)) return port;
  }
  throw new Error(`No available debug port found from ${start}`);
}

function portIsAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function formatConsoleArg(arg) {
  return String(arg.value ?? arg.description ?? arg.unserializableValue ?? "");
}

async function removeChromeProfile(profileDir) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await removeProfile(profileDir);
      return;
    } catch (error) {
      if (!["EBUSY", "EPERM"].includes(error?.code) || attempt === 4) {
        console.warn(`Could not remove Chrome smoke profile: ${error.message}`);
        return;
      }
      await delay(250);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
