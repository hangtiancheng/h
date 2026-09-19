/**
 * @param {Array<number>} arr
 * @param {number} startIndex
 * @yields {number}
 */
function* cycleGenerator(arr, startIndex) {
  let idx = startIndex;
  while (true) {
    const val = yield arr[idx];
    console.log(val);
    idx = (((idx + val) % arr.length) + arr.length) % arr.length;
  }
}

export default cycleGenerator;
