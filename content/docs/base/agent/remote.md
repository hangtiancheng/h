---
title: "Remote"
---

Remote 模式把 Yukino 变成一个本地 Web 服务: Express HTTP 服务器 + WebSocket 桥, 浏览器打开一个 React 前端, 与终端 UI 功能对齐的聊天界面

场景: 手机/平板访问开发机上的 agent、长跑任务放到服务器上跑、把 Yukino 嵌进自己的 Web 工作台

## 启动

```bash
yukino --remote                  # 监听 127.0.0.1:18888
yukino --remote 9000             # 自定义 loopback 端口 (":9000" 也可以)
yukino --remote 0.0.0.0:9000     # 显式暴露到所有网卡 (没有内置鉴权)
yukino --remote 0                # OS 分配端口, 实际地址打印到 stderr
```

- 默认只绑定 loopback; 绑定非 loopback 地址必须显式写 host; remote 没有内置鉴权, 暴露到网络上等于把代码执行能力暴露到网络上, 需要自己套反向代理 + 认证
- 端口 0 时 OS 选空闲端口, 启动后 stderr 打印 `Remote server listening at http://127.0.0.1:<port>`
- HTTP 服务器托管打包好的浏览器前端 (src/remote/fe 单独构建, `pnpm build:fe`), WebSocket 挂在同端口

## 架构

```txt
浏览器 (React 前端)
   |  WebSocket (JSON 帧, zod discriminated union 校验)
   v
RemoteServer (Express + ws)
   |  bridgeEvent: AgentEvent -> WS 消息
   v
RemoteAgentHandle (封装全部 agent 状态)
   ├── LLMClient (provider 可切换)
   ├── ToolRegistry (17 个内置工具 + skills + teams + MCP)
   ├── ConversationManager + 会话持久化
   ├── PermissionChecker (权限请求转发到浏览器)
   ├── HookEngine / SkillCatalog / MemoryExtractor+Consolidator
   └── TeamManager (teammate 管理)
```

- agent 装配延迟创建: 启动时尝试 createRemoteAgent, 失败 (例如 provider 未配置) 则推迟到第一条消息时重试
- 与交互式 UI 共享同一套 Agent 循环和会话文件, remote 会话可以被 --resume 恢复
- 记忆的后台整理 (consolidation) 只在 remote 模式运行 (常驻进程适合跑周期任务)
- remote 的工具集与终端 UI 基本对齐, 差异: 无 WebFetch / SpawnTeammate / ListTeams / InstallSkill

## WebSocket 协议

JSON 帧 `{ type, data }`, 双向都有 zod 运行时校验

### client → server (7 种)

| type                   | data                                                     |
| ---------------------- | -------------------------------------------------------- |
| user_message           | `{ content }`                                            |
| permission_response    | `{ id, response: allow \| deny \| allowAlways }`         |
| ask_user_response      | `{ id, answers: Record<问题, 答案> }`                    |
| plan_approval_response | `{ choice: yolo \| manual \| feedback, feedback? }`      |
| code_review_start      | `{ background?, from?, to?, commit?, excludePatterns? }` |
| cancel                 | null (中断当前 agent loop)                               |
| ping                   | `{}` (心跳, 回 pong)                                     |

### server → client (28 种)

- 连接与会话: connected (session + cwd)、commands (slash 命令列表)、status (model/permissionMode/thinkingLevel 快照)、session_list、clear、command_done、pong
- 历史回放: replay_user、replay_assistant
- 流式输出: stream_text、stream_end、thinking_text
- 工具: tool_use (toolId/toolName/args)、tool_result (output/isError/elapsed)
- 交互: permission_request (id/toolName/description)、ask_user (questions)、plan_approval_request (planPath/planContent)、code_review_form、code_review_progress (phase/message/progress)
- steering: steering_queued、steering_delivered (流式期间追加消息)
- 生命周期: turn_complete (turn)、loop_complete (stopReason/totalTurns/elapsed)、usage (inputTokens/outputTokens)、error、compact、retry (reason/waitMs)

AgentEvent 到 WS 消息的转换在 bridgeEvent: agent loop 的事件流被逐条翻译成前端消息, 前端不感知 agent 内部结构

## 浏览器前端

技术栈: React 19 + tsup 构建 + Tailwind CSS v4, 打包为静态资源由 Express 托管

组件与终端 UI 的功能对齐:

- 消息流: message-list、user-message、assistant-message、system-message、error-message、thinking-block、streaming-cursor、tool-block (可折叠的工具调用卡片)、collapsible
- 交互对话框: permission-dialog、ask-user-dialog、plan-approval-dialog、code-review-dialog、session-picker、modal
- 输入与导航: input-area、slash-menu (斜杠命令补全)、welcome、review-progress、status-bar、done-indicator
- hooks: use-web-socket (连接与重连)、use-chat (消息 reducer, ChatItem 模型)、use-auto-scroll (跟随滚动, 用户上翻时暂停)

WebSocket 断开自动重连, 连接状态 connecting / connected / reconnecting 展示在状态栏

## 生命周期

`run()` 阻塞直到服务器停止; Ctrl+C/SIGTERM 的优雅关闭链:

1. 停止 HTTP/WS 服务器
2. 杀掉 detached 的后台 shell 和 teammate 进程
3. 断开 MCP 子进程
4. 记录真实退出码, 等遥测 flush
