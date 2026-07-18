(function installOfferBiuPageBridge() {
  "use strict";

  const PAGE_CHANNEL = "campus-job-agent-offerbiu-page";
  const CONTENT_CHANNEL = "campus-job-agent-offerbiu-content";
  const POSTINGS_PATH = "/api/recruitment/postings";
  const SEASONS = Object.freeze([2027, 2026]);
  const ACK_TIMEOUT_MS = 20_000;
  const originalFetch = window.fetch.bind(window);
  const core = globalThis.OfferBiuBridgeCore;
  let requestTemplate = null;
  let syncing = false;

  function emit(type, detail = {}) {
    window.postMessage({ channel: PAGE_CHANNEL, type, ...detail }, window.location.origin);
  }

  function requestFrom(input, init) {
    try {
      if (input instanceof Request) return new Request(input, init);
      return new Request(new URL(String(input), window.location.href), init);
    } catch {
      return null;
    }
  }

  function inspect(request, response) {
    if (!request || request.method !== "GET" || !response.ok) return;
    const url = new URL(request.url);
    if (url.origin !== window.location.origin || url.pathname !== POSTINGS_PATH) return;
    void response.clone().json().then((payload) => {
      if (payload?.success !== true || payload?.data?.previewLimited !== false) return;
      requestTemplate = request.clone();
      emit("ready");
    }).catch(() => {});
  }

  window.fetch = function bridgedFetch(input, init) {
    const request = requestFrom(input, init);
    const result = originalFetch(input, init);
    void result.then((response) => inspect(request, response)).catch(() => {});
    return result;
  };

  function authenticatedRequest(seasonYear, page) {
    if (!requestTemplate) throw new Error("尚未捕获可用的登录会话请求");
    const url = new URL(requestTemplate.url);
    url.searchParams.set("seasonYear", String(seasonYear));
    url.searchParams.set("page", String(page));
    url.searchParams.set("size", "50");
    return new Request(url, requestTemplate);
  }

  async function fetchPage(seasonYear, page) {
    const response = await originalFetch(authenticatedRequest(seasonYear, page));
    if (response.status === 401 || response.status === 403) throw new Error("OfferBiu 登录会话已失效，请刷新并重新登录");
    if (!response.ok) throw new Error(`OfferBiu 返回 HTTP ${response.status}`);
    const payload = await response.json();
    const data = payload?.data;
    if (payload?.success !== true || !data || !Array.isArray(data.items)
      || !Number.isInteger(data.page) || !Number.isInteger(data.totalPages)) {
      throw new Error("OfferBiu 岗位响应格式无效");
    }
    if (data.previewLimited === true) throw new Error("当前会话仍是预览模式，无法完整同步");
    if (data.previewLimited !== false) throw new Error("无法确认当前会话具有完整岗位访问权限");
    return data;
  }

  function waitForAck(syncId, seasonYear, page) {
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        window.removeEventListener("message", listener);
        reject(new Error("本机岗位库确认超时"));
      }, ACK_TIMEOUT_MS);
      function listener(event) {
        const message = event.data;
        if (event.source !== window || event.origin !== window.location.origin
          || message?.channel !== CONTENT_CHANNEL || message?.type !== "batch-ack"
          || message.syncId !== syncId || message.seasonYear !== seasonYear || message.page !== page) return;
        window.clearTimeout(timer);
        window.removeEventListener("message", listener);
        if (message.ok === true) resolve(message.result);
        else reject(new Error(typeof message.error === "string" ? message.error : "本机岗位库拒绝了批次"));
      }
      window.addEventListener("message", listener);
    });
  }

  async function sendPage(syncId, seasonYear, page, data) {
    const records = data.items.map(core.sanitizePosting).filter(Boolean);
    if (records.length > 50) throw new Error("OfferBiu 单页岗位数超过安全上限");
    if (records.length === 0) return { seen: 0, imported: 0, created: 0, updated: 0, skipped: 0 };
    const batch = { syncId, seasonYear, page, totalPages: data.totalPages, records };
    if (!core.validateBatch(batch)) throw new Error("岗位批次未通过本地白名单校验");
    const acknowledgement = waitForAck(syncId, seasonYear, page);
    emit("batch", { batch });
    const result = await acknowledgement;
    const summary = core.summarizeImport(batch, result);
    if (!summary) throw new Error("本机岗位库返回了无效批次统计");
    return summary;
  }

  async function synchronize() {
    if (syncing) return;
    if (!requestTemplate) {
      emit("error", { message: "请先让 OfferBiu 页面加载一次岗位列表" });
      return;
    }
    syncing = true;
    const syncId = crypto.randomUUID();
    const totals = { seen: 0, imported: 0, created: 0, updated: 0, skipped: 0 };
    let pages = 0;
    try {
      for (const seasonYear of SEASONS) {
        const first = await fetchPage(seasonYear, 0);
        const pageNumbers = core.pageNumbers(first.totalPages);
        if (pageNumbers.length === 0) throw new Error("OfferBiu 返回了无效页数");
        for (const page of pageNumbers) {
          const data = page === 0 ? first : await fetchPage(seasonYear, page);
          if (data.page !== page || data.totalPages !== first.totalPages) throw new Error("OfferBiu 分页在同步过程中发生变化");
          const summary = await sendPage(syncId, seasonYear, page, data);
          for (const key of Object.keys(totals)) totals[key] += summary[key];
          pages += 1;
          emit("progress", { ...totals, pages, seasonYear, page: page + 1, totalPages: data.totalPages });
        }
      }
      emit("complete", { ...totals, pages });
    } catch (error) {
      emit("error", { message: error instanceof Error ? error.message : "同步失败" });
    } finally {
      syncing = false;
    }
  }

  window.addEventListener("message", (event) => {
    const message = event.data;
    if (event.source !== window || event.origin !== window.location.origin || message?.channel !== CONTENT_CHANNEL) return;
    if (message?.type === "probe") {
      if (requestTemplate) emit("ready");
      return;
    }
    if (message?.type !== "start") return;
    void synchronize();
  });
})();
