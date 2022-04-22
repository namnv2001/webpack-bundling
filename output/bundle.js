const modules = {"C:\workspace\simple-webpack\input\index.js": function(exports, require) { const {
  default: areaSquare
} = require("C:\\workspace\\simple-webpack\\input\\square.js");
const {
  default: areaCircle
} = require("C:\\workspace\\simple-webpack\\input\\circle.js");
console.log('Area of square: ', areaSquare(10));
console.log('Area of circle: ', areaCircle(10)); },"C:\workspace\simple-webpack\input\square.js": function(exports, require) { function area(side) {
  return side * side;
}
exports.default = area; },"C:\workspace\simple-webpack\input\circle.js": function(exports, require) { const PI = 3.14;
function area(radius) {
  return PI * radius * radius;
}
exports.default = area; },};
const entry = 'C:\workspace\simple-webpack\input\index.js';
function webpackStart({ modules, entry }) {
  const moduleCache = {};
  const require = moduleName => {
    // if in cache, return the cached version
    if (moduleCache[moduleName]) {
      return moduleCache[moduleName];
    }
    const exports = {};
    // prevent infinite require loops from circular dependencies
    moduleCache[moduleName] = exports;
    // require the module
    modules[moduleName](exports, require);
    return moduleCache[moduleName];
  };
  // start the program
  require(entry);
}
webpackStart({ modules, entry });
  