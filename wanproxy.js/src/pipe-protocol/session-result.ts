export interface CodecSessionReceiveResult {
  readonly status: "ok" | "invalid";
  readonly output: Uint8Array;
  readonly responses: Uint8Array;
  readonly reason?: string;
}

export function ok(): CodecSessionReceiveResult {
  return {
    output: new Uint8Array(),
    responses: new Uint8Array(),
    status: "ok",
  };
}

export function invalid(reason: string): CodecSessionReceiveResult {
  return {
    output: new Uint8Array(),
    reason,
    responses: new Uint8Array(),
    status: "invalid",
  };
}
