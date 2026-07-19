/**
 *
 * @param {string} text
 * @returns {string}
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/^(\d)/, "_$1");
}

console.log(slugify("React Native 的 CSS 对比 Web 的 CSS, Yoga 布局引擎"));
