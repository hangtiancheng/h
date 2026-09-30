---
title: "工具调用"
---

## 告诉 LLM 有哪些工具

调用 LLM API 时, 可以通过 tools 参数告诉 LLM 有哪些工具, 包括名称 name, 描述 description, 参数格式 input_schema

```json
{
  "tools": [
    {
      "name": "ReadFile",
      "description": "Read a file and return its contents with line numbers.\n\nUsage Notes\n\n- The file_path should be an absolute path when possible.\n- By default reads up to 2000 lines from the beginning of the file.\n- Use offset and limit to read specific parts of large files. Only read what you need.\n- Results are returned with line numbers (1-based) for easy reference.\n- This tool can only read files, not directories. Use glob to list directory contents.\n- Do NOT re-read a file you just edited to verify -- EditFile would have errored if the change failed.",
      "input_schema": {
        "type": "object",
        "properties": {
          "file_path": {
            "type": "string",
            "description": "Absolute path to the file"
          },
          "offset": {
            "type": "integer",
            "description": "Line number to start from (0-based)",
            "default": 0
          },
          "limit": {
            "type": "integer",
            "description": "Max lines to read",
            "default": 2000
          }
        },
        "required": ["file_path"]
      }
    }
  ]
}
```

## LLM 决定调用工具

LLM 决定调用工具时, LLM API 的响应中包含一个结构化的工具调用请求

```json
{
  "role": "assistant",
  "content": [
    {
      "type": "text",
      "text": "Let me read the text content of this file."
    },
    {
      "type": "tool_use",
      "id": "toolu_123abc",
      "name": "ReadFile",
      "input": {
        "file_path": "src/main.go"
      }
    }
  ]
}
```

- 一个 LLM API 的响应中, 可以既包含文本内容块, 又包含工具调用请求内容块, 甚至同时请求调用多个工具
- 每个 tool_use 工具调用请求, 都有一个唯一 ID

## CLI 执行工具调用, 返回工具调用结果给 LLM API

- CLI 收到 tool_use 工具调用请求后, CLI 执行工具调用相关代码, 将工具调用结果返回给 LLM API

```jsonc
{
  // 执行工具调用, role 是 user
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      // 必须和 tool_use 工具调用请求的 ID 相同
      "tool_use_id": "toolu_123abc",
      "content": "1\tfunction main() {\n2\t  console.log(\"javascript newbie\")\n3\t}",
    },
  ],
}
```

## LLM 继续

LLM 收到工具调用结果, 继续...

LLM 负责决策, 请求调用工具; CLI 负责执行工具调用, 将工具调用结果返回给 LLM API

- LLM 决定是否调用某个工具时, 主要参考工具描述 (description), 工具描述的质量直接决定 LLM 的工具调用行为, 包括: 什么时候调用工具、调用哪个工具、如何传递参数
- 好的工具描述应该包括: 工具的核心功能、什么时候应该调用、什么时候不应该调用、输入参数的 schema、输出的工具调用结果的 schema、与其他工具的配合 (工作流建议, 例如对于大文件, 先 Grep 定位再 ReadFile 读文件)

## 工具接口设计

```ts
export type ToolCategory = "read" | "write" | "command";

export interface Tool {
  // 身份信息
  name: string;
  description: string;
  schema(): ToolSchema; // input_schema
  // 元信息
  category: ToolCategory; // 分类, 权限矩阵和并发默认值的依据
  deferred?: boolean; // 延迟加载 (只有 MCP 工具为 true, 内置工具永不 defer)
  isConcurrencySafe?(args): boolean; // 本次实参是否可并发 (缺省 fallback 到 category === "read")
  // 行为
  execute(ctx: ToolContext, args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolResult {
  output: string;
  // 多模态工具调用结果: 可选的富内容块
  contentBlocks?: ToolResultContentBlock[];
  // 工具执行失败对于 LLM 是有价值的反馈, 提示 LLM 调整策略
  isError: boolean;
}
```

- contentBlocks 支持的类型: text、image (base64 的 jpeg/png/gif/webp 或 url)、document (base64 PDF / 纯文本 / url)、tool_reference (native 延迟加载展开)、search_result
- ToolContext: workDir、toolCallId、sessionId、abortSignal、taskManager (后台任务, null 显式禁用)、fileHistory (文件快照)、fileStateCache (读写门禁)、permissionChecker、onPermissionRequest 等

## 内置工具

| 工具            | 分类    | 只读 | 破坏性 | 场景                 |
| --------------- | ------- | ---- | ------ | -------------------- |
| ReadFile        | read    | 是   | 否     | 读文件/读图片        |
| WriteFile       | write   | 否   | 否     | 创建或重写文件       |
| EditFile        | write   | 否   | 否     | 精确替换修改文件     |
| Bash            | command | 否   | 是     | 执行 shell 命令      |
| PowerShell      | command | 否   | 是     | Windows/pwsh 命令    |
| Glob            | read    | 是   | 否     | 查找文件名           |
| Grep            | read    | 是   | 否     | 查找文件内容         |
| WebFetch        | read    | 是   | 否     | 抓取 URL 转 Markdown |
| ComputerUse     | command | 否   | 是     | 操作本机 GUI         |
| AskUserQuestion | read    | 是   | 否     | 向用户提选择题       |

### ReadFile

- properties: file_path, offset, limit
- 元信息: 只读、非破坏性, `category: read`
- 行号: 读文件需要带行号前缀 `"1\tfunction main() {\n2\t..."` (1-based), 方便定位代码位置
- 大文件: offset 默认 0 (0-based), limit 默认 2000, 分段读文件; 尾部追加 `[N more lines in file. Use offset=X to continue.]`
- 输出预算: 单次输出上限 50KB; 整文件读取的准入上限 10MB (超过提示改用 Grep/head/tail)
- 图片: 按扩展名 (png/jpg/jpeg/gif/webp) 识别, 返回 `[Image: mediaType]` + base64 image 内容块, 忽略 offset/limit
- 读后校验: 重新 stat 比对 mtime/size, 读取期间文件被改则拒绝注册缓存并报错; 成功则 `fileStateCache.record(path, mtimeMs)`

### WriteFile / EditFile

WriteFile

- properties: file_path, content
- 创建或重写, 创建时递归创建父目录
- 读写门禁: 文件已存在 (或已在缓存中) 时, 必须先 ReadFile 才允许写; 全新文件跳过门禁
- 成功输出 `Successfully wrote to <path> (N lines)`

EditFile

- properties: file_path, old_string, new_string, replace_all
- old_string == new_string 直接报错; replace_all === false 时 old_string 必须唯一匹配
  - 匹配多个: `Error: old_string found N times in file. It must be unique. Add more surrounding context, or set replace_all to true`
  - 没有找到: `Error: old_string not found in file`, 说明 LLM 记忆的文件内容可能过时 (file-state-cache 会给出「文件已被修改, 重新读取」的提示)
- 成功输出包含 diff (前后缀公共行算法, 上下文 3 行, 200 行截断) 和 additions/removals 计数
- new_string 为空, 表示删除 old_string
- 替换使用函数形式避免 `$&` 等特殊替换; 写操作按 realpath 经文件互斥队列串行化, 不同文件并发
- 写前 fileHistory.trackEdit 备份原内容 (支持 /rewind 回退)

### Bash / PowerShell

Bash

- properties: command, timeout, run_in_background
- 工作目录: 项目根目录; 超时默认 120s, 上限 600s (超过钳制)
- 并发安全: `isConcurrencySafe(args) = isSafeCommand(command)` (权限层的安全命令白名单, 元字符命令不并发)
- 执行: `spawn("bash", ["-c", command])`, detached 独立进程组; stdout+stderr 直写共享 fd (输出不经过 JS 堆, 后台化只是记账切换)
- 终止: SIGTERM, 3s 宽限后 SIGKILL; kill 整个进程组
- 输出: 前台截断上限 10MB, 后台任务 5GB; 500ms 轮询文件大小的 watchdog; UTF-8 安全截断
- 后台机制: `run_in_background: true` 显式后台 / Ctrl+B 手动转后台 / 超时自动转后台 (裸 sleep 命令不自动转, 防止把 sleep 循环当任务); 后台输出写入会话目录的 `shell-<hex>.output` 文件, 完成通知的正文预算 30KB, 超过则通知携带文件路径 + 预览
- 退出码提示: 非零退出码附加语义提示 (grep/rg 的 1 是没有匹配, diff 的 1 是文件有差异, git 的 128 是 fatal, 126/127/130/137/143 等通用信号码)

PowerShell

- win32 用 `powershell.exe`, 其他平台用 `pwsh`; Windows 推荐用它替代 Bash
- 参数 `-NoProfile -NonInteractive -ExecutionPolicy Bypass -Command`, 输出编码强制 UTF-8
- 进程树终止用 `taskkill /T`; 没有沙箱包装 (OS 沙箱只包 bash)

### Glob

- properties: pattern, path
- glob 查找文件名; 搜索结果按修改时间倒序, 同 mtime 字典序; 最多返回 1000 个匹配结果
- 默认包含 dotfiles, 跳过固定目录 (.git/.yukino/.agents/node_modules/dist/\_\_pycache\_\_ 等), 符号链接目录不下钻
- 无匹配输出 "No files matched the pattern."

### Grep

- properties: pattern, path, include
- grep 找文件内容; 输出格式 `文件路径:行号:匹配的内容` (1-based); 最多返回 500 个匹配行
- 正则是 JS 风格, 大小写不敏感 (iu 标志); `\w`、`\b`、`\d` 重写为 Unicode property escapes 以支持 CJK
- include 是 minimatch glob: 裸模式 (无 /) 匹配任意深度的文件名, 含 / 匹配 workDir 相对路径
- 二进制检测: 前 8KB 嗅探 NUL 字符; 超过 25MB 的文件跳过; 遍历上限 10000 个条目 / 深度 25

### WebFetch

- properties: url
- 仅 http/https; 重定向自动跟随, 最终 URL 不同时输出前缀 `[Redirected to ...]`
- 上限: 单响应 10MB (content-length 预检 + 实际字节复检), fetch 超时 60s, Markdown 截断 100k 字符
- HTML → Markdown 用 turndown (移除 script/style); 二进制 content-type 拒绝
- 缓存: 按 URL 15 分钟 TTL, 总预算 50MB, 插入序最旧先逐出

### ComputerUse

- 操作本机 GUI: 截图、点击、输入、滚动、缩放; 动作集包括 key、type、left_click、double_click、drag、scroll、screenshot、zoom、wait 等, 兼容 OpenAI 风格的批量 actions[] (单批 ≤100, 批后强制返回截图)
- 平台实现: macOS 用 Swift helper + screencapture, Windows 用 PowerShell 编译 C# helper, Linux 用 xdotool + gnome-screenshot/scrot/import
- 坐标空间: 截图缩放到 ≤1366x900, 动作坐标以缩放空间为准, 内部换算回物理像素
- category 是 command, isConcurrencySafe 恒 false (GUI 操作必须串行)

### AskUserQuestion

- properties: `questions[1..4]`, 每题 `{ question, header (≤12 字符), options[2..4] { label, description? }, multiSelect }`
- UI 弹出选择对话框, 自动追加 "Other" 自定义输入项; 返回 `Record<问题文本, 答案>`
- 只在需要用户决策的材料性歧义时使用, 不重复请求已给出的授权

## 工具注册的装配

- 交互式 UI: createToolRegistry 注册 18 个基础工具, client 就绪后再注册 LoadSkill、InstallSkill、AskUserQuestion、Agent、SyntheticOutput 和团队工具 (TeamCreate、SpawnTeammate、SendMessage、ListTeams、TeamDelete、TaskStop)
- remote: 17 个基础工具 (无 WebFetch) + LoadSkill/AskUserQuestion/团队工具/Agent
- print 模式: 16 个 (无 todo/worktree/plan/skill/WebFetch)
- teammate 进程: 实施类工具 + SendMessage + 团队任务工具, 无 Agent/TeamCreate/TeamDelete (调用树终止)

## 流式 tool_use 解析: 拼接 partialJson JSON 碎片

```txt
# tool_use 块开始
content_block_start -> type: "tool_use", id: "toolu_123abc", name: "ReadFile"

# 传输 JSON 碎片
content_block_delta -> type: "input_json_delta", partial_json: "{"
content_block_delta -> type: "input_json_delta", partial_json: "\"path\""
content_block_delta -> type: "input_json_delta", partial_json: ": \"/main.js\"}"

# tool_use 块结束
content_block_stop
```

- 碎片累积完成后统一 JSON.parse; 解析失败不中断循环, parseError 作为错误工具结果反馈给 LLM 自纠
- tool_use 工具调用请求的 role 是 assistant, tool_result 工具调用结果的 role 是 user
- 一条 assistant 消息可能同时包含 text 内容块和 tool_use 内容块, 必须在同一条 assistant 消息中, 不能拆成两条 assistant 消息
- 如果一条 assistant 消息包含多个 tool_use 内容块, 即 LLM 请求同时调用多个工具, 则多个 tool_result 内容块必须在同一条 user 消息中, 通过 id 配对
