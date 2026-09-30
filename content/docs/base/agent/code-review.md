---
title: "Code Review"
---

`/code-review` 背后是一个独立的代码审查子系统 (src/code-review/, 约 3k 行): 不是「让主 agent 顺手 review 一下」, 而是一条确定性的流水线 + 一组并发的小审查 agent

为什么要独立子系统:

- 审查的范围是 diff, 不是对话: 需要精确的 git diff 采集、解析、分组
- 审查的输出要能落地: 评论必须定位到文件和行号, 才能被主 agent 或人直接消费
- 大变更需要并发: 一个 500 文件的 PR 塞不进一个上下文, 要分组并行审查再汇总

## 入口与审查范围

终端 UI 输入 `/code-review` 打开表单, 5 个字段: Focus (审查重点)、From、To、Commit、Exclude (glob, `;` 或换行分隔); remote 模式经 code_review_start WS 消息触发同一个 runner

三种审查模式 (ReviewMode):

| 模式      | 触发条件  | diff 来源                                                                                       |
| --------- | --------- | ----------------------------------------------------------------------------------------------- |
| workspace | 无 ref    | `git diff HEAD` (staged + unstaged) + 合成的 untracked 文件 diff; 无 commit 的仓库回退 --staged |
| range     | from + to | `git diff merge-base(from, to)..to`                                                             |
| commit    | commit    | `git show --diff-merges=first-parent <commit>`                                                  |

diff 采集的统一 git 旗标: `core.quotepath=false --no-ext-diff --no-textconv --find-renames --src-prefix=a/ --dst-prefix=b/ --no-color -U3`, maxBuffer 256MB; untracked 文件用 `ls-files -z` 枚举 (防文件名含换行), 前 8000 字节嗅探 NUL 判二进制, 超过 10MB 按 binary 上报

## 流水线

```txt
validateReviewInput     校验: commit 与 from/to 互斥、from/to 成对、ref 不得以 - 开头
  -> collectDiffs       git diff 采集 + 解析 (diff-parser: hunk 头、rename、binary、增删统计)
  -> selectFiles        确定性文件筛选
  -> groupDiffs         LLM 语义分组 (失败回退确定性切块)
  -> worker pool        每组一个审查 agent, 默认并发 3
  -> finalizeComments   去重、排序、汇总报告
```

进度经 onProgress 上报 7 个 phase: diff / selection / grouping / plan / review / filter / done (终端和浏览器 UI 都渲染进度条)

### 文件筛选 (selectFiles)

确定性规则, 排除原因四类:

- binary: 二进制文件
- user-rule: 命中 Exclude glob (minimatch, dot: true)
- deleted: 已删除的文件 (保留在 prompt 上下文中, 但从不派发审查)
- too-large: 单文件 diff token 超限 (上限 = contextWindow × 0.8, 无窗口信息时回退 160k; token 估算 = 字符数 / 4)

锁文件/凭据/扩展名的静态黑名单有意不做: 语义分组和审查 agent 自己会忽略噪音, 硬编码名单只会误伤

### 语义分组 (groupDiffs)

请求 LLM 把文件按「一起改动才有意义」分组 (同一功能的实现 + 测试 + 文档进一组):

- 少于 4 个文件不分组; 每组最多 10 个文件; 每组 token 预算 60k
- 输入是零基索引的文件清单 `[0] MODIFIED path (+12/-3)`, 输出索引数组
- LLM 分组失败或超限时, 回退确定性切块: 按 diff 顺序先按文件数切、再按 token 预算切

## 每组审查 agent

每组是一个独立的小 agent (runGroupAgent):

- 新建 ToolRegistry, 只注册 5 个只读工具: CodeComment、FileReadDiff、ReadFile、Grep、Glob
- 新建 ConversationManager + Agent (maxIterations 50), PermissionChecker 用 default 模式; 审查工具全是 category read, 自动放行; write/command 工具根本不存在
- 每组一个独立的 persona client (绑定审查 system prompt), 避免跨组泄漏 max-output 升级等状态; 分组/plan/filter/relocate 等一次性调用共用一个 thinking off 的 util client

### 两阶段执行

1. plan 阶段 (仅大组): 最大文件 ≥50 行, 或组内 ≥2 文件且总变更 ≥100 行时, 先让审查 agent 产出一份审查计划 (Summary + Issues[severity] + 上下文指引); 失败降级为无 plan; 第 2 轮起剥离 plan
2. 主循环 (最多 maxRounds = 2 轮): 审查 agent 读 diff、读文件、grep 上下文, 调用 CodeComment 工具提交发现; 本轮没有新的确认发现、或累计确认数达到 30 条上限时停止
3. 每轮结束跑一次反思过滤 (filterComments): 只允许删除「被 diff 本身证明是错的」评论, 默认批准, 解析失败全部批准; 过滤器是防误报的, 不是二次审查
4. agent 既没调用工具也没有发现时, 追加一次 nudge 重试

### 评论的定位管线

评论必须锚定到文件和行号, CodeComment 工具要求 `existing_code` (逐字代码锚点), 定位按四级管线依次尝试:

1. hunk 匹配: 锚点在 diff hunk 的新侧/旧侧连续行中匹配 (归一化空白和 +/- 前缀)
2. 文件内容匹配: 在完整新文件内容上滑窗匹配 (空行不打断连续)
3. 跨文件搜索: 锚点在整个 changeset 内找唯一归属 (0 个或多个命中都放弃)
4. LLM 重定位: 最后手段, 提取修正后的代码片段重跑确定性解析; 失败恢复原锚点 (防止污染过滤证据)

resolution 记录定位方式: hunk / file-content / cross-file / llm / unresolved

### FileReadDiff 工具

range/commit 模式审查的是历史版本, 工作区的文件可能已经变了; FileReadDiff 返回 changeset 中任意文件的完整 diff (包括组外和已删除的文件), 避免审查 agent 用 ReadFile 读到错误的工作区副本

## 评论模型与报告

```ts
interface ReviewComment {
  path: string;
  content: string;
  suggestionCode?: string;
  existingCode: string; // 逐字锚点
  startLine: number;
  endLine: number;
  category:
    | "bug"
    | "security"
    | "performance"
    | "maintainability"
    | "test"
    | "style"
    | "documentation"
    | "other";
  severity: "critical" | "high" | "medium" | "low";
  resolution: "hunk" | "file-content" | "cross-file" | "llm" | "unresolved";
  groupLabel?: string;
}
```

汇总: 按 path + startLine + content 去重, 按 path → 行号 → severity 排序

报告是 Markdown, severity 图标 critical 🔴 / high 🟠 / medium 🟡 / low 无图标, 头部统计 (files changed / reviewed / groups / excluded / filtered / aborted), 按文件分节:

```md
### src/agent/index.ts

🟠 **[high] bug** — src/agent/index.ts:412-418

abort 之后仍然提交了工具结果...

Suggestion:
if (this.abortSignal?.aborted) { ... }
```

行号未定位成功的评论显示 `(line unresolved)`

## 与会话的集成

- 报告经流式文本输出到终端/浏览器
- 有发现时, 报告还会作为 `<code_review_findings>` system-reminder 注入当前会话; 主 agent 在下一轮可以直接按发现清单修复问题, 不需要用户复制粘贴
