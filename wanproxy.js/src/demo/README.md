# wanproxy-js Demos

These demos show the intended use cases for `wanproxy-js` after the C++ migration work:

- TCP pass-through proxy for local services.
- TCP proxy with XCodec enabled for codec-path validation.
- SOCKS5 CONNECT proxy.
- Monitor status endpoint for runtime introspection.
- Large-file XCodec correctness validation.

Build first:

```bash
pnpm build
```

## Demo 1: TCP Pass-Through

Start an echo server:

```bash
node dist/demo/echo-server.js 8301
```

Start the proxy:

```bash
node dist/cli/index.js src/demo/tcp-pass-through.json
```

Send traffic through the proxy:

```bash
node dist/demo/tcp-client.js 8300 127.0.0.1 "hello tcp"
```

Expected output:

```text
hello tcp
```

Read monitor status:

```bash
curl http://127.0.0.1:8400/status
```

## Demo 2: TCP XCodec Echo Path

This demo is useful for validating the XCodec stream path. The upstream echo server receives encoded bytes and echoes them back; the proxy decodes the response before returning it to the client.

Start an echo server:

```bash
node dist/demo/echo-server.js 8311
```

Start the XCodec proxy:

```bash
node dist/cli/index.js src/demo/tcp-xcodec-echo.json
```

Send traffic:

```bash
node dist/demo/tcp-client.js 8310 127.0.0.1 "hello xcodec"
```

Expected output:

```text
hello xcodec
```

Read monitor status:

```bash
curl http://127.0.0.1:8401/status
```

## Demo 3: SOCKS5 CONNECT

Start an echo server:

```bash
node dist/demo/echo-server.js 8301
```

Start the SOCKS proxy:

```bash
node dist/cli/index.js src/demo/socks-with-monitor.json
```

Send traffic through SOCKS5:

```bash
node dist/demo/socks5-client.js 8320 8301 "hello socks"
```

Expected output:

```text
hello socks
```

Read monitor status:

```bash
curl http://127.0.0.1:8402/status
```

## Demo 4: Large-File XCodec Verification

Run the default 3 GiB correctness check:

```bash
node large-file.js --skip-build --json
```

Run a smaller smoke check:

```bash
node large-file.js --size-gb=1 --file=large-file-smoke.bin --force --skip-build --json
```

Clean generated files:

```bash
rm -f large-xcodec-fixture.bin large-file-smoke.bin large-file.log
```

## Non-Goal: SSH Transport

The old C++ SSH transport is explicitly not migrated. `wanproxy-js` focuses on the WANProxy logic that matters for this migration: byte-stream proxying, XCodec, zlib composition, pipe protocol sessions, SOCKS CONNECT, monitor status, persistent cache, and large-file correctness validation.
