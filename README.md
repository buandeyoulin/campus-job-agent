# Campus Job Agent

Campus Job Agent 是一个本地优先、人工投递的求职资料与职位辅助项目。当前代码包含 Phase 0 技术可行性验证、Phase 1 资料工作台和 Phase 2 公开职位发现。

## Phase 2：公开职位发现

在本地刷新腾讯公开职位、查看来源状态、按关键词与城市筛选、阅读职位详情，并通过普通外链自行前往公开岗位页面。职位会在本地去重保存；应用不会登录招聘网站或自动投递。

来源规则、JSON 导入格式和数据边界见 [公开职位发现文档](docs/job-discovery.md)。自建芯片公司库与官方招聘源正在按 [设计规范](docs/superpowers/specs/2026-07-18-owned-company-job-source-design.md) 实现，最终投递仍由用户手动完成。

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

Phase 0 验证 Codex 结构化输出、腾讯公开岗位访问、PDF 生成以及 PDF/DOCX 解析。完整安装、登录、可选提供方和验收门槛见 [Phase 0 Feasibility Probes](docs/feasibility/README.md)。

```powershell
npm ci
npm exec playwright install chromium
npm exec -- codex login status
npm run phase0
```

Phase 0 使用隔离的空 Git 目录和虚构的 schema 连通性内容；其结果写入 `.local/phase0`，可审查摘要位于 `docs/feasibility/phase-0-results.md`。
