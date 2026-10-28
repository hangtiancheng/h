---
title: "分布式系统"
---

- 高并发
- 高性能
- 高可用: 容灾

分布式和微服务

- 多个机器, 每个机器跑单体服务: 是分布式, 不是微服务
- 微服务: 天然分布式部署

## CAP 理论

一个分布式系统中, 不可能同时满足: Consistency 数据一致性、Availability 高可用性、Partition Tolerance 分区容错性

- Consistency 数据一致性: 每个节点, 每次读都可以读到最新的数据副本, 否则返回错误 (线性一致性)
- Availability 高可用性: 每个未故障的节点收到请求后, 都必须在有限时间内返回非错误响应
- Partition Tolerance 分区容错性: 节点间的网络通信中断 (消息丢失或无限延迟) 时, 即发生了网络分区, 分布式系统仍然可以继续运行

网络分区时, 系统无法同时保证强数据一致性和高可用性

CAP 的 C 不等于 ACID 的 C: 前者是线性一致性, 后者是事务前后的数据一致性

网络分区是必然事件, P 是必选的, CA 是可选的:

- 选 C: 拒绝服务, 返回超时或错误 (CP, 例如 ZooKeeper、ETCD)
- 选 A: 继续响应, 允许读到旧数据 (AP, 例如 Apache Cassandra、Netflix Eureka)

## BASE 理论

BASE 理论是 CAP 中选择 AP 后的架构设计: 牺牲短暂的数据一致性, 换取分布式系统的高可用和高性能

- Basically Available 基本可用: 节点故障或者流量洪峰时, 允许损失部分可用性, 保护核心链路
  - 响应时间的妥协: 请求耗时从毫秒级退化到秒级
  - 功能的妥协: 非核心功能服务降级或熔断 (例如双 11 期间关闭评价等非核心功能)
- Soft State 软状态: 允许数据副本间存在中间状态, 并且该中间状态不影响分布式系统的整体可用性
  - 例: 主从复制延迟、缓存与数据库短暂不一致、多数据副本写入未收敛到一致状态
- Eventually Consistent 最终一致性: 短暂时间后, 所有数据副本收敛到一致状态
  - 收敛依赖显式机制 (幂等、重试、死信队列、...), 不是天然成立

## 分布式锁

### 使用 redis 实现分布式锁

redis 可以被多个客户端读写, 读写性能高, 可以保存分布式锁

- 如果 key 不存在, 则表示加锁成功
- 如果 key 存在, 则表示加锁失败

```lua
-- NX: 只有 lock_key 不存在时, 才执行 set 操作
-- PX: 过期时间 10s
-- SET lock_key unique_value NX PX 10000

-- Acquire Script
redis.call("SET", KEYS[1], ARGV[1], "NX", "PX", ARGV[2])
```

- 加锁包括: Get 读锁变量、Compare 检查锁变量和 Set 写锁变量, 需要使用原子操作 (NX)
- 锁变量需要设置过期时间, 防止锁的持有者崩溃, 导致锁无法被释放 (EX/PX)
- 锁变量的值是客户端的唯一标识, 防止锁被其他客户端错误释放

```lua
-- Release Script
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
else
  return 0
end
```

### 使用 etcd 实现分布式锁

etcd 为分布式应用提供分布式一致性服务, 基于 raft 协议保证数据一致性, 使用键值对存储数据

数据模型

- 租约 (Lease): 键值可以绑定一个租约, 客户端需要定期续约 (KeepAlive), 客户端崩溃后租约超时, 绑定的键值被自动删除
- 版本号 (Revision): 每个键值都有创建版本号 (CreateRevision) 和修改版本号 (ModRevision), 可以作为 CAS 的比较条件
- 事务 (Txn): 支持 if / then / else 结构, compare 与 put / delete 在同一个事务中原子执行

加锁: 使用事务的 CAS 实现

```bash
# 申请一个 10s 的租约
lease_id=$(etcdctl lease grant 10 --write-out=json | jq -r '.ID')

# Compare: lock/key 的创建版本号为 0 (键不存在)
# Then:    写入 client-id 并绑定租约
# Else:    加锁失败
etcdctl txn --interactive
mod("lock/key") = "0"

put lock/key "client-id" --lease=$lease_id
```

- 加锁包括: 检查键是否存在和写入键, 需要使用事务保证原子性
- 锁绑定租约, 客户端需要定期续约; 客户端崩溃后租约到期, 锁自动释放
- 锁的值是客户端的唯一标识, 防止锁被其他客户端错误释放 (删除前用 Txn 再次校验版本号)

```bash
# 解锁: 撤销租约, 绑定的锁自动释放
etcdctl lease revoke $lease_id
```

### 使用 etcd 实现监听 - 回调的分布式锁

etcd 的 Watch 是持续的事件流, 可以监听锁 key 的变化并触发回调

```go
// 加锁失败后等待锁释放
wch := cli.Watch(ctx, "lock/key", clientv3.WithFilterPut())
for resp := range wch {
  for _, ev := range resp.Events {
    // 回调: 锁已释放, 重新尝试加锁
    if ev.Type == clientv3.EventTypeDelete {
      tryLock()
    }
  }
}
```

- 所有等待者都监听同一个 key, 锁释放时会同时唤醒全部等待者 (惊群), 全部等待者重试后仍然只有一个等待者加锁成功

## 分布式 ID

多节点、多数据库环境下, 生成一个全局唯一、并且且最好有序的标识

场景:

1. 数据库的分库分表
2. 高并发、微服务

方案

1. UUID

- 本地生成分布式 ID
- UUID 是 128 位, 表现形式是 32 个十六进制字符 + 4 个连字符, 一共 36 个字符; 占用存储空间较大
- UUID 是无序的, 不能做主键

2. 数据库号段

- 使用数据库作为自增 ID 的发号器
- 发号数据库一次性分配一个号段, 例如一次性分配 1000 个自增 ID, 缓存到内存缓存中
- 即使发号数据库短暂宕机, 内存缓存也提供了一定的缓冲期

3. 基于 redis

- 利用 redis 的 INCR 指令: 单线程原子操作生成自增 ID
- 故障转移时选举新的主节点可能导致 ID 重复

4. 雪花算法 (Snowflake)

- 雪花 ID 是 64 位数字: 41 位时间戳 | 10 位机器号 | 12 位自增序列号
  - 时间戳: 当前时间 - 自定义起始时间
  - 机器号: 区分不同的发号节点, 也可以拆分为数据中心号 + 机器号
  - 序列号: 区分同一个机器在同一毫秒内生成的不同 ID
- 不依赖外部服务, 本地生成分布式 ID: 生成速度快, ID 较短, 有递增趋势
- 缺陷: 时钟回拨, 依赖机器当前时间

### 雪花算法

#### 雪花算法保证分布式 ID 唯一

1. 不同的机器的机器号不重复
2. 同一个机器在同一毫秒生成的序列号不重复
3. 时钟不能回拨
4. 同一个机器的并发发号, 需要做同步保护

#### 解决时钟回拨

1. 小幅度回拨: 暂停发号, 等待机器当前时间追上上次发号时间
2. 大幅度回拨: 报警并拒绝发号
3. 使用逻辑时间: 逻辑时间 = max(机器当前时间, 上次发号时间); 逻辑时间内继续生成序列号, 但是仍然需要处理序列号耗尽, 进程重启, 上次发号时间的保存, 上一个的序列号的保存

## 分布式事务

场景

1. 微服务架构下的跨服务合作
   - 订单服务: 更新订单状态
   - 库存服务: 减商家库存
   - 账户服务: 减消费者余额, 增商家余额
2. 分库分表
3. 尽量不用强一致性的分布式事务 (例如传统的两阶段提交) 会严重影响性能, 而是使用消息表 + 消息队列, 或者重试机制, 实现最终一致性

### 分布式事务的解决方案

| 方案              | 一致性     | 适用场景               |
| ----------------- | ---------- | ---------------------- |
| 2PC 两阶段提交    | 强一致性   | mysql 数据库           |
| 3PC 三阶段提交    | 强一致性   | 减少阻塞的强一致性场景 |
| TCC               | 最终一致性 | 库存, 余额             |
| Saga              | 最终一致性 | 订单, 铁路飞机票, 酒店 |
| 消息表 + 消息队列 | 最终一致性 | 发布订阅架构, 异步通知 |

- 2PC 两阶段提交: 准备阶段, 统一提交或回滚阶段
- 3PC 三阶段提交: 准备阶段, 中间阶段 + 超时处理, 统一提交或回滚阶段
- TCC: 将分布式事务拆分为 Try/Confirm/Cancel 3 个阶段, 业务实现这 3 个接口
  - Try: 将可用库存冻结为预留库存 (其他实例不能扣减)
  - Confirm: 扣减预留库存
  - Cancel: 解冻预留库存
- Saga: 没有冻结阶段, 直接执行业务; 如果某一步失败则执行反向补偿逻辑, 反向补偿失败时重试, 告警等

```sql
create table goods_stock (
  id bigint primary key auto_increment,
  goods_id bigint,
  available_stock int not null default 0,
  reserved_stock int not null default 0
  unique key uk_goods (goods_id)
)
```

Try: 将可用库存冻结为预留库存 (其他实例不能扣减)

```sql
update goods_stock
set available_stock - #{num},
    reserved_stock = reserved_stock + #{num}
where goods_id = #{goodsId} and available_stock >= #{num};
```

TCC 事务控制表

status: trying | confirming | cancelling | confirm | cancelled

`XID (全局事务 ID) | biz_type | status | goods_id | num | create_time`

Confirm: 扣减预留库存

```sql
update goods_stock
set reserved_stock = reserved_stock - #{num}
where goods_id = #{goodsId} and reserved_stock >= #{num};
```

Cancel: 解冻预留库存

```sql
update goods_stock
set reserved_stock = reserved_stock - #{num},
    available_stock = available_stock + #{num}
where goods_id = #{goodsId} and reserved_stock >= #{num};
```

### TCC 的幂等, 空回滚和悬挂

背景: 网络请求可能超时, 重试也可能超时, 不能假设 Try/Confirm/Cancel 只执行 1 次, 并且严格按序到达

1. 幂等: Confirm 扣库存成功, 但响应丢失, 协调者因为超时重试 Confirm, 但是重试 Confirm 不能再次扣库存: 使用 TCC **事务控制表**记录事务的状态, 事务状态更新和库存扣减需要在同一个本地事务中原子执行
2. 空回滚: Try 未执行, 协调者因为超时发送 Cancel 请求; 此时库存未被冻结, Cancel 不能凭空加库存
3. 悬挂: Cancel 执行后, 迟到的 Try 请求到达并冻结库存, 但后续可能没有 Confirm 或 Cancel, 导致库存一直被冻结: Try 发现事务状态是 cancelled 时, 应该拒绝执行

### 消息表 + 消息队列

```
数据库事务提交, 支付状态更新
sendMessage("支付成功"); // 可能网络超时/断开, 数据库已更新但是消息未发送
```

```
sendMessage("支付成功"); // 数据库未更新但是消息已发送
数据库事务回滚, 支付状态未更新
```

- 对于支付服务, 数据库中有订单表和消息表, 本地事务中同时更新订单表和消息表: 更新支付状态, 插入一条状态为等待发送的消息, 包括: 消息 ID, 订单号和消息内容等
- 后台线程定时扫描消息表中, 状态为等待发送的消息, 发送到 MQ
- 收到 MQ 的可靠确认后 (broker ACK), 将消息的状态更新为已发送, 如果失败则指数退避重试
- 订单服务收到消息后, 本地事务中同时做消息去重和订单状态更新, 订单状态更新成功后确认消费

消息已发送到 MQ, 但是支付服务还未将消息的状态更新为已发送就宕机了, 故障恢复后会重新发送该消息, 消费者 (订单服务) 需要做消息去重或幂等消费, 只能更新一次订单状态

- 可靠投递
- 消费失败重试
- 死信队列 (DLQ)
- 顺序和对账
