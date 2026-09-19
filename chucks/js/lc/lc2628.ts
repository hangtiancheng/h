type JSONValue =
  null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };

function areDeeplyEqual(o1: JSONValue, o2: JSONValue): boolean {
  if (
    typeof o1 !== "object" ||
    o1 === null ||
    typeof o2 !== "object" ||
    o2 === null
  ) {
    return o1 === o2;
  }
  if (Array.isArray(o1) && Array.isArray(o2)) {
    const len = o1.length;
    if (len !== o2.length) {
      return false;
    }
    for (let i = 0; i < len; i++) {
      if (!areDeeplyEqual(o1[i], o2[i])) {
        return false;
      }
    }
    return true;
  }
  if (!Array.isArray(o1) && !Array.isArray(o2)) {
    const ks1 = Object.keys(o1);
    const ks2 = Object.keys(o2);
    const len = ks1.length;
    if (len !== ks2.length) {
      return false;
    }
    ks1.sort();
    ks2.sort();
    for (let i = 0; i < len; i++) {
      if (!(ks1[i] === ks2[i]) || !areDeeplyEqual(o1[ks1[i]], o2[ks2[i]])) {
        return false;
      }
    }
    return true;
  } else {
    return false;
  }
}

export default areDeeplyEqual;
