/* Runtime polyfills for the app's API floor.
 *
 * The bundle is built to es2017 (see build.target in vite.config.ts), which is
 * the syntax every module-capable engine can parse. This file covers the other
 * half of the problem: APIs that are newer than that syntax floor. A browser can
 * parse the bundle perfectly and still die on `str.replaceAll`, which is exactly
 * what used to happen on Chrome 61-84 and Safari 10.1-13.0.
 *
 * Loaded as a classic script from <head>, before the module, so it is never
 * transpiled and never deferred. Written in ES5 for the same reason: an engine
 * old enough to need a polyfill may also be old enough to choke on arrow
 * functions, and a polyfill that cannot parse is no polyfill at all.
 *
 * Every block is guarded, so a modern browser runs the feature-detection checks
 * and nothing else.
 */
(function () {
  "use strict";

  if (typeof globalThis === "undefined") {
    // Only the window case matters here: this script never runs in a worker.
    // eslint-disable-next-line no-undef
    window.globalThis = window;
  }

  if (typeof window.queueMicrotask !== "function") {
    window.queueMicrotask = function (callback) {
      Promise.resolve()
        .then(callback)
        .catch(function (error) {
          setTimeout(function () {
            throw error;
          }, 0);
        });
    };
  }

  var define = function (target, name, value) {
    if (target && !Object.prototype.hasOwnProperty.call(target, name)) {
      Object.defineProperty(target, name, {
        value: value,
        writable: true,
        configurable: true,
      });
    }
  };

  // --- String ---------------------------------------------------------------

  define(String.prototype, "replaceAll", function (search, replacement) {
    var subject = String(this);
    // A regex without the global flag is a TypeError per spec, and silently
    // replacing the first match instead would be a wrong answer, not a crash.
    if (search instanceof RegExp) {
      if (!search.global) throw new TypeError("replaceAll requires a global RegExp");
      return subject.replace(search, replacement);
    }
    var find = String(search);
    if (find === "") return subject.split("").join(replacement);
    return subject.split(find).join(replacement);
  });

  define(String.prototype, "trimStart", function () {
    return String(this).replace(/^[\s\uFEFF\xA0]+/, "");
  });

  define(String.prototype, "trimEnd", function () {
    return String(this).replace(/[\s\uFEFF\xA0]+$/, "");
  });

  // --- Object ---------------------------------------------------------------

  define(Object, "hasOwn", function (object, key) {
    return Object.prototype.hasOwnProperty.call(Object(object), key);
  });

  define(Object, "fromEntries", function (entries) {
    var result = {};
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      result[entry[0]] = entry[1];
    }
    return result;
  });

  // --- Array ----------------------------------------------------------------

  define(Array.prototype, "flat", function (depth) {
    var levels = depth === undefined ? 1 : depth;
    return this.reduce(function (acc, value) {
      if (Array.isArray(value) && levels > 0) {
        acc.push.apply(acc, value.flat(levels - 1));
      } else {
        acc.push(value);
      }
      return acc;
    }, []);
  });

  define(Array.prototype, "flatMap", function (callback, thisArg) {
    return this.map(callback, thisArg).flat(1);
  });

  define(Array.prototype, "findLast", function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return this[i];
    }
    return undefined;
  });

  define(Array.prototype, "findLastIndex", function (predicate, thisArg) {
    for (var i = this.length - 1; i >= 0; i--) {
      if (predicate.call(thisArg, this[i], i, this)) return i;
    }
    return -1;
  });

  define(Array.prototype, "at", function (index) {
    var length = this.length;
    var offset = Math.trunc(index) || 0;
    return offset < 0 ? this[length + offset] : this[offset];
  });

  define(Array.prototype, "toSorted", function (compare) {
    return this.slice().sort(compare);
  });

  define(Array.prototype, "toReversed", function () {
    return this.slice().reverse();
  });

  define(Array.prototype, "with", function (index, value) {
    var copy = this.slice();
    var offset = Math.trunc(index) || 0;
    copy[offset < 0 ? copy.length + offset : offset] = value;
    return copy;
  });

  // --- Promise --------------------------------------------------------------

  var NativePromise = window.Promise;
  if (NativePromise) {
    define(NativePromise.prototype, "finally", function (callback) {
      return this.then(
        function (value) {
          return NativePromise.resolve(callback()).then(function () {
            return value;
          });
        },
        function (reason) {
          return NativePromise.resolve(callback()).then(function () {
            throw reason;
          });
        },
      );
    });

    define(NativePromise, "allSettled", function (iterable) {
      var items = Array.prototype.slice.call(iterable);
      return NativePromise.all(
        items.map(function (item) {
          return NativePromise.resolve(item).then(
            function (value) {
              return { status: "fulfilled", value: value };
            },
            function (reason) {
              return { status: "rejected", reason: reason };
            },
          );
        }),
      );
    });

    define(NativePromise, "any", function (iterable) {
      var items = Array.prototype.slice.call(iterable);
      return new NativePromise(function (resolve, reject) {
        var errors = new Array(items.length);
        var pending = items.length;
        if (pending === 0) {
          reject(new Error("All promises were rejected"));
          return;
        }
        items.forEach(function (item, index) {
          NativePromise.resolve(item).then(resolve, function (reason) {
            errors[index] = reason;
            pending -= 1;
            if (pending === 0) {
              var error = new Error("All promises were rejected");
              error.errors = errors;
              reject(error);
            }
          });
        });
      });
    });
  }

  // --- DOM ------------------------------------------------------------------

  if (window.Element && typeof window.Element.prototype.replaceChildren !== "function") {
    define(window.Element.prototype, "replaceChildren", function () {
      var children = Array.prototype.slice.call(arguments);
      this.textContent = "";
      for (var i = 0; i < children.length; i++) {
        var child = children[i];
        this.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    });
  }

  // --- crypto ---------------------------------------------------------------

  if (window.crypto && typeof window.crypto.randomUUID !== "function") {
    define(window.crypto, "randomUUID", function () {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      // Version 4 and variant 10xx, as the UUID spec requires.
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = [];
      for (var i = 0; i < 16; i++) {
        hex.push((bytes[i] + 0x100).toString(16).slice(1));
      }
      return (
        hex.slice(0, 4).join("") +
        "-" +
        hex.slice(4, 6).join("") +
        "-" +
        hex.slice(6, 8).join("") +
        "-" +
        hex.slice(8, 10).join("") +
        "-" +
        hex.slice(10, 16).join("")
      );
    });
  }

  // --- structuredClone ------------------------------------------------------

  if (typeof window.structuredClone !== "function") {
    window.structuredClone = function structuredClone(value) {
      // Depth-first copy with a seen-map, so cycles and repeated references
      // survive as references instead of recursing forever.
      var seen = new Map();
      function copy(input) {
        if (input === null || typeof input !== "object") return input;
        if (seen.has(input)) return seen.get(input);

        if (input instanceof Date) return new Date(input.getTime());
        if (input instanceof RegExp) return new RegExp(input.source, input.flags);
        if (input instanceof Map) {
          var map = new Map();
          seen.set(input, map);
          input.forEach(function (mapValue, mapKey) {
            map.set(copy(mapKey), copy(mapValue));
          });
          return map;
        }
        if (input instanceof Set) {
          var set = new Set();
          seen.set(input, set);
          input.forEach(function (setValue) {
            set.add(copy(setValue));
          });
          return set;
        }
        if (input instanceof ArrayBuffer) return input.slice(0);
        if (ArrayBuffer.isView(input)) {
          return new input.constructor(copy(input.buffer), input.byteOffset, input.length);
        }

        var output = Array.isArray(input) ? [] : {};
        seen.set(input, output);
        Object.keys(input).forEach(function (key) {
          output[key] = copy(input[key]);
        });
        return output;
      }
      return copy(value);
    };
  }

  // --- observers ------------------------------------------------------------

  // Used by the chart and carousel components. A no-op is the honest stand-in:
  // the content still renders, it just does not resize or lazy-load itself. The
  // alternative is a component that throws on mount and takes the page with it.
  function inertObserver() {
    function Observer(callback) {
      this._callback = callback;
    }
    Observer.prototype.observe = function () {};
    Observer.prototype.unobserve = function () {};
    Observer.prototype.disconnect = function () {};
    Observer.prototype.takeRecords = function () {
      return [];
    };
    return Observer;
  }

  if (typeof window.ResizeObserver !== "function") {
    window.ResizeObserver = inertObserver();
  }
  if (typeof window.IntersectionObserver !== "function") {
    window.IntersectionObserver = inertObserver();
  }
})();
