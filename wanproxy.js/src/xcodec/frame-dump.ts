import { ByteQueue } from "./byte-queue.js";
import { readFrame, type XCodecFrame } from "./frame-codec.js";
import { formatUint64Hex } from "./uint64.js";

export function dumpXCodecFrames(input: Uint8Array): readonly string[] {
  const queue = new ByteQueue();
  queue.append(input);
  const lines: string[] = [];

  while (queue.length > 0) {
    const result = readFrame(queue);
    if (result.status === "need-more") {
      lines.push("need-more");
      break;
    }
    if (result.status === "invalid") {
      lines.push(`invalid ${result.reason}`);
      break;
    }
    lines.push(formatFrame(result.frame));
  }
  return lines;
}

function formatFrame(frame: XCodecFrame): string {
  switch (frame.kind) {
    case "escape":
      return "ESCAPE";
    case "extract":
      return `EXTRACT ${frame.segment.length}`;
    case "ref":
      return `REF ${formatUint64Hex(frame.hash)}`;
    case "backref":
      return `BACKREF ${frame.index}`;
  }
}
