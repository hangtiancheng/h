type QueryMultiple = (keys: string[]) => Promise<string[]>;

class QueryBatcher {
  queryMultiple: QueryMultiple;
  throttleInterval: number;
  queries: [resolve: (value: string) => void, key: string][] = [];
  throttling = false;
  constructor(queryMultiple: QueryMultiple, t: number) {
    this.queryMultiple = queryMultiple;
    this.throttleInterval = t;
  }

  async batchQuery() {
    const queries = this.queries;
    this.queries = [];
    const resolves = queries.map((item) => item[0]);
    const keys = queries.map((item) => item[1]);
    const resArr = await this.queryMultiple(keys);
    for (const [i, res] of resArr.entries()) {
      resolves[i](res);
    }
  }

  consume() {
    if (this.queries.length === 0 || this.throttling) {
      return;
    }
    this.batchQuery();
    this.throttling = true;
    setTimeout(() => {
      this.throttling = false;
      this.consume();
    }, this.throttleInterval);
  }

  async getValue(key: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.queries.push([resolve, key]);
      this.consume();
    });
  }
}

export default QueryBatcher;
