---
title: "DevFlow"
---

## 核心能力

- 仓库健康摘要 (repo health): 同步 github 仓库, 生成包含 issues, pull requests, CI 等仓库健康摘要
- issues 诊断 (issue agent): 分析 issue 的分类、优先级、复杂度, 推荐负责人并生成详细的需求描述和 TODO list
- pr 风险审查 (pr review agent): 理解代码变更, 分析安全风险, 给出「同意合并」或「拒绝合并」的明确决策建议
- CI 失败排查 (CI debug agent): 分析 CI 的失败日志, 定位错误, 给出修复步骤
- 多 agent 协同决策 (workflow): 对于 pr 是否可以合并等复杂问题, planner、pr agent, CI agent 和 observer 协作, 组建专家团队给出结论
- 长对话和记忆 (memory): 可以理解长上下文, 支持自动记忆、长期记忆
- 自动周报与沉淀 (report): 自动生成周报, 将周报写回知识库
- 安全草稿 (safety draft): 对于关闭 issue 等写操作, 只生成草稿提供给人工确认, 不会擅自执行高风险动作
