---
title: "Worktree"
---

文件系统隔离

subagent / teammate 指定 `isolation: "worktree"` 时, 在独立的 git worktree 中工作: 并发的文件修改互不覆盖, 结果由主 agent 决定是否合并; 用户也可以直接调用 EnterWorktree / ExitWorktree 工具

## 路径与分支格式

```js
const worktreeDir = join(gitRoot, ".yukino", "worktrees", slug);
const branch = `worktree-${slug}`;
```

- worktree 目录在仓库根的 `.yukino/worktrees/` 下
- 分支名加 `worktree-` 前缀
- slug 需要安全校验, 防止路径遍历 (../../etc/passwd): EnterWorktree 工具要求 slug 匹配 `/^[a-zA-Z0-9_-]+$/`; ref 名另有 isSafeRefName 校验 (拒绝空串、以 `-` 或 `/` 开头、包含 `..`、任何一段为 `.` 或空, 字符集限定 `[a-zA-Z0-9/._+@-]`)
- subagent 的 worktree slug 自动生成: `agent-a<7位hex>`

## git worktree 命令

```bash
# 分支不存在: 创建新分支
git worktree add -b worktree-<slug> -- <worktreeDir>

# 分支已存在: 重挂现有分支 tip, 不重置
git worktree add -- <worktreeDir> worktree-<slug>
```

分支已存在时用重挂而不是强制覆盖 (`-B`): 并发场景下另一个 agent 可能刚在这个分支上提交了工作, `-B` 会把分支重置到 base, 悄悄丢掉这些提交

目录已存在时的复用: 先验证它确实是这个 worktree 的根 (`git rev-parse --show-toplevel` + realpath 对比), 是则直接复用, 不是则报错; 避免把无关目录当成 worktree 使用

## HEAD 读取: 纯文件系统优先

创建 worktree 后要拿到 HEAD 的 commit SHA (退出时做变更检测的基准), `git worktree add` 之后立刻 `git rev-parse HEAD` 需要 spawn 子进程, 而读 HEAD 有纯文件系统的捷径 (目标 10ms 以内, 失败再回退 `git rev-parse HEAD`):

1. 读 worktree 目录下的 `.git` 指针文件, 得到 gitdir 路径
2. 读 gitdir 下的 HEAD 文件
3. HEAD 是符号引用 (`ref: refs/heads/...`) 时, 先查 gitdir 的 refs, 再查 commondir 的 refs 和 packed-refs, 解析出 commit SHA (支持 SHA-1 40 位和 SHA-256 64 位)

## worktree 创建后

`performPostCreationSetup` 创建后执行, 所有步骤 best-effort (失败只记日志, 不中断创建):

1. 复制 `.yukino/` 配置的允许清单: `permissions.yaml`、`agents`、`commands`、`memory`; 运行态目录 (sessions、file-history、plans、logs、teams) 明确排除, `worktrees/` 绝不复制 (否则复制源包含目标目录)
2. 复制 `.agents/` 的允许清单: `AGENTS.md`、`skills`
3. 共享 git hooks: worktree 没有既有 `core.hooksPath` 且仓库根存在 `.husky/` 目录时, `git config extensions.worktreeConfig true` + `git config --worktree core.hooksPath <.husky 绝对路径>`; worktree 级配置, 不污染主仓库的共享配置
4. node_modules 符号链接: 源仓库有 node_modules 而 worktree 没有时, 直接 symlink, 免去重装依赖
5. 读取 `.worktreeinclude` 文件 (每行一个路径, 跳过空行和 `#` 注释, 跳过包含 `..` 的行), 将 include 的文件和目录复制到 worktree, 单项失败跳过

没有自动的依赖安装步骤 (pnpm install / go mod tidy): node_modules 靠 symlink, 其他生态靠 .worktreeinclude 或用户在 worktree 内自行安装

## 进入 worktree

- 不切换进程级 cwd: 防止后台异步 subagent、agent team 并发调用 Bash 工具时互相踩 cwd
- worktree 路径写入工具调用的 workDir 覆盖, subagent 调用 Bash、ReadFile、WriteFile 等工具时在 worktree 内解析路径
- subagent 的 prompt 前置一条 worktree 通知 (buildWorktreeNotice):

```txt
You are working in a git worktree at: <wtPath>
The parent project is at: <parentCwd>
Changes made here are isolated from the parent working tree.
```

- 你 (subagent) 继承父 agent 的对话历史
- 你 (subagent) 在 git worktree 工作, 你需要翻译父 agent 对话历史中的路径为 worktree 中的路径, 修改文件前重新读取文件

## 退出 worktree

ExitWorktree 工具的参数: `path`、`branch`、`git_root` 必填, `head_commit` 可选 (worktree 创建时的 HEAD SHA)

变更检测 `hasWorktreeChanges(path, headCommit)`:

```bash
# 是否有未 commit 的修改
git status --porcelain

# 当前 HEAD SHA 是否等于 headCommit (worktree 创建时的基准)
git rev-parse HEAD
```

- porcelain 输出非空 → 有变更
- HEAD SHA ≠ headCommit → 有新 commit
- 检测本身报错 → 保守返回有变更

退出策略 (没有交互式确认, 按检测结果直接决定):

- 没传 head_commit: 无法判断新增 commit, 保留 worktree 并在输出中说明
- 无变更: 清理

```bash
git worktree remove -- <path>   # git 自己会复查 dirty/locked
git branch -d -- <branch>       # -d 而不是 -D: 分支有未合并提交时拒绝删除, 保留 tip
```

- 有变更: 保留 worktree, 输出提示路径, 等待主 agent 或用户处理

## 清理

没有按前缀扫描的定时 GC: worktree 的唯一自动删除路径是 ExitWorktree 判定无变更时的清理; subagent 结束后 worktree 显式保留 (输出 `Worktree retained at: <path>`), 有变更的 worktree 永远不自动删除

> 进程崩溃、用户强制退出, 会导致 .yukino/worktrees 下残留 worktree 目录; 用户可以调用 Bash 工具执行 `git worktree list` / `git worktree remove` 手动清理, 或 /worktree 命令查看列表

## worktree 与 subagent

subagent 使用 `isolation: "worktree"` 时, subagent 的启动流程

1. 创建 worktree
2. 创建 subagent, 工具调用的 workDir 替换为 worktree 路径
3. 运行 subagent
4. subagent loop 结束后在 worktree 中提交
5. worktree 保留, 返回结果给主 agent (附 worktree 路径)
6. 主 agent review, 决定是否合并

> 考虑以下场景

subagent 在 worktree 中修改并提交了 server.ts, 主 agent 期望将该 subagent 的变更 merge/rebase/cherry-pick 到主分支; Yukino 没有内置的 merge/rebase/cherry-pick 工具, 主 agent 调用 Bash 工具, 执行 `git merge/rebase/cherry-pick`

为什么 Yukino 没有将 merge/rebase/cherry-pick 作为内置工具?

- merge/rebase/cherry-pick 不是 Agent 的原子操作
- 主 agent 可以调用 Bash 工具执行 git 命令
- 主 agent 需要调用 ReadFile 工具查看冲突文件, 以确定 merge/rebase/cherry-pick 顺序和冲突解决策略
- merge/rebase/cherry-pick 失败时, 主 agent 需要调用 Bash 工具 abort
