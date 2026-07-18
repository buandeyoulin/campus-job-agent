"use strict";

importScripts("core.js");

const LOOPBACK = "http://127.0.0.1:4317";
let processToken = null;

async function sessionToken(refresh = false) {
  if (!refresh && processToken) return processToken;
  const response = await fetch(`${LOOPBACK}/api/offerbiu-bridge/session`);
  if (!response.ok) throw new Error("Campus Job Agent 本机服务未启动");
  const payload = await response.json();
  if (!payload || typeof payload.token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(payload.token)) {
    throw new Error("本机桥接会话无效");
  }
  processToken = payload.token;
  return processToken;
}

async function importBatch(batch, retry = true) {
  const token = await sessionToken(false);
  const response = await fetch(`${LOOPBACK}/api/jobs/import/offerbiu-bridge`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-campus-bridge-token": token,
    },
    body: JSON.stringify(batch),
  });
  if (response.status === 401 && retry) {
    processToken = null;
    await sessionToken(true);
    return importBatch(batch, false);
  }
  if (!response.ok) throw new Error(`本机岗位库返回 HTTP ${response.status}`);
  return response.json();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let pageOrigin;
  try {
    pageOrigin = new URL(sender.tab?.url ?? "").origin;
  } catch {
    pageOrigin = "";
  }
  if (pageOrigin !== "https://offerbiu.com" || message?.type !== "import-offerbiu-batch"
    || !globalThis.OfferBiuBridgeCore.validateBatch(message.batch)) {
    sendResponse({ ok: false, error: "扩展消息未通过安全校验" });
    return false;
  }
  void importBatch(message.batch)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : "导入失败" }));
  return true;
});
