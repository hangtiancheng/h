export const packageName = "wanproxy-js";

export function createVersionLabel(version: string): string {
  return `${packageName}@${version}`;
}
