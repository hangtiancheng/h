# Swifty Sentry

框架无关的浏览器监控、埋点 SDK

## 分层架构

```
┌───────────────────────────────────────────────------──────┐
│                     Public API Layer                      │
│  init / destroy / isInitialized / enablePlugin            │
│  + traceError / tracePerformance / traceCustomEvent       │
│  + tracePageView / reportFrameworkError                   │
│  + setUserId / setVisitorId / getIdentity                 │
│  + beforeSend / beforeSendBatch / afterSend               │
│  + flushOfflineCache                                      │
├───────────────────────────────────────────────────------──┤
│                   Core Layer                              │
│  sdk-lifecycle / setup / bus / decorates / handlers       │
│  + pv-lifecycle / white-screen / identity                 │
├───────────────────────────────────────────────────------──┤
│                  Reporter Layer                           │
│  DataReporter / transports / offline-cache /              │
│  server-recovery / flush-scheduler / send-preflight       │
├────────────────────────────────────────────────────------─┤
│                  Plugin Layer                             │
│  PerformancePlugin / ScreenRecordPlugin / ExposurePlugin  │
├──────────────────────────────────────────────────------───┤
│                  Framework / Node Layer                   │
│  react.ts / vue.ts / vite.ts / webpack.ts                 │
│  + node /dev-endpoint / source-map (Node-only)            │
├──────────────────────────────────────────────────------───┤
│                  Utils Layer                              │
│  data-structures / session / uuid / throttle /            │
│  click-data / dom2str / logger                            │
└──────────────────────────────────────────────────------───┘
```

核心模块

| 模块         | 路径                      | 职责                                                          |
| ------------ | ------------------------- | ------------------------------------------------------------- |
| SDK 生命周期 | `core/sdk-lifecycle.ts`   | init / destroy / isInitialized / enablePlugin 入口            |
| 事件总线     | `core/bus.ts`             | 基于 `Map<EventType, Set<Handler>>` 的发布订阅                |
| Monkey Patch | `core/decorates.ts`       | 安装/卸载 Web API 拦截                                        |
| HTTP 拦截    | `core/decorate-http.ts`   | xhr/fetch 请求拦截                                            |
| 路由拦截     | `core/decorate-route.ts`  | history 路由侦听 (hash 路由侦听在 `core/decorates.ts`)        |
| PV 生命周期  | `core/pv-lifecycle.ts`    | PageLoad / 路由 PV / 页面停留时长                             |
| 白屏检测     | `core/white-screen.ts`    | 视口采样点检测 (setup 时直接启动, 不走事件总线)               |
| 数据上报     | `reporter/index.ts`       | 批量上报队列、传输选择 (sendBeacon / Image / fetch)、离线缓存 |
| 插件注册     | `core/plugin-registry.ts` | 插件生命周期、插件注册中心                                    |
| 配置校验     | `core/options-schema.ts`  | zod schema 运行时类型校验                                     |

设计原则

1. 发布订阅解耦: 数据采集 (Producer) 与数据处理 (Consumer) 通过事件总线解耦
2. 可插拔插件: 性能 PerformancePlugin、录屏 ScreenRecordPlugin、曝光 ExposurePlugin 等重功能以插件形式按需加载
3. 框架无关的核心: 核心不依赖任何框架, 通过独立入口文件提供框架 (Vue/React) 集成

## SDK 初始化

```ts
export function init(options: InitOptions): void {
  // 单例守卫
  if (isInitialized()) return;

  // 剔除显式 undefined 字段
  const provided = Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );

  // 合并默认配置
  const parsedOptions = optionsSchema.parse({
    ...DEFAULT_OPTIONS,
    ...provided,
  });
  sentry.setOptions(parsedOptions);

  if (sentry.options.disabled) return; // 用户主动禁用
  if (dsn === "") return; // DSN 为空时, 拒绝初始化

  // 设置面包屑容量, 启动发布订阅和猴子补丁
  breadcrumb.capacity = sentry.options.maxBreadcrumbs;
  cleanupSetup = setup();

  // 异步初始化身份识别
  // 如果 `enableFingerpinrt === false`, 则跳过初始化身份识别
  // 先检查 localStorgae 中是否有 anonymousId, 有则使用该 anonymousId: `sentry.setOptions({ anonymousId })`
  // 没有则 dynamic import: `import("@fingerprintjs/fingerprintjs")`
  // 使用 `agent.get()` 得到浏览器指纹 `visitorId`, 写入 localStorage 并使用该 visitorId 作为 anonymousId: `sentry.setOptions({ anonymousId })`
  void initIdentity();
}
```

浏览器指纹 (Browser Fingerprint) 是不依赖 Cookie/localStorage, 根据浏览器暴露的各种信息, 组合得到的「设备/浏览器身份标识」

## 事件总线

### 为什么使用发布订阅

- 数据采集和数据处理解耦: Monkey Pactch Producer 只负责发布事件, 不 care 后续 breadcrumb 记录、数据上报等等
- 一对多分发: 一个 HTTP 事件可以同时触发 breadcrumb 记录、数据上报等多个消费者
- 动态订阅: 插件 (PerformancePlugin / ScreenRecordPlugin / ExposurePlugin) 可以在运行时订阅/取消订阅, 无需修改核心代码
- 异常隔离: publish 对每个 handler 单独 try/catch, 一个消费者抛出错误不会影响生产者和其他消费者

### HTTP 请求监控

> fetch 为什么必须 `res.clone()` 后台读取

response 的 body 只能被消费一次, sentry SDK 包装了 fetch, 并且将原始 response 传递给调用方, 调用方可能立刻 `res.json() / res.text()`, 如果 SDK 直接 `res.text()` 解析这个 response

- SDK 的 `res.text()` 会锁定 body stream, 即 `res.bodyUsed = true`
- 调用方读取 body 时, 会导致 streamm 竞争报错, 抛出 `TypeError: Body is unusable` 等错误
- 只在错误的 HTTP 状态码时 (>= 400 或 ==0) 克隆 body

`res.clone()` 是对 body 做 tee 分流, 克隆的 body 拥有一份独立的 stream 副本, SDK 读取克隆的 body, 原始 response 的 stream 不受影响

|           | xhr                                    | fetch                                  |
| --------- | -------------------------------------- | -------------------------------------- |
| 拦截位置  | `XMLHttpRequest.prototype.open/send`   | `globalThis.fetch`                     |
| 响应获取  | `loadend` 事件回调                     | `Promise.then()`                       |
| body 获取 | 直接读取 `this.response`               | 必须 `res.clone()` 后台读取            |
| 计时起点  | `send()` 时的 timestamp, 不是 `open()` | 发送请求时的 timestamp                 |
| 过滤时机  | `loadend` 事件回调中, 检查后跳过发布   | fetch 调用前检查, 跳过则透传原始 fetch |

1. 请求过滤: `shouldIgnoreRequest()` 过滤发送到 DSN 的 POST 数据上报
2. excludeAPIs 配置: 支持用户配置, 排除指定的 API 路径
3. Server-Timing 解析: 从响应头中提取服务端性能数据
4. 只在错误的 HTTP 状态码时 (>= 400 或 ==0) 克隆 body, body 字符串截断到 8KB, 单个 HTTP 错误不会撑爆数据上报载荷
5. 可逆装饰: `decorateProp` 返回 cleanup 函数, destroy 时还原原始 xhr/fetch

### 错误捕获包袱哪些错误类型? 如何去重和批量聚合?

| 类型               | 来源                                                      | 实现方式                                                    |
| ------------------ | --------------------------------------------------------- | ----------------------------------------------------------- |
| 运行时 JS 错误     | `window.addEventListener("error", listener, true)`        | capture 阶段监听 `error` 事件                               |
| 资源加载错误       | 同上监听 error 事件, img/link/script 加载失败             | capture 阶段判断 `target.src/target.href`                   |
| Promise 未捕获异常 | `window.addEventListener("unhandledrejection", listener)` | 全局事件监听, 解析 `reason` 再分类                          |
| console.error      | 开发者主动打印                                            | 装饰 `console.error` 提取 Error 对象                        |
| React 组件错误     | ErrorBoundary                                             | `componentDidCatch` 生命周期                                |
| Vue 组件错误       | errorHandler                                              | `app.config.errorHandler`                                   |
| 其他框架错误       | 业务方主动调用                                            | `reportFrameworkError({ type: EventType.OtherFrameworks })` |

> 为什么要在 capture 阶段捕获资源加载错误

资源加载失败事件「不冒泡」: 资源加载失败事件只派发到失败元素自身, 必须在捕获阶段才能拦截到资源加载失败事件

错误去重: reportOncePerError + BoundedSet

- 错误键是原始字符串 (没有被 hash) 拼接得到
- 每个错误键只上报一次

- `window.addEventListener("error", listener, true)`: 错误键为 `${ErrorType.Error}-${message}-${filename}-${line}-$`
- Error 实例、unknown 未知错误: 错误键为 `${ErrorType.Error}-${payload.name}-${payload.message}`
- 资源加载错误: 错误键为 `${ErrorType.Resource}-${localName}-${src || href}`
- 没有 filename, 或者 unknown 未知错误, 视为来源不明, 跳过错误去重, 直接进入批量聚合
- `BoundedSet` 容量上限 1000, 溢出时淘汰最早插入的条目
- breadcrumb 记录发生在错误去重前, 被去重 (未被上报) 的错误仍然会被记录 breadcrumb, 提供给后续的错误上下文还原

错误聚合: 按 `{$err.type || filename}-${err.name}-${err.message}` 聚合

- 防止循环错误 (例如 setInterval 中抛出错误) 导致上报风暴
- 2s 时间窗口 + >= 5 次阈值, 既保证单个错误及时上报, 又避免高频重复错误打满网络带宽
- 记录时间窗口内, 最后一个错误的发生时间, 方便后端判断错误的持续时间

## 数据上报管道

DataReporter 的数据上报管道分为 send (入队) 和 flush (发送) 两个阶段

1. 防并发锁: `isFlushing` 标志位, 防止并发 flush
2. 批量分片: 每次最多取 `cacheMaxLength` (默认 10 条), 避免每次上报体积过大
3. 失败重试: 发送失败的数据, 重新插入上报队列的头部, 不会被静默丢弃; 发送成功后清除 localStorage 镜像, 避免重复上报
4. 连续 flush: flush 一批数据后, 如果还有剩余数据, 则 100ms 后继续上报, 形成 flush 流水线
5. hook 系统:

- `beforeSend`: 单条修改、拒绝上报并丢弃
- `beforeSendBatch`: 批量修改、批量拒绝上报并丢弃
- `afterSend`: 发送成功后回调

6. web 端可以使用 beforeunload 事件, 移动端必须使用 pagehide 事件
7. 提供同步 "快" 路径:
   - 提供 `isPromise()` 守卫代替无条件 await, 没有异步 hooks 时, 同步执行数据上报
   - 如果数据上报管道中有 await (例如有异步的 beforeSend/beforeSendBatch hooks), 则 await 后续代码 (包括 sendBeacon) 会被推迟到微任务中执行
   - 浏览器派发 pagehide 事件
   - pagehide 事件处理器执行同步代码: 如果 sendBeacon 在该阶段调用, 则可以成功上报数据
   - 浏览器执行微任务检查点 (microtask checkpoint), 微任务可能执行, 可能不执行; 浏览器不保证在页面卸载/冻结前完成检查点, 即 sendBeacon 上报的数据可能静默丢失
   - 页面卸载/冻结
8. 跨会话恢复:
   - 落盘时机
     - send 入队时发现离线
     - flush 发送时发现离线
     - 发送失败时

- 创建 DataReporter 实例时, 安装 online/offline 监听器 `window.addEventListener("online", onOnline)`, `window.addEventListener("offline", onOffline)`; 网络状态初始化为 `navigator.onLine`, 从 localStorage 中加载上一个会话未上报的数据

## 数据传输层的双通道策略

| 通道                   | 大小限制       | 优势                                                | 劣势                                                    | 适用场景                   |
| ---------------------- | -------------- | --------------------------------------------------- | ------------------------------------------------------- | -------------------------- |
| `navigator.sendBeacon` | <64KB 在途预算 | 页面卸载时可靠上报、不阻塞页面渲染                  | 只能使用 POST 方法、不能自定义 header、无法获取响应状态 | 普通批量上报               |
| `fetch POST`           | 没有硬限制     | 可以自定义 header、可以获取响应状态、支持 keepalive | 页面卸载时可能中断、载荷体积过大时关闭 keepalive        | 大数据量上报、需要确认送达 |

`fetch` 通道的特殊处理

- 条件性的 `keepalive`: 载荷 <=60KB 时设置 `keepalive: true`, 开启 keepalive 页面卸载时仍然尝试完成请求; 超过 60KB 则关闭 keepalive: chromium 对 `keepalive: true` 的 fetch 有大约 64KB 的在途预算, 大数据量上报 (例如屏幕录制) 时如果开启 keepalive 会被浏览器拒绝, 导致数据上报失败并阻塞上报队列头部
- 数据上报失败时 (被服务器拒绝或 res.ok === false) 时, 启动定时 HEAD 探测服务器, 服务器健康时恢复数据上报

## 白屏检测算法

视口采样点检测

- 采样点是一个确定的 3 x 6 视口网格,
- 网格均匀覆盖整个视口, 四角和边缘都在采样范围内
- 任意一个采样点返回非根元素时, 判断页面已渲染内容, 停止采样, 避免页面内容偏离视口中心导致误判白屏
- 每隔 1s 采样一次
- 白屏判定条件: 连续十次采样, 18 个采样点均为空或注册的根元素 (html, body, #app, #root...), 判定为白屏并触发数据上报

白屏检测不走事件总线: 事件总线适合页面生命周期内持续的事件流, 例如每次请求、每次点击; 白屏事件每个页面最多上报一次

页面 `readyState === "complete"` (或 load 事件) 后开始采样

性能优化: 使用 `requestIdleCallback` 在浏览器空闲时执行采样 (超时 1000ms), 避免阻塞主线程

检测到页面内容或判定白屏并上报后, 停止白屏检测定时器

## 首屏渲染事时间 (FSP)

FSP (First Screen Paint) 是一个自定义指标: LCP 关注单个最大内容元素, 对于 SPA 首屏 (多个组件) 的场景不准确; FSP 监听视口中所有 DOM 的变化, 取最后一个可视元素完成渲染的时间, 真实反映用户感知的页面完成

FSP 对比 LCP

|          | FSP                                        | LCP                                               |
| -------- | ------------------------------------------ | ------------------------------------------------- |
| 定义     | 首屏所有可视 DOM 元素完成渲染的时间        | 视口中最大内容元素完成渲染的时间                  |
| 关注点   | 首屏整体完成度                             | 单个最大内容元素                                  |
| 实现     | MutationObserver 监听视口中所有 DOM 的变化 | PerformanceObserver 监听 largest-contentful-paint |
| 排除元素 | link/style/script                          | 浏览器自动判定                                    |
| 终止条件 | `document.readyState === "complete"`       | 页面完全加载或者有用户交互                        |
| 适用场景 | SPA 首屏、SSR 页面                         | 通用页面                                          |

## 性能监控插件采集的指标

1. Web Vitals

| 指标 | 含义             | 采集方式   |
| ---- | ---------------- | ---------- |
| LCP  | 最大内容绘制     | `onLCP()`  |
| FCP  | 首次内容绘制     | `onFCP()`  |
| CLS  | 累积布局偏移     | `onCLS()`  |
| INP  | 交互到下一次绘制 | `onINP()`  |
| TTFB | 首字节时间       | `onTTFB()` |

2. Navigation Timing (Performance API)

从 `performance.getEntriesByType("navigation")` 提取

- DNS 查询耗时 (domainLookupEnd - domainLookupStart)
- TCP 连接耗时 (connectEnd - connectStart)
- TLS 握手耗时
- 首字节时间 (responseStart - requestStart)
- 内容传输耗时 (responseEnd - responseStart)
- DOM 解析耗时
