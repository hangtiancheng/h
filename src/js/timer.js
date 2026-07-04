import "./polyfill/index.js";

const useSetTimeout = () => {
  let requestId;

  return {
    setTimeout2: (callback, timeout) => {
      let startTime = Date.now();
      const loop = () => {
        requestId = requestAnimationFrame(loop);
        const currentTime = Date.now();
        if (currentTime - startTime >= timeout) {
          startTime = currentTime;
          callback();
          cancelAnimationFrame(requestId);
        }
      };
      requestId = requestAnimationFrame(loop);
      return requestId;
    },
  };
};

const { setTimeout2 } = useSetTimeout();

const startTime = Date.now();
setTimeout2(() => {
  console.log(`setTimeout: ${Date.now() - startTime}`);
}, 3000);

const useSetInterval = () => {
  let requestId;

  return [
    (callback, interval) => {
      let startTime = Date.now();
      const loop = () => {
        requestId = requestAnimationFrame(loop);
        const currentTime = Date.now();
        if (currentTime - startTime >= interval) {
          startTime = currentTime;
          callback();
        }
      };
      requestId = requestAnimationFrame(loop);
      return requestId;
    },
    () => {
      console.log("Clear requestId");
      cancelAnimationFrame(requestId);
      requestId = null;
    },
  ];
};

let count = 0;
const [setInterval2, clearInterval2] = useSetInterval();
setInterval2(() => {
  console.log(new Date().toISOString());
  count++;
  if (count >= 3) {
    clearInterval2();
  }
}, 3000);
