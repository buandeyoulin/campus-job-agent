# Campus Job Agent

Campus Job Agent 是一个本地优先、人工投递的求职资料与职位辅助项目。当前代码包含 Phase 0 技术可行性验证和 Phase 1 资料工作台。

## Phase 1：资料工作台

在本机维护基本信息、求职偏好、PDF/DOCX 简历以及教育、实习、项目和技能事实；AI 提取必须由用户明确确认，提取结果也必须人工审核。应用不会自动提交职位申请。

使用方式、数据目录、脱敏边界、失败恢复和删除语义见 [资料工作台文档](docs/profile-onboarding.md)。

快速启动：

```powershell
npm install
npm run dev
```

本地界面：`http://127.0.0.1:4318`。本地 API：`http://127.0.0.1:4317`。

## Phase 0：可行性验证

Phase 0 验证 Codex 结构化输出、OfferBiu/Tencent 公开页面访问、PDF 生成以及 PDF/DOCX 解析。完整安装、登录、可选提供方和验收门槛见 [Phase 0 Feasibility Probes](docs/feasibility/README.md)。

```powershell
npm ci
npm exec playwright install chromium
npm exec -- codex login status
npm run phase0
```

Phase 0 使用隔离的空 Git 目录和虚构的 schema 连通性内容；其结果写入 `.local/phase0`，可审查摘要位于 `docs/feasibility/phase-0-results.md`。
