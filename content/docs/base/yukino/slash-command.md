---
title: "Slash Command"
---

Slash Command: 以 / 开头的输入会被命令解析器拦截

## 命令的分类

四种命令类型 (源码: src/commands/commands.ts)

- local: 不参与 agent loop, 不需要重新渲染 UI, handler 返回的字符串直接作为系统消息展示
- local_ui: 不参与 agent loop, 需要 UI 处理 (打开对话框、切换模式、重载状态)
- prompt: 参与 agent loop, handler 构造 prompt 作为用户消息发送给 LLM API
- skill_fork: skill 加载后自动注册的 fork 型命令, UI 构造 fork host 执行

> 不参与 agent loop != 不调用 LLM API
>
> 例如 /compact 命令调用 LLM API 生成摘要, 但是不参与 agent loop

命令拦截时机: 消息发送给 LLM API 前, 用户按下回车, 先判断输入是不是命令, 如果是命令则走命令处理逻辑, 不是命令才发送给 LLM API

解析规则: 以 `/` 开头; 首个空白之前是命令名, 之后是 args; 命令名包含 `/` 时视为文件路径, 按普通用户消息处理; 同名注册直接抛错 (先注册者赢)

## 内置命令清单

| 命令                   | 类型     | 行为                                                                                 |
| ---------------------- | -------- | ------------------------------------------------------------------------------------ |
| /login                 | local_ui | 打开表单配置、保存并激活一个 LLM provider                                            |
| /provider              | local_ui | 切换当前 provider (仅终端 UI 注册)                                                   |
| /model [model]         | local_ui | 切换当前 provider 的模型; 无参数时打开模型选择器                                     |
| /help [command]        | local    | 列出全部命令 (不含 skill), 或单个命令的详情                                          |
| /status                | local    | 当前会话状态: 模式、模型、provider、token、工具、沙箱、记忆、skills、MCP、会话、目录 |
| /session               | local    | 确认当前会话活跃; 历史会话用 /resume                                                 |
| /memory                | local    | 列出记忆; `/memory clear` 清空记忆                                                   |
| /skills                | local_ui | 列出 skills; `/skills reload` 从磁盘热重载                                           |
| /skill `<name>` [args] | -        | 按名运行 skill (等价于 `/<name> [args]`; `/skill reload` 路由到 /skills reload)      |
| /plan                  | local_ui | 进入 plan 模式 (只读调查)                                                            |
| /compact               | local_ui | 强制上下文压缩                                                                       |
| /clear                 | local_ui | 重置会话并清屏                                                                       |
| /resume [id]           | local_ui | 列出或恢复历史会话                                                                   |
| /rewind                | local_ui | 打开检查点回退对话框 (见 agents-md-and-memory 的文件历史)                            |
| /sandbox [mode]        | local_ui | 配置沙箱: auto (开启+自动放行) / manual (开启+手动确认) / off                        |
| /worktree              | local_ui | 列出 git worktrees                                                                   |
| /mcp                   | local    | 显示 MCP server 连接状态; `/mcp reload` 重读配置并 reconcile                         |
| /thinking [level]      | local    | 无参数打开思考强度选择器; 带参数设置 (off...max), 持久化到 config.yaml               |
| /code-review           | local_ui | 打开代码审查表单 (workspace / branch-range / commit)                                 |
| /quit                  | local_ui | 退出                                                                                 |

## 用户自定义命令

两层目录, 按顺序加载, 同名项目级赢

1. 用户级: ~/.yukino/commands/
2. 项目级: ${workDir}/.yukino/commands/

格式: 递归扫描 `*.md` 文件; 子目录命名空间化 (`sub/dir/foo.md` 注册为 `sub:dir:foo`); 路径段小写、空格转 `-`; 与内置命令冲突时保留内置

```md
---
description: 生成周报
argument-hint: [本周重点]
---

请根据本周的 git log 生成一份周报, 重点关注:
$ARGUMENTS
```

- frontmatter 只支持 `description` 和 `argument-hint` (解析失败时忽略 frontmatter, 保留正文)
- 自定义命令固定是 prompt 类型, `$ARGUMENTS` 占位符替换用户参数
- description 缺省是 "custom command"

## 使用频率追踪

`CommandUsageTracker` 将命令使用记录持久化到 `${workDir}/.yukino/command_usage.json` (usageCount + lastUsedAt):

- 得分 = 使用次数 × recency 权重 (半衰期 7 天, 下限 0.1)
- 输入补全时按得分取最近使用的 5 个命令优先展示

## prompt 命令

prompt 类型的命令由 CLI 构造 prompt 发送给 LLM API, 消耗 token; 来源有两类: 用户自定义命令 (上文) 和自动注册的 inline skill (见 skills)
