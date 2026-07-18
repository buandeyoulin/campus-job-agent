# OfferBiu 浏览器会话桥接

这个 Chrome 扩展把当前已登录 OfferBiu 会话能看到的 2027、2026 届招聘信息，分批写入 Campus Job Agent 的本机岗位库。它只传递岗位白名单字段，不导出 Cookie、认证请求头或登录令牌，也不点击“加入投递”、填写表单或提交申请。

## 启动与安装

1. 在项目根目录运行 `npm run dev`，确认本地界面和 API 分别位于 `http://127.0.0.1:4318` 与 `http://127.0.0.1:4317`。
2. 在 Chrome 打开 `chrome://extensions`，启用“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择 `apps/offerbiu-bridge/extension`。
4. 用同一个 Chrome 会话登录 OfferBiu，然后打开 `https://offerbiu.com/companies/`；如果登录后跳转到 `https://offerbiu.com/jobs/new/`，扩展也会在该招聘信息页面运行。
5. 刷新一次页面并等待右下角面板显示“会话已就绪”。只有 OfferBiu 自己成功加载过一个非预览岗位响应后，同步按钮才会启用。
6. 点击“同步到本机岗位库”，保持页面打开，直到面板显示完成数量。
7. 回到 Campus Job Agent 岗位库，按来源 `offerbiu` 检索并核对数量。

如果面板一直等待会话，请先确认已登录、岗位列表确实能完整显示，再刷新页面。如果提示本机服务未启动，请运行 `npm run dev` 后重试。如果 OfferBiu 返回预览模式、401 或 403，同步会立即停止，不会把预览结果冒充完整结果。

## 数据与安全边界

- 页面脚本只观察 OfferBiu 自己发出的 `/api/recruitment/postings` GET 请求。
- 已认证请求模板只驻留在当前 OfferBiu 页面的 JavaScript 闭包内；导航或关闭页面后即销毁。
- 跨页面世界、扩展后台和本机 API 传输的只有明确列出的岗位字段。
- 扩展不申请 Cookie 权限，也不读取浏览器存储、用户资料、简历或投递记录。
- 本机写接口使用每次服务启动时随机生成的短期桥接令牌，并仅监听 `127.0.0.1:4317`。
- OfferBiu 岗位 `id` 是稳定来源 ID；重复同步会更新已有记录，不会重复创建。
- 最终投递始终由用户手动完成。

扩展的主机权限严格限定为 `https://offerbiu.com/*` 和 `http://127.0.0.1:4317/*`。运行 `npm run build -w @campus-job-agent/offerbiu-bridge` 可重新执行 Manifest、引用文件和禁用 API 静态校验。

## 完整性说明

同步会读取 2027、2026 两个届别从第 0 页到服务端 `totalPages - 1` 的全部分页，每页最多 50 条，并等待本机成功确认后再继续下一页。能否取得完整数据仍取决于当前账号实际权限以及 OfferBiu 当时返回的 `previewLimited: false`；必须用一次真实登录会话核对扩展完成数量和本机 `source=offerbiu` 数量后，才能确认当次同步完整。
