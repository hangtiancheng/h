---
title: "MCP 和 Skill"
---

# MCP 和 Skill

## MCP

MCP 的注入参数

```ts
defineTool({
  name: "create_ticket",
  description: "...",
  schema: createTicketSchema,
  injectConversation: true,
  handler: async (args) => {
    const { description, ticket_type } = createTicketSchema.parse(args);
    // 注入参数
    const conversationId =
      typeof args.conversation_id === "number" ? args.conversation_id : 0;
    const ticketNo = await repository.createTicket(
      conversationId,
      description,
      ticket_type,
    );
    return { ticket_no: ticketNo, status: "transferred" };
  },
});
```

1. 请求的幂等键: 携带幂等键 (Idempotency-Key) 的请求, 幂等有效期内, 保证副作用只执行一次
2. Audit 审计

- 什么时候调用什么工具
- 工具调用参数
- 工具调用结果
- 工具调用耗时
- 工具调用是成功还是失败

## Skill

1. 明确工具调用的顺序, 提高工具选择和调用的准确率
2. 可 (热) 更新、可复用、可移植
