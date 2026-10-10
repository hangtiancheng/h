function delayAll(functions, ms) {
  return functions.map((fn) => {
    return () => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(fn());
        }, ms);
      });
    };
  });
}

export default delayAll;
