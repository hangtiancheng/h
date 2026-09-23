# Workflow

1. 指代消解 (提示词优化): 多少钱? -> iPhone17 多少钱?
2. 意图识别: 用户问的是商品, 还是订单, 还是物流, 还是退换货/退款/售后, 还是投诉, **还是单纯闲聊**
3. 意图分流

- 闲聊: 回复固定话术
- 知识类问题: 检索
- 订单/物流等: 直接转 4
- 投诉: 先安慰, 再提供创建工单和转人工选项

4. 主 agent loop, 进入主 agent loop 前, 有一道置信度闸: 判断检索到的知识是否足够回答该问题, 如果不够, 则回复兜底话术、并提供创建工单和转人工选项; 同时记录该问题, 流转给后续的数据飞轮处理; 主 agent loop 要求记录日志, 记录模型的思维链、工具调用、token 消耗, 保证可观测性

## 主 agent loop

ReAct: Thinking -> Act -> Observe

2 种 agent loop 退出条件

1. LLM 决定退出循环: LLM API 响应中没有 tool_use, stop reason 是 end_turn (Anthropic)
2. 设置最大循环次数, 超过最大循环次数后强制退出循环; langchain 的 maxIteration 默认 15, claude 的 max turns 默认 ?

### 不用 workflow 全部使用 agent loop?

- 不确定性、不可观测
- 可能有遗漏, 例如 RAG
- 速度慢

## 意图识别

1. 关键词匹配
2. 训练一个分类器
3. LLM Prompt

### 意图数量很多?

- 两级分类
  - 1 级: 售前 / 物流 / 售后
  - 2 级: 细分意图
- RAG + 意图识别: RAG 召回最相关的 topK 个候选意图, 提供给模型选择

## 意图分流
