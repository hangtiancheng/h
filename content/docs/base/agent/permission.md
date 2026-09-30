---
title: "Permission"
---

## 三种攻击

- prompt 注入
- 越权
- 数据泄露

## 多层防御

1. 危险命令拦截, 例如 rm -rf / 绝对拒绝
2. 路径沙箱: 工作目录外的文件操作需要用户确认
   - 计算绝对路径
   - 解析符号链接 TODO
   - 检查路径前缀, 判断是否在工作目录内
3. 权限规则
   - `allow: ["Bash(git *)"]`
4. 权限模式
   - plan: 读放行, 写确认, shell 命令确认; 通过 prompt 约束 LLM 行为, 使得 LLM 只读
   - default: 读放行, 写确认, shell 命令确认
   - acceptEdits: 读写放行, shell 命令确认
   - bypassPermissions: 绕过权限, 读/写/ shell 命令全部放行, 但仍然拒绝 rm -rf / 等危险命令
5. HITL (Human-in-the-Loop): 人在回路, 用户确认

## 第 1 层: 命令分类 (安全命令自动放行 / 危险命令拦截)

命令分类只针对 command 类工具 (Bash); ReadFile, WriteFile 工有路径沙箱保护

```js
const DANGEROUS_PATTERNS: DangerousPattern[] = [];
```

**安全只读命令自动放行**: `SAFE_PREFIXES` 列举了一批只读命令前缀 (cat, echo, grep, head, ls, pwd, stat, tail, ...), `isSafeCommand` 判断命令是否以安全前缀开头, 并且拒绝包含任何 shell 元字符 (& | ; < > ` ( ) { } [ ] 等) 的命令, 防止通过管道/链式/重定向绕过

```js
// 源码: src/permissions/index.ts
export function isSafeCommand(command: string): boolean {
  const trimmed = command.trim();
  // 拒绝包含 shell 元字符的命令: cat 等安全前缀不能成为管道/链式/重定向的入口
  if (/[\r\n&|;<>`(){}[\]]/.test(trimmed)) {
    return false;
  }
  return SAFE_PREFIXES.some((prefix) => {
    // 字符串前缀精确匹配, 或正则匹配
    ...
  });
}
```

命中 `isSafeCommand` 的命令直接 `allow` (reason: "Safe read-only command"), 不需要用户确认; 未命中的命令继续走后续沙箱、规则、权限模式、HITL

## 第 2 层: 路径沙箱

- 计算绝对路径 (通过 path.resolve)
- 解析符号链接
- 检查路径前缀, 判断是否在允许的目录内
- 默认允许两个目录
  - 项目根目录 (启动 Agent 的工作目录)
  - 系统临时目录 (`os.tmpdir()`, MacOS 是 /var/folders, /tmp, Linux 是 /tmp, /var/tmp)

## 第 3 层: 权限规则

权限规则

- 允许执行 git push, 但不允许执行 `git push --force`
- 允许读取 src/ 目录下的文件, 但不允许读取 .env 文件
- 允许运行 pnpm lint, 但不允许运行 pnpm lint:fix

### Claude jsonl 配置

```jsonl
// 权限规则 (json)
{
  "permissions": {
    "allow": ["Bash(pnpm add *)", "Bash(pnpm dev)"]
  }
}

// 权限模式 (json)
{
  "permissions": {
    "defaultMode": "auto"
  },
}
```

- 本地规则 .yukino/permissions.local.yaml (优先级最高)
- 项目规则 .yukino/permissions.yaml
- 全局规则 ~/.yukino/permissions.yaml (优先级最低)

```yaml
# 权限规则 (yaml)
- rule: Bash(git *)
  effect: allow

- rule: Bash(git push --force*)
  effect: deny

- rule: ReadFile(/path/to/src/*)
  effect: allow

- rule: ReadFile(*.env*)
  effect: deny

- rule: EditFile(*.ts)
  effect: allow
```

```js
function evaluate(toolName, content) {
  for (const path of [userPath, projectPath, localPath]) {
    const rules = loadRulesFile(path);
    // 从后往前遍历, 后面的规则覆盖前面的规则
    for (let i = rules.length - 1; i >= 0; i--) {
      const r = rules[i];
      if (r.tool !== toolName && r.tool !== "*") continue;
      if (globMatch(r.pattern, content)) {
        return r.effect; // 返回 "allow" 或 "deny"
      }
    }
  }
  return null; // 无匹配规则
}
```

## 第 4 层: 权限模式

- plan: 读放行, 写确认, shell 命令确认; 通过 prompt 约束 LLM 行为, 使得 LLM 只读
- default: 读放行, 写确认, shell 命令确认
- acceptEdits: 读写放行, shell 命令确认
- bypassPermissions: 绕过权限, 读/写/ shell 命令全部放行, 但仍然拒绝 rm -rf / 等危险命令

| 模式              | 只读工具 (read) | 写工具 (write) | 命令工具 (command) |
| ----------------- | --------------- | -------------- | ------------------ |
| default           | Allow           | Ask            | Ask                |
| acceptEdits       | Allow           | Allow          | Ask                |
| plan              | Allow           | Ask            | Ask                |
| bypassPermissions | Allow           | Allow          | Allow              |

## 第 5 层: HITL 人在回路

前 4 层都无法确认时, 权限系统会阻塞 agent loop, 弹出对话框让用户确认; 提供「始终允许」选项; 需要确认时, 发送一个权限请求 (permission_request) 事件到事件流, 阻塞等待用户确认; 如果用户选择「始终允许」, 则会将新规则 (CLI 生成) 追加到本地配置文件

权限被拒绝时, 将权限拒绝作为一个 `isError: true` 的工具调用结果返回给 LLM, agent loop 继续运行; LLM 在下一轮 agent loop turn 中看到这个工具调用错误, 调整策略

## OS 级沙箱

- MacOS: seatbelt, 通过一个策略文件定义进程的行为边界
- Linux: bubblewrap + seccomp, bubblewrap 是一个轻量级的用户空间容器工具, 通过 linux 的 namespace 机制创建一个隔离环境, 通过 bubblewrap 执行命令
- OS 级沙箱模式默认断网, 防止数据泄漏
- OS 级沙箱不需要弹权限请求对话框, 用户可以通过 /sandbox 命令在三种模式间切换
  - 开启沙箱 + autoAllow 自动放行
  - 开启沙箱 + 手动确认
  - 关闭沙箱

```txt
(version 1)
(deny default) ;; 默认拒绝
(allow process-exec) ;; 允许执行程序
(allow process-fork) ;; 允许 fork 子进程
(allow file-read* (subpath "/")) ;; 允许读整个文件系统
(allow file-write* (subpath "/project")) ;; 只允许写项目目录
(allow file-write* (subpath "/tmp")) ;; 只允许写临时目录
(deny file-write* (subpath "/project/.yukino/config.yaml")) ;; 禁止写配置文件
(deny network*) ;; 禁止访问网络
```

```bash
bwrap \
--unshare-user \                  # 独立的用户 namespace
--unshare-pid \                   # 独立的进程 namespace
--ro-bind / / \                   # 整个文件系统挂载为只读
--bind /project /project \        # 项目目录可写
--ro-bind /project/.yukino/config.yaml /project/.yukino/config.yaml \  # 配置文件挂载为只读
--unshare-net \                   # 独立的网络 namespace, 禁止访问网络
--proc /proc \                    # 独立的 proc
bash -C "用户命令"
```

seccomp 在系统调用入口过滤: 可以禁止 ptrace 防止调试注入、禁止 mount 防止重新挂载文件系统以逃逸命名空间

### 禁止写项目目录内的敏感路径

- .yukino/config.yaml
- .yukino/permissions.local.yaml
- .yukino/skills
