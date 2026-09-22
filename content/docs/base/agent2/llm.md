---
title: "LLM"
---

## LLM API

- OpenAI: Chat Completions 协议
- Anthropic: Message 协议
- OpenAI: Responses API 协议

prompt 设计: agent 的角色、业务范围、行为约束

## 表设计

- faq: 问题描述、答案、问题类型
- conversation: 会话, 谁在什么时候开启的会话, 处理状态
- messages: 消息历史, 会话中每条消息, 以及对应的角色、内容
- tickets: 人工工单, 包括工单号、关联会话、问题描述、问题类型、处理状态、创建时间

## 工具设计

- query_order: 订单查询
- query_product: 商品查询
- query_logistics: 物流查询
- query_faq: 政策与常见问题查询
- create_ticket: 转人工工单

- 工具注册: LLM 返回的 tool_calls 字段中只有工具名, tool registry 保存工具名到工具的映射
- 工具调用容错:
  1. 参数不合法
  2. 查询为空
  3. 连接器故障与重试: 网络连接超时或断开、数据库连接断开、查询失败
  4. 对于 create_ticket 等写操作, 网络连接超时不代表工单创建失败
  - 方案 1: 写操作不自动重试
  - 方案 2: 写操作请求加「幂等键」, 同一个键重复提交只会写一次
