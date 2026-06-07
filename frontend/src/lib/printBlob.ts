export interface PrintBlobOptions {
  title?: string;
  cleanupDelayMs?: number;
}

const DEFAULT_CLEANUP_DELAY_MS = 60_000;

export function printBlob(blob: Blob, options: PrintBlobOptions = {}) {
  return new Promise<void>((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const iframe = createPrintFrame(url, options.title);
    let settled = false;
    let cleanupTimer: number | null = null;

    function cleanup() {
      if (cleanupTimer !== null) window.clearTimeout(cleanupTimer);
      iframe.remove();
      URL.revokeObjectURL(url);
    }

    function fail(error: unknown) {
      cleanup();
      if (!settled) {
        settled = true;
        reject(error);
      }
    }

    iframe.onerror = () => fail(new Error("打印预览加载失败"));
    iframe.onload = () => {
      const printWindow = iframe.contentWindow;
      if (!printWindow) {
        fail(new Error("无法打开打印窗口"));
        return;
      }

      printWindow.addEventListener("afterprint", cleanup, { once: true });
      cleanupTimer = window.setTimeout(
        cleanup,
        options.cleanupDelayMs ?? DEFAULT_CLEANUP_DELAY_MS
      );

      try {
        printWindow.focus();
        printWindow.print();
        if (!settled) {
          settled = true;
          resolve();
        }
      } catch (error) {
        fail(error);
      }
    };

    document.body.appendChild(iframe);
  });
}

function createPrintFrame(url: string, title?: string) {
  const iframe = document.createElement("iframe");
  iframe.title = title ?? "label-print";
  iframe.src = url;
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "1px";
  iframe.style.height = "1px";
  iframe.style.opacity = "0";
  iframe.style.border = "0";
  iframe.style.pointerEvents = "none";
  return iframe;
}
