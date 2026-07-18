# OfferBiu 浏览器会话桥接设计

## 目标

在不导出 Cookie、Authorization、Local Storage 或其他登录凭据的前提下，使用用户当前 Chrome 中已经登录的 OfferBiu 会话读取完整招聘分页，并把经过字段白名单过滤的岗位数据分批写入 Campus Job Agent 本机岗位库。

桥接只读取招聘信息。它不点击“加入投递”，不创建 OfferBiu 投递记录，不提交申请，也不读取简历、个人中心或其他账号数据。

## 方案选择

采用 Manifest V3 Chrome 扩展的“页面请求模板复用”方案：

1. 主世界脚本在 `document_start` 包装页面的 `fetch`，仅观察 `/api/recruitment/postings` 请求。
2. 当 OfferBiu 页面自行发出已认证岗位请求时，脚本在页面闭包内暂存该 GET 请求的 headers 与 credentials 模式。
3. 后续分页请求复用该模板，但凭据值永不出页面闭包。
4. 主世界脚本把响应中的岗位记录先做字段白名单投影，再通过 `window.postMessage` 交给隔离世界脚本。
5. 隔离世界脚本经扩展后台发送到 `http://127.0.0.1:4317`。

不采用以下方案：

- 公开接口抓取：只能读取 2027、2026 各两页，不能满足完整同步。
- 导出 Cookie 或令牌：会把账号钥匙暴露给脚本、日志或本机进程，不满足安全目标。
- 自动翻 1700 多个 UI 页面：速度慢、脆弱，并且不适合作为可维护的数据同步能力。

## 组件边界

### Chrome 扩展

目录：`apps/offerbiu-bridge/extension/`

- `manifest.json`：仅申请 `https://offerbiu.com/*` 与 `http://127.0.0.1:4317/*`。
- `core.js`：无浏览器副作用的白名单映射、消息校验和分页计算，可由 Vitest 直接测试。
- `page-bridge.js`：运行在 OfferBiu 主世界；持有认证请求模板并读取分页。
- `content.js`：显示“同步到 Campus Job Agent”按钮和进度；只接收白名单岗位批次。
- `background.js`：取得本机桥接会话令牌并向 loopback API 发送批次。

页面桥接允许传出的岗位字段只有：

- `id`
- `companyName`
- `companyNature`
- `industry`
- `recruitType`
- `targetYears`
- `locations`
- `positionsText`
- `deadlineText`
- `announcementUrl`
- `applyUrl`
- `examPolicy`
- `noteText`
- `sourceUpdatedAt`
- `seasonYear`

任何 `authorization`、`cookie`、`token`、请求 headers、用户资料或未知字段都不会进入跨世界消息。

### 本机桥接 API

新增两个端点：

- `GET /api/offerbiu-bridge/session`：返回当前本机服务进程内的随机桥接令牌。
- `POST /api/jobs/import/offerbiu-bridge`：要求 `X-Campus-Job-Agent-Bridge` 请求头，校验批次后写入岗位库。

桥接令牌不是 OfferBiu 凭据，只用于阻止普通网页对 loopback 写接口发起 CSRF。令牌只保存在扩展后台内存与本机服务内存中，不进入页面主世界和 SQLite。

全局 Origin 防护只对这个 POST 端点豁免；该端点必须先通过桥接令牌校验。其他写接口继续执行原有精确 loopback Origin 校验。

## 数据流

1. 用户打开已登录的 `https://offerbiu.com/companies/`。
2. OfferBiu 自身加载岗位列表，主世界脚本捕获一份仅驻留内存的认证 GET 请求模板。
3. 扩展显示“会话已就绪”。用户点击同步按钮。
4. 主世界脚本按届别从第 0 页开始，以 API 返回的 `totalPages` 为准顺序读取，每页最多 50 条。
5. 每页响应经白名单投影后发送给隔离世界；隔离世界等待本机导入确认后才请求下一页，形成背压。
6. 本机服务用 OfferBiu 稳定记录 ID 去重；重复同步更新现有来源，不重复创建岗位。
7. 最后一页成功后，扩展显示抓取、创建、更新和跳过数量。

## 错误与恢复

- 没有观察到已认证岗位请求：按钮保持不可用并提示刷新已登录的岗位库页面。
- API 返回 `previewLimited: true`、401 或 403：停止同步并提示登录会话未被桥接，不退回伪全量结果。
- 本机服务未启动：不继续翻页，提示先运行 Campus Job Agent。
- 单页响应无效：整页拒绝；不会把未知结构写入 SQLite。
- 本机批次导入失败：停止在当前页，用户可重新点击同步；稳定 ID 保证已完成页可安全重放。
- 页面导航或关闭：页面内请求模板随页面销毁，不持久化。

## 安全不变量

- 不调用 `chrome.cookies`。
- 不读取 `document.cookie`、`localStorage` 或 `sessionStorage`。
- 不把 `Request`、headers 或认证值放入 `postMessage`、扩展消息、本机请求体或日志。
- 本机 API 只绑定 `127.0.0.1`。
- 岗位批次在扩展和服务端各执行一次字段白名单校验。
- 扩展没有投递、表单提交、简历或用户资料相关权限。

## 验证标准

- 单元测试证明白名单投影会丢弃凭据和未知字段。
- 单元测试证明分页从 0 开始、使用服务端 `totalPages`，并在每批确认后继续。
- API 测试证明无桥接令牌、错误令牌和普通网页 Origin 均不能写入。
- API 测试证明合法批次可导入、重复批次可重放且不会重复创建。
- 静态扫描确认扩展代码没有 `chrome.cookies`、`document.cookie`、`localStorage`、`sessionStorage`。
- 完整 `npm run verify` 通过。
- 在已登录 OfferBiu 页面进行一次真实同步验证；若扩展安装需要用户手动操作，则该步骤作为唯一需要用户参与的运行时验证。
