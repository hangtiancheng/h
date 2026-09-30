---
title: "可观测性和数据飞轮"
---

一个请求对应一个 trace 树; 例如LLM API、文档检索、工具调用等, 都是 trace 树的 span 节点

## langfuse

```ts
import { CallbackHandler } from "@langfuse/langchain";

export function graphCallbacks(
  sessionId: number,
  userId?: string,
): CallbackHandler[] {
  return [
    new CallbackHandler({
      sessionId: String(sessionId),
      ...(userId ? { userId } : {}),
      tags: ["chat-turn"],
    }),
  ];
}

function graphConfig(conversationId: number, userId: string) {
  return {
    configurable: { thread_id: String(conversationId) },
    metadata: { langfuse_session_id: String(conversationId) },
    callbacks: graphCallbacks(conversationId, userId),
  };
}

await buildGraph().invoke(graphConfig(conversationId, userId));
```

langgraph 跑图时, 会对每个节点的输入/输出发射信号, langfuse 接收这些信号, 得到 trace 树, 包括每个节点的 prompt 输入、output 输出、时间消耗和 token 消耗

## 防劣化

trace 可以看到某一条请求, 但是更新知识库/prompt、更换某个节点的模型, 都可能降低某类问题的准确率; 通过「自动化评测流水线」防劣化

按意图分类统计的 token 账单

- 订单、物流: 使用 flash 模型
- 商品咨询、退换货、退款、售后: 使用 pro 模型

## bad case 处理: 数据飞轮

对于 agent 无法回答、回答错误的问题, 记录这些问题, 判断是否需要更新知识库/prompt; 这个从用户交互收集问题, 优化系统的闭环就是数据飞轮

### 数据飞轮的入口

1. 置信度, 例如知识类问题的文档检索
   - 向量相似度搜索后第一条的相关性得分, 低于 0.5 推入到数据飞轮; 第一条和第二条相关性得分的差距
   - BM25 关键词检索命中的关键词数量
   - 精排后第一条的相关性得分; 第一条和第二条相关性得分的差距
2. 进入主力 agent loop 前, 有一道置信度闸: 判断检索到的知识是否足够回答该问题, 如果不够, 则回复兜底话术, 同时记录该问题, 推入到数据飞轮
3. 用户对 Agent 生成的消息点踩

## 数据飞轮

步骤

1. 问题标准化: 「iPhone17 使用一周就黑屏了, 好垃圾! 能退吗」-> 「iPhone17 使用一周, 有质量问题 (例如黑屏) 能否退货」
2. 问题去重: 将已标准化的、待审队列中排队的候选问题集合输入给 LLM, LLM 判断当前问题是否在候选问题集合中, 如果在则增加该问题的计数, 计数越多问题优先级越高
3. 审核的注意点
   - 过滤垃圾样本
   - 过滤强时效性、临期/过期的样本
   - 过滤计数极少的冷门样本

```json
{
  "normalized_question": "iPhone17 使用一周, 有质量问题 (例如黑屏) 能否退货",
  "matched_question_id": 228,
  "ai_suggested_answer": "..."
}
```

4. 数据飞轮积累了多条问题, 通过微调的小型分类器, 以了解哪些主题 (物流/发票/退换货/退款...) 的问题容易被推入到数据飞轮, 明确优先补充哪些主题的知识库, 对比 LLM 逐条打标又快又省
