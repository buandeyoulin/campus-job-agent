# Campus Job Agent

Campus Job Agent 是一个本地优先、人工投递的求职助手。它把个人资料、简历事实、公开岗位、自建公司库和求职进度保存在本机，并提供岗位匹配、材料准备与面试辅助能力。系统不会登录招聘平台、填写申请表或自动提交职位申请。

## 快速启动

```powershell
npm install
npm run dev
```

- 网页：`http://127.0.0.1:4318`
- 本地 API：`http://127.0.0.1:4317`
- 默认数据目录：`%LOCALAPPDATA%\CampusJobAgent`
- 自定义数据目录：设置 `CAMPUS_JOB_AGENT_DATA_DIR`

## 当前能力

- 录入个人信息、求职偏好、PDF/DOCX 简历和可人工确认的经历事实。
- 维护自有公司库：内置 20 家芯片公司种子、手动公司官网、候选隔离和证据核验。
- 可选使用 Brave Search 发现新的公司官网；搜索结果不能直接变成岗位。
- 从经过核验的公开公司招聘入口读取岗位，保留来源、健康状态和岗位生命周期。
- 查看并筛选本机岗位库；通过普通链接前往公司官网后手动投递。

详细说明：

- [自建公司岗位库](docs/owned-company-library.md)
- [公开岗位发现与数据边界](docs/job-discovery.md)
- [个人资料工作台](docs/profile-onboarding.md)
- [Phase 0 可行性探针](docs/feasibility/README.md)

## 验证

```powershell
npm run verify
```

该命令执行类型检查、自动化测试和构建。
