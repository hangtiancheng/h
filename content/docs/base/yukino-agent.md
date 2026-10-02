---
title: "Yukino Agent"
---

# Yukino Agent

## LLM

token: 大模型处理文本的基本单位

- 中文 1 个汉字 1 个 token
- 英文 4 个字母 1 个 token

角色

- system: 系统提示
- user: 用户输入
- assistant: 模型输出

## RAG

1. 将文档切割为 chunk
2. 通过 embedding 模型将 chunk 转换为 chuck 向量
3. 将 chuck 向量、chuck 原文、元信息存储到向量库

```json
{
  "content": "iPhone17 支持 7 天无理由退货",
  "vector": [0.12, 0.34, -0.56, 0.78, ...],
  "metadata": {
    // ...
  }
}
```

用户问题

1. 通过 embedding 模型将用户问题转换为 query 向量
2. **召回**: 通过向量数据库, 对 query 向量进行相似度搜索, 召回 topK 个最相似的候选 chuck
3. **重排**: 拼接问题和召回的 chuck 原文, 输入到 rerank 模型 (使用 cross-encoder 交叉编码), 输出召回的 chuck 的相关性得分, 取 top3 个最相关的 chunk
4. **精排** (optional):

```md
请根据以下参考资料回答用户问题

参考资料

1. xxx
2. yyy
3. zzz
```

Agent 判断是否需要检索知识库
-> 调用 knowledge_retrieval 工具, 工具会校验知识库权限, 并行双路召回 (RAG 相似度搜索 + BM25 全文检索)
-> 过滤未授权文档
-> 粗排: RRF 倒排融合、同时去重, 保留 top30 (limit=30)
-> 精排: 精排使用更慢、质量更高的 rerank 模型 (qwen3.7-text-rerank), 保留 top5 (limit=5)

RAG 相似度搜索和 BM25 全文检索的分数量纲不同, 粗排 (RRF 倒排融合) 时, 不比较分数, 只比较排名: 一路召回中, 每份文档贡献 `1 / (k + 排名)` 分数; 两路召回贡献分数相加, k 通常取 60

## 对话 Agent (ReAct)

将用户问题通过 embedding 模型转换为 query 向量, 向量数据库执行相似度搜索, 召回相关文档

prompt

```
用户问题 ${content}
RAG 召回的相关文档 ${documents}
当前时间 ${date}
历史消息 ${history}
```

ReAct: Reasoning -> Acting -> Observation

## 运维 Agent (Plan-Execute-Replan)

1. 根据告警消息, 提取关键信息: 服务名、接口名、错误类型、时间范围
2. 调用日志平台 API 搜索日志, 调用监控平台 API 查询指标
3. 错误归因, 输出故障处理方案

场景: 订单服务接口失败率超过 25%, Agent 故障排查流程

1. 调用日志平台 API, 搜索最近 1 小时包含错误关键词的日志
2. Agent 发现 90% 的错误日志都是 context cancelled, 通常意味着请求超时被取消
3. 调用监控平台 API, 拉去下游支付服务的响应时间指标
4. Agent 发现下游支付服务的 P99 响应时间 (即 99% 的请求都在该时间内完成) 从 200ms 飙升道 3s
5. 查询知识库, 找到文档: 下游支付服务响应时间异常导致 context cancelled -> 确认下游支付服务是否在发布
6. 总结故障排查流程, 更新知识库

## Plan-Execute-Replan

Plan-Execute-Replan 是一种 Multi-Agent 多 agent 协作的任务执行模式, 核心是先拆分步骤, 再按计划执行, 动态调整

| 角色       | 对应组件  | 做什么                         |
| ---------- | --------- | ------------------------------ |
| 计划者     | Planner   | 拿到目标后, 拆解为分步骤的计划 |
| 执行者     | Executor  | 按计划、分步骤的执行           |
| 计划调整者 | Replanner | 审查执行结果, 决定是否调整计划 |

- Planner: 接收用户需求, 生成结构化的 (分步骤的) 计划
- Executor: 按计划、分步骤的执行
- Replanner: Executor 每执行一步, Replanner 都会介入
  1. 步骤完成, 结果正确 -> Planner 继续
  2. 步骤未完成, 结果错误 -> 调整计划
  3. 所有步骤完成 -> 任务结束, 输出报告

## ReAct 对比 Plan-Execute-Replan

|                | ReAct                              | Plan-Execute-Replan                           |
| -------------- | ---------------------------------- | --------------------------------------------- |
| 思路           | Reasoning -> Acting -> Observation | 先拆分步骤, 再按计划执行, 动态调整            |
| 有没有全局计划 | 没有                               | 有                                            |
| 场景           | 通用                               | 多步骤的复杂任务, 例如运维排查                |
| 执行进度       | 可以观测                           | 方便观测                                      |
| 反馈           | 工具调用                           | 工具调用和 replan 机制调整计划                |
| Agent 数量     | 通常是单 Agent                     | 多 agent 协作: Planner + Executor + Replanner |

## Tool 和 MCP

### 对话 Agent

- query_internal_docs: RAG 文档检索工具

### 运维 Agent

- query_internal_docs: RAG 文档检索工具
- query_prometheus_alerts: 查询告警详情, 调用 prometheus 告警查询接口 GET /api/v1/alerts, 结构化输出
  - alertname 告警名称
  - description 告警详情
  - activeAt 告警触发时间
- query_log: 日志搜索工具
