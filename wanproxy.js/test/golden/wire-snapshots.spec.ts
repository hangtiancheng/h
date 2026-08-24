import { describe, expect, it } from "vitest";

import { CodecSession } from "@/pipe-protocol/codec-session.js";
import { encodePipeFrame } from "@/pipe-protocol/control-frame.js";
import { encodeFrame } from "@/xcodec/frame-codec.js";

function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

describe("golden wire snapshots", () => {
  it("pins representative XCodec frame bytes", () => {
    expect({
      backref: hex(encodeFrame({ index: 7, kind: "backref" })),
      escape: hex(encodeFrame({ kind: "escape" })),
      ref: hex(encodeFrame({ hash: 0x0123_4567_89ab_cdefn, kind: "ref" })),
    }).toMatchInlineSnapshot(`
      {
        "backref": "f10307",
        "escape": "f100",
        "ref": "f1020123456789abcdef",
      }
    `);
  });

  it("pins representative pipe-protocol control frames", () => {
    const id = Uint8Array.from({ length: 16 }, (_, index) => index);
    expect({
      advance: hex(encodePipeFrame({ count: 3, kind: "advance" })),
      ask: hex(
        encodePipeFrame({ hashes: [0x0123_4567_89ab_cdefn], kind: "ask" }),
      ),
      eos: hex(encodePipeFrame({ kind: "eos" })),
      eosAck: hex(encodePipeFrame({ kind: "eos-ack" })),
      frame: hex(
        encodePipeFrame({ kind: "frame", payload: Uint8Array.from([1, 2, 3]) }),
      ),
      hello: hex(encodePipeFrame({ id, kind: "hello" })),
    }).toMatchInlineSnapshot(`
      {
        "advance": "0100000003",
        "ask": "f000010123456789abcdef",
        "eos": "fc",
        "eosAck": "fb",
        "frame": "0200000003010203",
        "hello": "ff10000102030405060708090a0b0c0d0e0f",
      }
    `);
  });

  it("pins a minimal codec session data exchange", () => {
    const session = new CodecSession({
      id: Uint8Array.from({ length: 16 }, (_, index) => 0xa0 + index),
    });
    expect(
      hex(session.encodeData(Buffer.from("WANProxy", "utf8"))),
    ).toMatchInlineSnapshot(
      `"ff10a0a1a2a3a4a5a6a7a8a9aaabacadaeaf020000000857414e50726f7879"`,
    );
  });
});
