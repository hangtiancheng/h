/**
 * @return {string}
 */
Date.prototype.nextDay = function () {
  const date = new Date(this);
  date.setDate(this.getDate() + 1);
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
};
