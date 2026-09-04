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
| 资源加载错误       | 同上监听 error 事件, img/font/link/script/video 加载失败  | capture 阶段判断 `target.src/target.href`                   |
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
- DOM 解析耗时 (domInteractive - responseEnd)
- 资源加载耗时 (loadEventStart - domContentLoadedEventEnd)
- 重定向耗时、unload 耗时、paintTime (最后一条 paint entry 相对 fetchStart)

3. Resource Timing (PerformanceObserver)

- PerformanceObserver 监听 `resource` 类型的 PerformanceEntry
- 排除 fetch/xmlhttprequest/beacon 类型 (这些由 HTTP 监控覆盖) 和包含 DSN 的 URL
- 记录每个静态资源的大小、加载耗时、initiatorType (触发请求该静态资源的来源类型); `fromCache` 由 `transferSize === 0 || encodedBodySize === 0` 推导

4. Resource Element Fallback (MutationObserver)

- 针对不支持 PerformanceObserver 监听 `resource` 类型的浏览器
- 通过 MutationObserver 监听新增的 img/font/link/script/video 元素
- 在 img/font/link/script/video 元素 load/error 事件回调中上报, 每个 URL 只上报一次

5. Long Tasks:

- PerformanceObserver 监听 `longtask` 类型
- 记录超过 50ms 的长任务, 用于定位主线程阻塞

6. Memory:

- PerformancePlugin 插件初始化时, 调用一次 `performance.measureUserAgentSpecificMemory()` (Chrome-only, 页面需要 window.crossOriginIsolated === true)
- 测量页面的 JS 堆内存使用情况

7. FSP、HTTP 性能

> window.crossOriginIsolated: 当前页面是否为跨源隔离 (Cross-Origin Isolation) 状态, 如果 window.crossOriginIsolated === true, 则表示浏览器判断该页面安全, 允许使用受限制的、强大的 Web API, 例如: SharedArrayBuffer、performance.measureUserAgentSpecificMemory() 等

### 为什么需要跨源隔离

- 同源策略: 如果两个 URL 的协议, 主机名 (或 IP) 和端口都相同, 则两个 URL 同源

某些强大的 Web API (特别是 SharedArrayBuffer) 存在「侧信道攻击」风险 (侧信道攻击: 通过精确测量时间/内存窃取其他源的数据); 浏览器默认禁用这些强大的 API; 只有当网页明确声明「跨源隔离」的安全环境时，浏览器才会重新开启这些强大的 API

### 跨源隔离开启方法

服务器必须在响应头中设置

```bash
# COOP: same-origin
Cross-Origin-Opener-Policy: same-origin
# COEP: require-corp | credentials
Cross-Origin-Embedder-Policy: require-corp | credentialless
```

- `COOP: same-origin` 从本页面打开的第三方窗口, 或者打开本页面的第三方窗口, 如果非同源, 则会被隔离为独立的浏览上下文 (Browsing Context Group, BCG), 无法通过 `window.opener` 引用对方, 也无法与对方共享进程
- `COEP: require-corp` 本页面加载的跨源 no-cors 子资源 (img/font/link/script/video 等), 第三方服务器必须显式携带 `Cross-Origin-Resource-Policy` 响应头, 或者使用 CORS 加载, 即强制嵌入资源 "声明同意嵌入"; 同源 iframe 无需 CORP

1. COOP: why? 其他第三方窗口可能和本页面共享浏览上下文 (Browsing Context Group, BCG), 即使用 `window.open` 打开某页面, 并且通过 `window.opener` 引用该页面
2. COEP: 本页面嵌入第三方资源, img/font/link/script/video 等资源只要有 URL 就能被嵌入, 提供被嵌入的资源的第三方服务器未同意; 服务器携带 `COEP: require-corp` 响应头后, 第三方资源加载规则:
   - no-cors 子资源 (img/font/link/script/video 等): 第三方服务器的响应必须携带 `CORP: cross-origin` (跨站) 或 `CORP: same-site` (同站跨源) 响应头, 表示显式声明同意嵌入; 也可以使用 CORS 加载 (crossorigin 属性、fetch 的 CORS 模式), 第三方服务器的响应必须携带 `Access-Control-Allow-Origin` 响应头
   - 跨源 iframe: 服务器的响应「必须」携带 COEP (`require-corp` / `credentialless`) 响应头; 第三方服务器的响应必须携带 `CORP: cross-origin` 响应头; 服务器携带 `COEP: none` 响应头时, 即使第三方服务器的响应携带 CORP 也会被拦截

案例 --- 服务器携带 `COEP: require-corp` 响应头后, 第三方资源加载失败: 提供第三方资源的服务器未携带 `CORP` 响应头

> 如果服务器携带的是 `COEP: credentialless` 响应头, 嵌入跨源 no-cors 子资源 (img/font/link/script/video 等) 时, 第三方服务器不需要携带 CORP 响应头, 缺陷是请求跨源 no-cors 子资源时不会携带 cookie
> 请求跨源 no-cors 子资源需要携带 cookie 时, 服务器必须携带 `COEP: require-corp` 响应头, 并且要求第三方服务器的响应携带 `CORP: cross-origin`

### 开启跨源隔离后解锁的能力

- SharedArrayBuffer: 多线程共享内存
- performance.measureUserAgentSpecificMemory(): 测量页面的 JS 堆内存使用情况
- 高精度时间戳: performance.now() 的时钟精度不会被降级

## 屏幕录制插件的滑动窗口机制

- ScreenRecordPlugin 屏幕录制插件, 插件中 dynamic import: `import ("@rrweb/record")` 和 `import("pako")`, 避免屏幕录制插件阻塞主 JS bundle
- SDK 上报的事件类型匹配: Error / XHR / Fetch / Resource / UnhandledRejection 时, 才触发屏幕录制上报: 将滑动窗口中的 rrweb 事件作为 ScreenRecord 事件上报: rrweb events (JSON) -> pako.gzip() -> Uint8Array -> base64 编码 -> string

### 屏幕录制的设计

- 隐私: rrweb 默认将 type="password" 的输入框值替换为 *, 也支持隐私配置: 例如 `recordCanvas" true` 记录 canvas 内容; 同时屏幕录制插件的滑动窗口只保留最近 3s, 不会记录用户的完整操作历史
- 体积: 使用 gzip 压缩后的体积, 只有原 rrweb events JSON 体积的 10%-20%
- 性能: rrweb 基于 MutationObserver, MutationObserver 是微任务, 监听整个 DOM 树的改变, 开销可控
- 按需触发: 特定的事件类型才会触发屏幕录制上报, 降低网络带宽

## 框架集成

::: code-group

```ts [react 集成]
export class ReactErrorBoundary extends Component<Props, State> {
  static displayName = "ReactErrorBoundary"; // 保证 react16 组件栈可读

  // render 阶段将 error 写入 state, 使得 fallback 立即可见
  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.setState({ error, errorInfo });
    reportFrameworkError({
      type: EventType.React,
      error,
      context: errorInfo, // ErrorInfo, 包含 componentStack 组件栈
    });
  }

  override render() {
    const { error, errorInfo } = this.state;
    if (error) {
      const { fallback } = this.props;
      if (typeof fallback === "function") return fallback(error, errorInfo);
      return fallback ?? null;
    }
    return this.props.children ?? null;
  }
}
```

```ts [vue 集成]
export const vuePlugin: Plugin = (app, options: InitOptions) => {
  const handler = app.config.errorHandler; // 原 errorHandler
  app.config.errorHandler = (err, vueInstance, info) => {
    reportFrameworkError({
      type: EventType.Vue,
      error: err,
      context: { vueInstance, info },
    });
    handler?.call(null, err, vueInstance, info); // 链式调用原 errorHandler
  };
  init(options); // 插件安装时初始化 SDK
};

app.use(vuePlugin, { dsn: "/sentry" });
```

:::

## 数据采样和数据过滤

```
JSError 事件 -> excludeAPIs / ignoreErrors (采集层过滤)
             -> LRU 去重 (去重层过滤)
             -> tracesSampleRate (采样层过滤) 随机采样: tracesSampleRate=0.5, 50% 的事件被随机丢弃
             -> beforeSend (前置钩子, 可以过滤)
             -> beforeSendBatch (前置钩子, 可以批量过滤)
             -> 上报
```

## Reporter 单例、基于 Proxy 的懒加载

```ts
let instance: DataReporter | null = null;

export function resetReporter() {
  instance?.dispose(); // 清理定时器、清理 online/offline 监听、清空队列 (localStorage 缓存不会受到影响)
  instance = null;
}

export default new Proxy({} as DataReporter, {
  get(_target, prop) {
    instance = instance ?? new DataReporter(); // 首次访问属性时, 才实例化
    const value = Reflect.get(instance, prop, instance);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
```

### 为什么需要懒加载?

1. 避免模块加载时的副作用: DataReporter 的构造函数会注册 online/offline 监听, 并且从 localStorage 中恢复上个会话的离线缓存; 如果直接 `export default new DataReporter();`, import 该模块时会导致副作用, 并且早于 `init()` SDK 初始化
2. 解决 this 绑定问题, 消费方可以安全解构 `const { send } = reporter`

## 声明式点击埋点

> See "$HOME/github/swifty-sentry/sentry"

属性约定

| 属性                 | 含义       | 示例                                 |
| -------------------- | ---------- | ------------------------------------ |
| `swifty-sentry-ev`   | 事件 ID    | `swifty-sentry-ev="toggle-language"` |
| `swifty-sentry-msg`  | 事件描述   | `swifty-sentry-msg="切换语言"`       |
| `swifty-sentry-view` | 元素标记   | `swifty-sentry-view="toggle-button"` |
| `swifty-sentry-*`    | 自定义参数 | `swifty-sentry-lang="en"`            |

```ts
function getComposedElementPath(event: MouseEvent): HTMLElement[] {
  return event
    .composedPath()
    .filter((node): node is HTMLElement => node instanceof HTMLElement);
}

function getElementPath(target: EventTarget | null): HTMLElement[] {
  if (!(target instanceof HTMLElement)) {
    return [];
  }
  const path: HTMLElement[] = [];
  let current: HTMLElement | null = target;
  while (current) {
    path.push(current);
    current = current.parentElement;
  }
  return path;
}

export function getDeclarativeClickData(
  event: MouseEvent,
): DeclarativeClickData | null {
  // event.composedPath() 可以穿透 shadow DOM, 过滤得到 HTMLElement 的路径
  const path = getComposedElementPath(event);
  const fallbackPath = path.length > 0 ? path : getElementPath(event.target);
  // 找到路径中, 第一个携带 swifty-sentry-ev/msg/view 属性的元素
  const trackingTarget = fallbackPath.find(hasTrackingAttribute);
  if (!trackingTarget) {
    return null;
  }
  // 点击元素优先使用 event.target (如果 event.target 是 HTMLElement), 否则 fallback 到埋点元素
  const clickedElement =
    event.target instanceof HTMLElement ? event.target : trackingTarget;
  const { top, left } = clickedElement.getBoundingClientRect();
  const { scrollTop, scrollLeft } = document.documentElement;
  return {
    ev: getEventId(fallbackPath), // 优先级: swifty-sentry-ev > title > swifty-sentry-view > 标签名
    msg: getMessage(trackingTarget), // 优先级: swifty-sentry-msg > title > textContent > aria-label > 标签名
    triggerPageUrl: location.href,
    x: left + scrollLeft,
    y: top + scrollTop,
    params: getParams(fallbackPath), // 收集 swifty-sentry-* 自定义参数 (ev/msg/view 除外)
    elementPath: dom2str(trackingTarget), // 埋点元素的 CSS 选择器路径
    triggerTime: Date.now(),
  };
}
```

### dom2str

思路对齐 `@sentry/react` 的 htmlTreeAsString, 从被点击元素向上 (最多 5 层), 每层生成 `tag#id.class` 形式的选择器字符串并使用 > 连接, 例如 `body > div#app > button.btn.primary` 累积长度到达 128 字符后, 丢弃整层选择器字符串

## 设备指纹和用户身份

| 标识          | 来源                    | 缓存         | 用途           |
| ------------- | ----------------------- | ------------ | -------------- |
| `anonymousId` | fingerprintjs visitorId | localStorage | 设备级匿名指纹 |
| `visitorId`   | setVisitorId() 手动设置 | 内存         | 未登录访客 ID  |
| `userId`      | setUserId() 手动设置    | 内存         | 已登录用户 ID  |

1. 隐私: fingerprintjs 默认禁用
2. deviceInfo 设备信息惰性解析: 第一次数据上报时, 才使用 UAParser 解析设备信息

## scheduleFlush

```ts
interface UnrefTimer {
  unref: () => void;
}

function hasUnref(timer: unknown): timer is UnrefTimer {
  return (
    typeof timer === "object" &&
    timer !== null &&
    "unref" in timer &&
    typeof timer.unref === "function"
  );
}

export function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
  if (hasUnref(timer)) {
    // Node.js setTimeout 返回的定时器是对象, 有 unref() 方法
    // 浏览器 setTimeout 返回的定时器是 number

    // Node.js 侧 timer.unref() 的作用
    // Node.js 会保持 event loop 直到最后一个受引用的定时器到期
    // 调用 unref() 使得定时器不受引用
    timer.unref();
  }
}

export function scheduleFlush(
  previousTimer: ReturnType<typeof setTimeout> | undefined,
  delay: number,
  flush: () => Promise<void>,
): ReturnType<typeof setTimeout> {
  if (previousTimer) clearTimeout(previousTimer);
  const nextTimer = setTimeout(() => void flush(), delay);
  unrefTimer(nextTimer);
  return nextTimer;
}
```

## 路由监听

history 模式

- 监听 popstate 事件
- Monkey patch `history.pushState()` 和 `history.replaceState()`

hash 模式

- 监听 hashchange 事件

## PV 和页面停留时间 (PageDwell)

- PV (Page View) 测量: SDK 初始化时, 立刻发送首次 PV
- 路由变化时
  - 如果目的路由与源路由相同, 则不上报
  - 如果目的路由与源路由不同, 则先发送旧页面停留时间 (过滤 <=100ms 的页面停留时间), 再发送新页面 PV

## 优化

### 性能优化

- Web Worker 上报: 使用 worker 线程执行 JSON 序列化、gzip 压缩, 避免阻塞主线程
- 批量 DOM 查询: 白屏检测每轮有 18 次 `document.elementFromPoint()` 采样, 该 Web API 依赖布局结果; 布局是批量更新的, 如果有脏布局 (pending layout), 则会强制同步回流 (forced reflow)
  - 使用 `requestIdleCallback()` 调度到主线程空闲时采样 [DONE]
  - 采样到首个为空或注册的根元素 (html, body, #app, #root...) 时即可短路本轮白屏检测
- FSP 测量: 每次 DOM 变化都会检查 `isInViewport` (调用 `element.getBoundingClientRect()`) , 可以改为使用 IntersectionObserver
- rrweb 加载时机: SDK 使用 dynamic import 异步加载 rrweb, 但是 ScreenRecordPlugin 的 init 方法会立刻触发 rrweb 的异步加载; 可以推迟到首次有录屏标记时 (`sentry.shouldScreenRecord === true`) 触发 rrweb 的异步加载

### 可靠性优化

- Service Worker 离线队列: localStorage 有 5MB 大小限制并且同步阻塞, Service Worker + Cache API 可以获得更大的离线队列
- 指数退避重试: sentry recovery 使用指数退避重试: 1s -> 2s -> 4s -> ... 60s
- 数据完整性校验: 写入离线缓存时添加 checksum, 防止离线缓存的数据损坏

## source-map 堆栈反解

##
