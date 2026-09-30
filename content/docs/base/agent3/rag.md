---
title: "RAG"
---

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

不参与
