const taskQueues = [];
const frameDuration = 1000 / 60;

let id = 0;
let latestCallTimestamp = 0;

if (!globalThis.requestAnimationFrame) {
  globalThis.requestAnimationFrame = function (callback) {
    if (taskQueues.length === 0) {
      const now = Date.now();
      const nextCallDelay = Math.max(
        0,
        // 间隔小于 1 帧, 等待剩余时间
        // 间隔大于 1 帧, 立刻执行
        frameDuration - (now - latestCallTimestamp),
      );
      latestCallTimestamp = nextCallDelay + now;
      setTimeout(() => {
        const queueCloned = [...taskQueues];
        taskQueues.length = 0;
        for (const task of queueCloned) {
          if (!task.cancelled) {
            try {
              task.callback();
            } catch (e) {
              setTimeout(function () {
                throw e;
              }, e);
            }
          }
        }
      }, Math.round(nextCallDelay));
    }
    taskQueues.push({
      id: ++id,
      callback,
      cancelled: false,
    });
    return id;
  };
}

if (!globalThis.cancelAnimationFrame) {
  globalThis.cancelAnimationFrame = function (requestId) {
    for (const task of taskQueues) {
      if (task.id === requestId) {
        task.cancelled = true;
        return;
      }
    }
  };
}
