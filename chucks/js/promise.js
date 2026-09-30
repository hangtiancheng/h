const PENDING = "pending";
const RESOLVED = "resolved";
const REJECTED = "rejected";

class PromiseV2 {
  state = PENDING;
  value = null;
  resolvedCallbacks = [];
  rejectedCallbacks = [];

  get #dump() {
    return {
      state: this.state,
      value: this.value,
      resolvedCallbacks: {
        callbacks: this.resolvedCallbacks.map((cb) => cb.name),
        length: this.resolvedCallbacks.length,
      },
      rejectedCallbacks: {
        callbacks: this.rejectedCallbacks.map((cb) => cb.name),
        length: this.rejectedCallbacks.length,
      },
    };
  }

  constructor(executor) {
    const resolve = (value) => {
      if (this.state !== PENDING) {
        return;
      }
      this.state = RESOLVED;
      this.value = value;
      console.log("[constructor] resolve", JSON.stringify(this.#dump));
      this.resolvedCallbacks.forEach((cb) => cb(value));
    };
    const reject = (value) => {
      if (this.state !== PENDING) {
        return;
      }
      this.state = REJECTED;
      this.value = value;
      console.log("[constructor] reject", JSON.stringify(this.#dump));
      this.rejectedCallbacks.forEach((cb) => cb(value));
    };
    try {
      executor(resolve, reject);
    } catch (e) {
      this.reject(e);
    }
  }

  then(onFulfilled, onRejected) {
    console.log("[then]", JSON.stringify(this.#dump));
    onFulfilled =
      typeof onFulfilled === "function"
        ? onFulfilled
        : (result) => {
            return result;
          };
    onRejected =
      typeof onRejected === "function"
        ? onRejected
        : (reason) => {
            throw reason;
          };

    return new PromiseV2((resolve, reject) => {
      const handleFulFilled = (result) => {
        try {
          const value = onFulfilled(result);
          if (value instanceof PromiseV2) {
            value.then(resolve, reject);
          } else {
            resolve(value);
          }
        } catch (e) {
          reject(e);
        }
      };
      const handleRejected = (reason) => {
        try {
          const value = onRejected(reason);
          if (value instanceof PromiseV2) {
            value.then(resolve, reject);
          } else {
            resolve(value);
          }
        } catch (e) {
          reject(e);
        }
      };

      switch (this.state) {
        case PENDING: {
          this.resolvedCallbacks.push(handleFulFilled);
          this.rejectedCallbacks.push(handleRejected);
          break;
        }

        case RESOLVED: {
          handleFulFilled(this.value);
          break;
        }

        case REJECTED:
        default: {
          handleRejected(this.value);
          break;
        }
      }
    });
  }

  catch(onRejected) {
    console.log("[catch]", JSON.stringify(this.#dump));
    return this.then(null, onRejected);
  }

  finally(callback) {
    console.log("[finally]", JSON.stringify(this.#dump));
    return this.then(
      (value) => {
        callback();
        return value;
      },
      (reason) => {
        callback();
        throw reason;
      },
    );
  }

  static resolve(value) {
    if (value instanceof PromiseV2) {
      return value;
    }
    return new PromiseV2((resolve) => resolve(value));
  }

  static reject(value) {
    return new PromiseV2((_, reject) => reject(value));
  }
}

new PromiseV2((resolve, reject) => {
  setTimeout(() => {
    const rand = Math.random();
    console.log("[executor]", rand.toFixed(2));
    if (rand < 0.5) {
      resolve(rand.toFixed(2));
    } else {
      reject(rand.toFixed(2));
    }
  }, 3000);
})
  .then(
    (result) => {
      console.log("[onFulfilled]", result);
      return { result };
    },
    (reason) => {
      console.log("[onRejected]", reason);
      throw new Error(`{ rand: ${reason} }`);
    },
  )
  .then((result) => {
    console.log("[onFulfilled-2]", result);
    return { result };
  })
  .catch((reason) => {
    console.log("[onRejected-2]", reason);
    throw new Error(`{ reason: ${reason} }`);
  })
  .finally(() => {
    console.log("[finally] Done");
  });
