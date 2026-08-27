class Scheduler {
  n = 2;
  buf = Array.from({ length: this.n }, () => null);
  pending = [];

  add(promiseCreator) {
    for (let i = 0; i < this.n; i++) {
      if (!this.buf[i]) {
        const p = promiseCreator();
        this.buf[i] = p;

        p.finally(() => {
          this.buf[i] = null;
          const pc = this.pending.shift();
          if (pc) {
            this.add(pc);
          }
        });
        break;
      }
    }
    this.pending.push(promiseCreator);
  }
}

function timeout(time) {
  return new Promise((r) => {
    setTimeout(r, time);
  });
}

const s = new Scheduler();
function addTask(time, order) {
  s.add(() =>
    timeout(time).then(() => {
      console.log(order);
    }),
  );
}

addTask(1000, "1");
addTask(500, "2");
addTask(300, "3");
addTask(400, "4");
