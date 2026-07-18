(function installOfferBiuBridgePanel() {
  "use strict";

  const PAGE_CHANNEL = "campus-job-agent-offerbiu-page";
  const CONTENT_CHANNEL = "campus-job-agent-offerbiu-content";
  const core = globalThis.OfferBiuBridgeCore;

  const panel = document.createElement("aside");
  panel.id = "campus-job-agent-offerbiu-bridge";
  panel.innerHTML = [
    '<strong>Campus Job Agent</strong>',
    '<span data-role="status">等待 OfferBiu 完整岗位会话…</span>',
    '<progress data-role="progress"></progress>',
    '<button type="button" disabled>同步到本机岗位库</button>',
    '<small>只同步岗位字段，不读取凭据；投递仍需手动完成。</small>',
  ].join("");
  document.documentElement.append(panel);
  const status = panel.querySelector('[data-role="status"]');
  const progress = panel.querySelector('[data-role="progress"]');
  const button = panel.querySelector("button");

  function setStatus(text) {
    status.textContent = text;
  }

  function acknowledge(batch, result) {
    window.postMessage({
      channel: CONTENT_CHANNEL,
      type: "batch-ack",
      syncId: batch.syncId,
      seasonYear: batch.seasonYear,
      page: batch.page,
      ...result,
    }, window.location.origin);
  }

  button.addEventListener("click", () => {
    button.disabled = true;
    progress.removeAttribute("value");
    setStatus("正在同步…");
    window.postMessage({ channel: CONTENT_CHANNEL, type: "start" }, window.location.origin);
  });

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin || message?.channel !== PAGE_CHANNEL) return;
    if (message.type === "ready") {
      button.disabled = false;
      setStatus("会话已就绪，可以开始同步");
      return;
    }
    if (message.type === "batch") {
      const batch = message.batch;
      if (!core.validateBatch(batch)) {
        acknowledge(batch ?? {}, { ok: false, error: "岗位批次校验失败" });
        return;
      }
      chrome.runtime.sendMessage({ type: "import-offerbiu-batch", batch }, (response) => {
        if (chrome.runtime.lastError) {
          acknowledge(batch, { ok: false, error: "扩展后台连接失败" });
          return;
        }
        acknowledge(batch, response?.ok === true
          ? { ok: true, result: response.result }
          : { ok: false, error: response?.error ?? "本机岗位库导入失败" });
      });
      return;
    }
    if (message.type === "progress") {
      progress.max = Math.max(message.totalPages, 1);
      progress.value = message.page;
      setStatus(`已同步 ${message.imported} 条；${message.seasonYear} 届 ${message.page}/${message.totalPages} 页`);
      return;
    }
    if (message.type === "complete") {
      button.disabled = false;
      progress.value = progress.max;
      setStatus(`同步完成：读取 ${message.seen} 条，新增 ${message.created} 条，更新 ${message.updated} 条，跳过 ${message.skipped} 条`);
      return;
    }
    if (message.type === "error") {
      button.disabled = false;
      progress.removeAttribute("value");
      setStatus(typeof message.message === "string" ? message.message : "同步失败");
    }
  });

  window.postMessage({ channel: CONTENT_CHANNEL, type: "probe" }, window.location.origin);
})();
