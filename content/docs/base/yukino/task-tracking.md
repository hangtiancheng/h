---
title: "Task Tracking"
---

任务板 (Task Board): agent 给自己建的显式工作清单 —— 复杂任务的拆解、进度、依赖和后台任务的状态, 都从对话里搬进结构化存储

为什么需要: LLM 在长对话里容易忘记做过什么、漏掉子任务; 任务板是模型自己维护的外部记忆, 也是多 agent 协作的共享调度面

## 私有任务板

每个会话一个私有任务板, 持久化在会话产物目录: `~/.yukino/sessions/artifacts/<sessionId>/tasks.json` (TaskStore, src/todo/store.ts); `/resume` 后任务板随会话恢复

任务模型 (src/todo/index.ts):

```ts
interface Task {
  id: string; // 会话内递增
  subject: string; // 简短标题
  description: string; // 需要做什么
  status: "pending" | "in_progress" | "completed" | "blocked" | "cancelled";
  priority?: "high" | "medium" | "low";
  owner?: string; // 认领者 (团队场景)
  activeForm?: string; // 进行时形式, 渲染进度用
  blocks: string[]; // 本任务阻塞哪些任务
  blockedBy: string[]; // 本任务被哪些任务阻塞
  metadata: Record<string, unknown>;
}
```

## 五个任务工具

| 工具       | 行为                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| TaskCreate | 在任务板上创建待办项 (subject + description), 不启动任何执行                                           |
| TaskGet    | 按 id 读单个任务                                                                                       |
| TaskList   | 列出全部任务                                                                                           |
| TaskUpdate | 更新字段; 支持 addBlocks/addBlockedBy 增量加依赖; `status: "deleted"` 删除任务及其依赖边               |
| TodoWrite  | 原子替换整个清单: 一次调用给出全部要保留的条目, 复用已返回的 id 保留 metadata 和依赖链; 空数组清空清单 |

用法约定 (由运行时工具指南每轮注入, 见 system-prompt):

- 只跟踪复杂工作, 琐碎请求不建任务; 开始前标 in_progress, 验证通过后才标 completed, blocked/cancelled 如实使用
- 依赖必须指向已存在的任务, 不能自依赖、不能成环 (validateTaskDependencies 校验); 只有 completed 的依赖才算解除阻塞, cancelled 的依赖保持未解决直到显式移除
- 团队协作时: leader 和 teammates 共享团队任务板; 没有团队时任务板是 agent 的私有清单; 普通 subagent 和 fork 永远用私有清单 (团队任务板见 agent-team)

## 后台任务: TaskManager

任务板和后台任务共享 Task\* 命名空间但不是一个东西: 任务板跟踪「要做什么」, TaskManager 跟踪「正在后台跑什么」(src/subagent/task-manager.ts)

- 任务 id 前缀区分类型: `agent-` (后台 subagent) / `bash-` / `ps-` (后台 shell)
- 状态: running | completed | failed | cancelled; 完成的任务保留上限 200 条
- 结束后结果用 `<task-notification task_id="..." status="...">` 标签包裹, 经 agent loop 每轮的通知 drain 作为 system-reminder 注入主 agent 上下文 (见 subagent)

两个查询/控制工具:

- TaskOutput: 按 task_id 查看后台任务状态, 或 `wait: true` 有界等待一次 (`timeout_ms` 0-60000, 缺省 30000); 不消费完成通知、超时不停任务; 推荐等通知而不是轮询; 任务板的 Task id 不能在这里用
- TaskStop: 停后台任务 (`task_id`, 先查本轮 TaskManager 再回退宿主级) 或停团队成员 (`teammate`, 按名)

## 宿主差异

- 交互式 UI / remote: 完整任务工具 + TaskOutput/TaskStop; leader 的任务工具被替换为团队感知版本 (见 agent-team 的 registerLeaderTaskTools)
- print 模式: 同一套基础注册, 单次执行内也可用
- 后台异步 subagent: 白名单包含全部任务工具 (见 subagent 的 ASYNC_AGENT_ALLOWED_TOOLS)
