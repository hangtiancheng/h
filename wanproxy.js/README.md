# wanproxy-js

TypeScript migration of the core WANProxy TCP path. The implementation currently focuses on a local TCP proxy, strict JSON configuration, zlib composition, XCodec framing, and the XCodec pipe protocol session.

## Status

- `M0` through `M12` are implemented and validated.
- The current runtime covers XCodec, pipe protocol sessions, zlib pipeline composition, TCP proxying, SOCKS proxying, monitor status, persistent XCodec cache, and large-file correctness validation.
- The JavaScript version uses JSON configuration only. It does not parse the original `wanproxy.conf` format.
- The old C++ SSH transport is explicitly not migrated. Secure transport compatibility is not a goal for this migration wave.

## Use Cases

- Local TCP proxying for forwarding one local port to an upstream TCP service.
- Codec-path validation with XCodec, zlib, or combined pipeline modes.
- SOCKS4/SOCKS5 CONNECT proxying for clients that can select the destination at connect time.
- Runtime introspection through the local JSON monitor endpoint.
- XCodec correctness verification with deterministic tests, golden wire snapshots, and large-file SHA-256 roundtrip validation.

## Demos

Runnable demo sources and configs live under `src/demo/`:

- `src/demo/tcp-pass-through.json`: TCP pass-through with monitor status.
- `src/demo/tcp-xcodec-echo.json`: XCodec encode/decode path using a local echo server.
- `src/demo/socks-with-monitor.json`: SOCKS5 CONNECT proxy with monitor status.
- `src/demo/echo-server.ts`: local TCP echo server used by the demos.
- `src/demo/tcp-client.ts`: simple TCP client for pass-through and XCodec demos.
- `src/demo/socks5-client.ts`: simple SOCKS5 CONNECT client.

After `pnpm build`, run demo scripts from `dist/demo/*.js`. See `src/demo/README.md` for step-by-step commands.

## Quick Start

Install dependencies:

```bash
pnpm install
```

Build the project:

```bash
pnpm build
```

Create `proxy.json`:

```json
{
  "proxies": [
    {
      "name": "local-echo",
      "listen": { "host": "127.0.0.1", "port": 3300 },
      "upstream": { "host": "127.0.0.1", "port": 3301 },
      "codec": { "mode": "none", "role": "incoming" }
    }
  ]
}
```

Run the configured proxy:

```bash
node dist/cli/index.js proxy.json
```

The CLI also accepts:

```bash
node dist/cli/index.js --config proxy.json
```

## Configuration

Configuration is parsed through `zod` at the file boundary. Invalid JSON shape, empty proxy lists, invalid ports, unknown codec modes, and invalid roles fail fast before any listener starts.

Top-level schema:

```json
{
  "proxies": [
    {
      "name": "proxy-name",
      "listen": { "host": "127.0.0.1", "port": 0 },
      "upstream": { "host": "127.0.0.1", "port": 8080 },
      "codec": {
        "mode": "none",
        "role": "incoming",
        "compressorLevel": 6
      }
    }
  ]
}
```

Codec fields:

- `mode`: `none`, `zlib`, `xcodec`, or `zlib+xcodec`; defaults to `none`.
- `role`: `incoming` or `outgoing`; defaults to `incoming`.
- `compressorLevel`: optional zlib level from `-1` through `9`.

## Architecture

- `src/config`: JSON configuration schemas and loader.
- `src/proxy`: TCP listener, upstream connector, bidirectional relay, and proxy fleet lifecycle.
- `src/monitor`: local JSON status endpoint for runtime introspection.
- `src/pipeline`: explicit stream pipeline builder for pass-through, zlib, XCodec session, and combined modes.
- `src/pipe-protocol`: HELLO, FRAME, ASK, LEARN, ADVANCE, EOS, and EOS_ACK session protocol.
- `src/xcodec`: pure XCodec hash, frame primitives, memory cache, persistent cache, backref window, encoder, and decoder.
- `src/validation`: large-file XCodec correctness harness and stream hashing helpers.
- `src/cli`: command-line entry point for starting configured TCP proxies.

The TCP relay uses manual bidirectional `pipe()` chains instead of `stream/promises.pipeline()` because duplex sockets must preserve half-close behavior while the opposite direction flushes pending data.

## Development

Run the standard validation set:

```bash
pnpm check
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm build
```

Coverage uses the V8 provider with global thresholds:

- Lines: at least `90%`.
- Statements: at least `90%`.
- Branches: at least `85%`.

Coverage HTML output is written under `coverage/`.

## Golden Snapshots

Golden wire snapshots live in `test/golden/wire-snapshots.spec.ts`. They pin representative byte encodings for:

- XCodec escape, ref, and backref frames.
- Pipe-protocol HELLO, FRAME, ASK, ADVANCE, EOS, and EOS_ACK frames.
- A minimal `CodecSession.encodeData()` exchange.

Update these snapshots only when the wire format intentionally changes.

## Large-File Validation

`large-file.js` is the repeatable XCodec correctness harness for large payloads. It builds the project, creates a fixture with `src/cli/create-large-file.ts`, streams the file through XCodec encode and decode transforms from `src/validation`, and compares SHA-256 hashes without loading the whole file into memory.

Run the default 3 GiB verification:

```bash
node large-file.js
```

Useful options:

- `--size-gb=N`: fixture size in GiB; defaults to `3`.
- `--file=PATH`: fixture path relative to the project root; defaults to `large-xcodec-fixture.bin`.
- `--force`: recreate the fixture even when a same-size file already exists.
- `--skip-build`: reuse existing `dist/` output.
- `--workers=N`: worker count for fixture generation.
- `--chunk-mib=N`: write chunk size for fixture generation.
- `--cache-segments=N`: in-memory XCodec cache size during verification; defaults to `4096`.
- `--json`: print a machine-readable success summary.

Example quick smoke run:

```bash
node large-file.js --size-gb=1 --file=large-file-smoke.bin --force --skip-build --json
```

Clean up generated fixtures:

```bash
rm -f large-xcodec-fixture.bin large-file-smoke.bin large-file.log
```

## Troubleshooting

- If the CLI exits with a usage error, pass exactly one positional JSON path or `--config <path>`.
- If configuration parsing fails, validate port ranges, non-empty host strings, codec mode names, and role names.
- If a TCP test hangs, check for accepted sockets that were not destroyed before server shutdown.
- If echo traffic returns empty data, verify both listener and upstream sockets are created with half-open behavior.
- If zlib plus XCodec fails to round-trip, check the pipeline role and direction ordering first.
- If large-file validation fails before hashing, run `pnpm build` or remove `--skip-build`.
- If large-file validation reuses stale data, pass `--force` or delete the fixture.

## Residual Gaps

- Operational logging and metrics are minimal.
- Full C++ protocol compatibility has not been certified against a live C++ WANProxy peer.
- SSH transport migration is intentionally out of scope.
