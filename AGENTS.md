# AGENTS.md

## Mermaid Color Specification

Colors are from the Tailwind CSS v4 default palette. Every mermaid block must start with:

```
%%{init: {'themeVariables': {'fontFamily': 'Swifty'}}}%%
```

### Palette

Fill uses -100, stroke uses -600, text is always `#000`.

| Name   | Fill      | Stroke    | Tailwind                | Meaning                      |
| ------ | --------- | --------- | ----------------------- | ---------------------------- |
| green  | `#dcfce7` | `#16a34a` | green-100 / green-600   | entry, success, normal flow  |
| amber  | `#fef3c7` | `#d97706` | amber-100 / amber-600   | intermediate step, lookup    |
| purple | `#f3e8ff` | `#9333ea` | purple-100 / purple-600 | internal mechanism, blocking |
| blue   | `#dbeafe` | `#2563eb` | blue-100 / blue-600     | output, resume, response     |
| red    | `#fee2e2` | `#dc2626` | red-100 / red-600       | error, failure               |
| cyan   | `#cffafe` | `#0891b2` | cyan-100 / cyan-600     | external dependency, I/O     |
| slate  | `#f1f5f9` | `#475569` | slate-100 / slate-600   | neutral, auxiliary           |

### Flowchart

Use `classDef` + `class`, never inline `style`. Only include colors actually used:

```
classDef green fill:#dcfce7,stroke:#16a34a,color:#000
classDef blue fill:#dbeafe,stroke:#2563eb,color:#000
class A green
class B blue
```

### Sequence Diagram

Use `rect` with the -100 fill color (rgb form) to highlight phases. Do not customize participant colors:

```
rect #dbeafe
  Note over A, B: phase 1 (blue-100)
end
rect #dcfce7
  Note over A, B: phase 2 (green-100)
end
```

### Rules

1. Do not use hex or rgb values outside the palette above. To add a color, pick a Tailwind -100 / -600 pair and update this spec first.
2. Assign every flowchart node a color class. Use `slate` for intentionally neutral nodes.
3. Do not override `stroke-width` unless emphasizing a critical path (max `2px`, at most 2 nodes).
4. Keep edge colors at theme default.
5. Prefer subgraphs over additional colors when node groups exceed 7.
