"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: Symbol("kIsForOnEventAttribute"),
      kListener: Symbol("kListener"),
      kStatusCode: Symbol("status-code"),
      kWebSocket: Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = Symbol("kDone");
    var kRun = Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = Symbol("permessage-deflate");
    var kTotalLength = Symbol("total-length");
    var kCallback = Symbol("callback");
    var kBuffers = Symbol("buffers");
    var kError = Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message2, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message2}` : message2
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = Symbol("kCode");
    var kData = Symbol("kData");
    var kError = Symbol("kError");
    var kMessage = Symbol("kMessage");
    var kReason = Symbol("kReason");
    var kTarget = Symbol("kTarget");
    var kType = Symbol("kType");
    var kWasClean = Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message2) {
            const event = new CloseEvent("close", {
              code,
              reason: message2.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token2 = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token2, params);
      } else {
        if (paramName === void 0) {
          push(params, token2, true);
        } else if (mustUnescape) {
          push(params, paramName, token2.replace(/\\/g, ""));
        } else {
          push(params, paramName, token2);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net = require("net");
    var tls = require("tls");
    var { randomBytes: randomBytes2, createHash: createHash2 } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address2, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address2 !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address2, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address2, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address2 instanceof URL2) {
        parsedUrl = address2;
      } else {
        try {
          parsedUrl = new URL2(address2);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address2}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes2(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address2);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message2 = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message2);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message2 = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message2);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message2 = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message2);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message2 = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message2);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message2) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message2);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message2(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../../\u5B58\u50A8/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash: createHash2 } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message2 = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message2);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message2 = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message2);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message2 = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message2);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message2 = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message2, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message2 = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message2);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message2 = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message2);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message2, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message2, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash2("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message2, headers) {
      message2 = message2 || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message2),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message2
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message2, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message2);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message2, headers);
      }
    }
  }
});

// ../../../存储/pi-desktop-dev/group-rooms-worktree/apps/desktop/electron/main/group-rooms/index.ts
var index_exports = {};
__export(index_exports, {
  createRoomNetworkService: () => createRoomNetworkService
});
module.exports = __toCommonJS(index_exports);
var import_node_util = require("node:util");
var import_node_crypto2 = require("node:crypto");
var import_node_https = require("node:https");

// ../../../存储/pi-desktop-dev/PI-Desktop/node_modules/.pnpm/ws@8.21.1/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);
var wrapper_default = import_websocket.default;

// ../../../存储/pi-desktop-dev/group-rooms-worktree/apps/desktop/electron/main/group-rooms/crypto.ts
var import_node_crypto = require("node:crypto");
var hash = (value) => (0, import_node_crypto.createHash)("sha256").update(value).digest("hex");
var token = () => (0, import_node_crypto.randomBytes)(32).toString("base64url");
var der = (tag, ...parts) => {
  const body = Buffer.concat(parts);
  const size = body.length < 128 ? Buffer.from([body.length]) : (() => {
    const bytes = [];
    let n = body.length;
    while (n) {
      bytes.unshift(n & 255);
      n >>>= 8;
    }
    return Buffer.from([128 | bytes.length, ...bytes]);
  })();
  return Buffer.concat([Buffer.from([tag]), size, body]);
};
var seq = (...parts) => der(48, ...parts);
var oid = (hex) => der(6, Buffer.from(hex, "hex"));
var algorithm = () => seq(oid("2a864886f70d01010b"), der(5));
var time = (date) => der(23, Buffer.from(date.toISOString().replace(/[-:T]/g, "").slice(2, 14) + "Z"));
function createIdentity() {
  const pair = (0, import_node_crypto.generateKeyPairSync)("rsa", { modulusLength: 2048 });
  const name = seq(der(49, seq(oid("550403"), der(12, Buffer.from("PI Desktop Room")))));
  const serial = (0, import_node_crypto.randomBytes)(16);
  serial[0] &= 127;
  serial[0] |= 1;
  const tbs = seq(
    der(160, der(2, Buffer.from([2]))),
    der(2, serial),
    algorithm(),
    name,
    seq(time(new Date(Date.now() - 864e5)), time(new Date(Date.now() + 5 * 365 * 864e5))),
    name,
    pair.publicKey.export({ type: "spki", format: "der" })
  );
  const certDer = seq(tbs, algorithm(), der(3, Buffer.from([0]), (0, import_node_crypto.sign)("sha256", tbs, pair.privateKey)));
  const cert = `-----BEGIN CERTIFICATE-----
${certDer.toString("base64").match(/.{1,64}/g)?.join("\n")}
-----END CERTIFICATE-----
`;
  return { key: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(), cert, fingerprint: hash(new import_node_crypto.X509Certificate(cert).raw) };
}
function address(value) {
  const url = new URL(value.includes("://") ? value : `wss://${value}`);
  if (url.protocol !== "wss:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Invalid room address");
  return url.origin;
}
function encodeInvitation(value) {
  return `pi-room:${encodeURIComponent(Buffer.from(JSON.stringify(value)).toString("base64url"))}`;
}
function decodeInvitation(value) {
  if (typeof value !== "string" || value.length > 4096 || !value.startsWith("pi-room:")) throw new Error("Invalid invitation");
  const data = JSON.parse(Buffer.from(decodeURIComponent(value.slice(8)), "base64url").toString());
  if (!data || typeof data !== "object") throw new Error("Invalid invitation");
  const v = data;
  if (v.v !== 1 || typeof v.roomId !== "string" || !v.roomId || v.roomId.length > 128 || typeof v.address !== "string" || typeof v.fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(v.fingerprint) || typeof v.ticket !== "string" || !/^[\w-]{43}$/.test(v.ticket) || typeof v.expires !== "number" || !Number.isSafeInteger(v.expires) || v.expires <= Date.now()) throw new Error("Invalid or expired invitation");
  return { v: 1, roomId: v.roomId, address: address(v.address), fingerprint: v.fingerprint, ticket: v.ticket, expires: v.expires };
}

// ../../../存储/pi-desktop-dev/group-rooms-worktree/apps/desktop/electron/main/group-rooms/transport.ts
var import_node_tls = require("node:tls");
var MAX_FRAME = 1024 * 1024;
function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object");
  return value;
}
function text(value, max = 128) {
  if (typeof value !== "string" || !value.length || value.length > max) throw new Error("Invalid string");
  return value;
}
var Peer = class {
  next = 0;
  pending = /* @__PURE__ */ new Map();
  inflight = 0;
  alive = true;
  socket;
  constructor(socket, handler, closed) {
    this.socket = socket;
    const heartbeat = setInterval(() => {
      if (!this.alive) {
        socket.terminate();
        return;
      }
      this.alive = false;
      if (socket.readyState === wrapper_default.OPEN) socket.ping();
    }, 1e4);
    heartbeat.unref();
    socket.on("pong", () => {
      this.alive = true;
    });
    socket.on("error", () => socket.terminate());
    socket.on("close", () => {
      clearInterval(heartbeat);
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("Disconnected"));
      }
      this.pending.clear();
      closed();
    });
    socket.on("message", (raw, binary) => {
      try {
        if (binary || Buffer.byteLength(raw.toString()) > MAX_FRAME) throw new Error("Invalid frame");
        const frame = object(JSON.parse(raw.toString()));
        if (frame.v !== 1 || !Number.isSafeInteger(frame.id) || Number(frame.id) < 1) throw new Error("Invalid protocol version or ID");
        const id = Number(frame.id);
        if (frame.reply === true) {
          const p = this.pending.get(id);
          if (!p) return;
          clearTimeout(p.timer);
          this.pending.delete(id);
          if (typeof frame.error === "string") p.reject(new Error(frame.error));
          else p.resolve(frame.data);
        } else {
          const method = text(frame.method, 32);
          if (++this.inflight > 64) throw new Error("Too many requests");
          void (async () => {
            try {
              this.send({ v: 1, id, reply: true, data: await handler(method, frame.data) });
            } catch (error) {
              this.send({ v: 1, id, reply: true, error: error instanceof Error ? error.message.slice(0, 200) : "Request failed" });
            } finally {
              this.inflight--;
            }
          })().catch(() => socket.terminate());
        }
      } catch {
        socket.terminate();
      }
    });
  }
  send(frame) {
    const body = JSON.stringify(frame);
    if (Buffer.byteLength(body) > MAX_FRAME || this.socket.bufferedAmount > 2 * MAX_FRAME) {
      this.socket.terminate();
      throw new Error("Room network capacity exceeded");
    }
    if (this.socket.readyState !== wrapper_default.OPEN) throw new Error("Disconnected");
    this.socket.send(body);
  }
  call(method, data, timeout = 15e3) {
    if (this.pending.size >= 64) return Promise.reject(new Error("Too many requests"));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Room request timeout"));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send({ v: 1, id, method, data });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  close() {
    this.socket.terminate();
  }
};
async function dial(urlValue, fingerprint, credential, signal) {
  const url = new URL(urlValue);
  const socket = await new Promise((resolve, reject) => {
    const tls = (0, import_node_tls.connect)({ host: url.hostname.replace(/^\[|\]$/g, ""), port: Number(url.port || 443), rejectUnauthorized: false });
    const timer = setTimeout(() => {
      tls.destroy();
      reject(new Error("TLS timeout"));
    }, 1e4);
    const abort = () => {
      clearTimeout(timer);
      tls.destroy();
      reject(new Error("Connection cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    tls.once("close", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    });
    if (signal?.aborted) abort();
    tls.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    tls.once("secureConnect", () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      const cert = tls.getPeerCertificate();
      if (!cert.raw || hash(cert.raw) !== fingerprint) {
        tls.destroy();
        reject(new Error("Certificate fingerprint mismatch"));
        return;
      }
      resolve(tls);
    });
  });
  return new Promise((resolve, reject) => {
    const ws = new wrapper_default(url, { headers: { Authorization: `Bearer ${credential}` }, createConnection: () => socket, rejectUnauthorized: false, maxPayload: MAX_FRAME, handshakeTimeout: 1e4, followRedirects: false });
    const abort = () => {
      ws.terminate();
      socket.destroy();
      reject(new Error("Connection cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    ws.once("close", () => signal?.removeEventListener("abort", abort));
    if (signal?.aborted) abort();
    ws.once("open", () => resolve(ws));
    ws.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

// ../../../存储/pi-desktop-dev/group-rooms-worktree/apps/desktop/electron/main/group-rooms/state.ts
var LIMIT_ATTACHMENTS = 32;
var ATTACHMENT_REF = /^attachments\/[0-9a-f]{64}$/i;
function roomAttachments(value) {
  if (value === void 0 || value === null) return void 0;
  if (!Array.isArray(value) || value.length > LIMIT_ATTACHMENTS) throw new Error("Invalid attachments");
  return value.map((entry) => {
    const a = object(entry), ref = text(a.ref, 128);
    if (!ATTACHMENT_REF.test(ref)) throw new Error("Invalid attachment ref");
    if (!["image", "file"].includes(String(a.kind))) throw new Error("Invalid attachment kind");
    if (a.mimeType !== void 0) text(a.mimeType, 128);
    if (a.size !== void 0 && (!Number.isSafeInteger(a.size) || Number(a.size) < 0)) throw new Error("Invalid attachment size");
    if (a.inlinePath !== void 0) text(a.inlinePath, 1024);
    return {
      ref,
      name: text(a.name, 255),
      kind: a.kind,
      ...a.mimeType !== void 0 ? { mimeType: String(a.mimeType) } : {},
      ...a.size !== void 0 ? { size: Number(a.size) } : {},
      ...a.inlinePath !== void 0 ? { inlinePath: String(a.inlinePath) } : {}
    };
  });
}
var LIMIT_MESSAGES = 500;
var LIMIT_HISTORY_BYTES = 512 * 1024;
var clone = (value) => structuredClone(value);
function models(value) {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Invalid model catalog");
  const seen = /* @__PURE__ */ new Set();
  return value.map((item) => {
    const m = object(item), key = text(m.key);
    if (seen.has(key)) throw new Error("Duplicate model key");
    seen.add(key);
    if (!Array.isArray(m.thinkingLevels) || m.thinkingLevels.length > 8 || m.thinkingLevels.some((v) => !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(v)))) throw new Error("Invalid thinking levels");
    if (!Number.isSafeInteger(m.contextWindow) || Number(m.contextWindow) < 1 || Number(m.contextWindow) > 1e8) throw new Error("Invalid context window");
    return { key, providerId: text(m.providerId), modelId: text(m.modelId), label: text(m.label, 256), thinkingLevels: m.thinkingLevels, contextWindow: Number(m.contextWindow), ...m.isDefault === true ? { isDefault: true } : {} };
  });
}
function selection(value, catalog) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const s = value;
  if (typeof s.modelKey !== "string") return null;
  const model = catalog.find((m) => m.key === s.modelKey);
  if (!model) return null;
  if (s.thinkingLevel === void 0 || s.thinkingLevel === null) return { modelKey: model.key };
  if (typeof s.thinkingLevel !== "string" || !model.thinkingLevels.includes(s.thinkingLevel)) return null;
  return { modelKey: model.key, thinkingLevel: s.thinkingLevel };
}
function input(value) {
  const m = object(value);
  const attachments = roomAttachments(m.attachments);
  const content = m.content === "" && attachments?.length ? "" : text(m.content, 65536);
  const result = { roomId: text(m.roomId), id: text(m.id), content };
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.id)) throw new Error("Message ID must be a UUID");
  if (m.targets !== void 0) {
    if (m.targetMemberId !== void 0 || m.modelKey !== void 0 || m.thinkingLevel !== void 0) throw new Error("Targets and singleton fields are mutually exclusive");
    if (!Array.isArray(m.targets) || m.targets.length < 1 || m.targets.length > 32) throw new Error("Targets must contain 1..32 agents");
    const seen = /* @__PURE__ */ new Set();
    result.targets = m.targets.map((value2) => {
      const target = object(value2), targetMemberId = text(target.targetMemberId), modelKey = text(target.modelKey);
      if (seen.has(targetMemberId)) throw new Error("Duplicate target member ID");
      seen.add(targetMemberId);
      if (target.thinkingLevel !== void 0 && !["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(target.thinkingLevel))) throw new Error("Invalid thinking level");
      return { targetMemberId, modelKey, ...target.thinkingLevel !== void 0 ? { thinkingLevel: target.thinkingLevel } : {} };
    });
  }
  if (m.targetMemberId !== void 0) result.targetMemberId = text(m.targetMemberId);
  if (m.modelKey !== void 0) result.modelKey = text(m.modelKey);
  if (m.thinkingLevel !== void 0) {
    if (!["off", "minimal", "low", "medium", "high", "xhigh", "max"].includes(String(m.thinkingLevel))) throw new Error("Invalid thinking level");
    result.thinkingLevel = m.thinkingLevel;
  }
  if (!result.targetMemberId && (result.modelKey || result.thinkingLevel)) throw new Error("Explicit agent target required");
  if (attachments) result.attachments = attachments;
  return result;
}
function message(value, roomId) {
  const m = object(value), g = object(m.groupChat);
  if (!["user", "assistant", "tool"].includes(String(m.role)) || typeof m.content !== "string" || m.content.length > 65536 || typeof m.createdAt !== "string" || !Number.isFinite(Date.parse(m.createdAt))) throw new Error("Invalid room message");
  if (g.roomId !== roomId || !["human", "agent"].includes(String(g.kind)) || !Number.isSafeInteger(g.sequence) || Number(g.sequence) < 1) throw new Error("Invalid message metadata");
  text(m.id);
  text(g.memberId);
  text(g.memberName, 256);
  if (g.runId !== void 0) text(g.runId);
  const attachments = roomAttachments(m.attachments);
  if (attachments) m.attachments = attachments;
  if (Buffer.byteLength(JSON.stringify(m)) > 1e5) throw new Error("Message too large");
  return m;
}
function snapshot(value, roomId) {
  const s = object(value);
  if (s.id !== roomId || !Array.isArray(s.members) || s.members.length > 32 || !Array.isArray(s.runs) || s.runs.length > 1e4 || !Array.isArray(s.messages) || s.messages.length > LIMIT_MESSAGES || !Number.isSafeInteger(s.sequence)) throw new Error("Invalid room snapshot");
  const members = s.members.map((value2) => {
    const m = object(value2);
    if (typeof m.online !== "boolean" || !["none", "pending", "approved", "rejected"].includes(String(m.agentStatus))) throw new Error("Invalid member");
    const catalog = models(m.models);
    return { id: text(m.id), label: text(m.label, 256), online: m.online, agentStatus: m.agentStatus, models: catalog, selection: selection(m.selection, catalog) };
  });
  if (new Set(members.map((m) => m.id)).size !== members.length) throw new Error("Duplicate members");
  const runs = s.runs.map((value2) => {
    const r = object(value2);
    if (!["running", "completed", "failed", "aborted", "unknown"].includes(String(r.status))) throw new Error("Invalid run");
    return {
      id: text(r.id),
      targetMemberId: text(r.targetMemberId),
      status: r.status,
      sourceMessageId: text(r.sourceMessageId),
      ...r.modelKey !== void 0 ? { modelKey: text(r.modelKey) } : {},
      ...r.thinkingLevel !== void 0 ? { thinkingLevel: r.thinkingLevel } : {}
    };
  });
  const messages = s.messages.map((m) => message(m, roomId));
  if (Buffer.byteLength(JSON.stringify(messages)) > LIMIT_HISTORY_BYTES || new Set(messages.map((m) => m.id)).size !== messages.length) throw new Error("Invalid history");
  return { id: roomId, name: text(s.name, 256), members, runs, messages, sequence: Number(s.sequence) };
}
var view = (r) => ({ id: r.id, name: r.name, members: r.members, runs: r.runs, messages: r.messages, sequence: r.sequence });
function envelope(value) {
  const a = object(value), e = object(a.event), kind = text(e.type, 64);
  text(a.sessionId);
  if (!Number.isFinite(a.ts)) throw new Error("Invalid event timestamp");
  if (a.turnId !== void 0) text(a.turnId);
  const allowed = ["agent_start", "agent_end", "usage", "turn_start", "turn_end", "message_start", "message_update", "message_end", "tool_start", "tool_update", "tool_end", "planning_state", "tool_permission_request", "asktool_request", "compaction_start", "compaction_end", "error", "status", "user_message_persisted"];
  if (!allowed.includes(kind)) throw new Error("Invalid agent event type");
  if (["message_start", "message_update", "message_end", "user_message_persisted"].includes(kind)) {
    const m = object(e.message);
    text(m.id);
    if (!["user", "assistant", "tool", "system"].includes(String(m.role)) || m.content !== void 0 && (typeof m.content !== "string" || m.content.length > 65536) || kind !== "message_update" && typeof m.content !== "string" || typeof m.createdAt !== "string" || !Number.isFinite(Date.parse(m.createdAt))) throw new Error("Invalid event message");
  }
  if (["tool_start", "tool_update", "tool_end"].includes(kind)) text(e.toolCallId);
  if (Buffer.byteLength(JSON.stringify(a)) > 128 * 1024) throw new Error("Event too large");
  return a;
}

// ../../../存储/pi-desktop-dev/group-rooms-worktree/apps/desktop/electron/main/group-rooms/index.ts
function createRoomNetworkService(deps) {
  let state = { version: 1, machineId: (0, import_node_crypto2.randomUUID)(), rooms: [] };
  let secrets;
  let revision = 0, initialized, serial = Promise.resolve();
  let server, wss;
  let listener, stopped = false;
  let stopping = false;
  let networkAbort = new AbortController();
  const peers = /* @__PURE__ */ new Map(), timers = /* @__PURE__ */ new Map();
  const connecting = /* @__PURE__ */ new Set(), executing = /* @__PURE__ */ new Map();
  const socketsInFlight = /* @__PURE__ */ new Set();
  const attempts = /* @__PURE__ */ new Map();
  const BLOB_CHUNK = 256 * 1024, BLOB_MAX_BYTES = 50 * 1024 * 1024, BLOB_TIMEOUT = 12e4;
  const messageId = (runId, id) => {
    const h = hash(`room-message:${runId}:${id}`);
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
  };
  const key = (roomId, memberId) => JSON.stringify([roomId, memberId]);
  const room = (id) => {
    const r = state.rooms.find((r2) => r2.id === id);
    if (!r) throw new Error("Room not found");
    return r;
  };
  const member = (r, id) => {
    const m = r.members.find((m2) => m2.id === id);
    if (!m) throw new Error("Member not found");
    return m;
  };
  const hostPeer = (r) => {
    const p = peers.get(key(r.id, "host"));
    if (!p) throw new Error("Room disconnected");
    return p;
  };
  function applySelection(r, memberId, value) {
    const m = member(r, memberId);
    if (value === null) {
      m.selection = null;
      return;
    }
    const next = selection(value, m.models);
    if (!next) throw new Error("Selection model or thinking level unavailable");
    m.selection = next;
  }
  async function persist() {
    try {
      const result = await deps.store.save({ expectedRevision: revision, state: clone(state), secret: JSON.stringify(secrets) });
      revision = result.revision;
      deps.changed();
    } catch (failure) {
      const saved = await deps.store.load();
      revision = saved.revision;
      if (saved.state) state = clone(saved.state);
      if (saved.secret) secrets = JSON.parse(saved.secret);
      throw failure;
    }
  }
  const sha = (ref) => ref.slice("attachments/".length).toLowerCase();
  const blobSource = (r, author) => r.host ? author && author !== r.selfId ? peers.get(key(r.id, author)) : void 0 : peers.get(key(r.id, "host"));
  async function pullBlob(r, a, author) {
    if (!deps.readAttachment || !deps.beginAttachment || !deps.writeAttachment || !deps.commitAttachment) return;
    try {
      if (await deps.readAttachment(r.sessionId, a.ref, 0, 1)) return;
    } catch {
    }
    const from = blobSource(r, author);
    if (!from) throw new Error("Attachment unavailable");
    const opened = object(await from.call("blob.get", { ref: a.ref }, BLOB_TIMEOUT));
    const size = Number(opened.size);
    if (!Number.isSafeInteger(size) || size < 0 || size > BLOB_MAX_BYTES) throw new Error("Invalid attachment size");
    const uploadId = text((await deps.beginAttachment(r.sessionId, { name: a.name, ...a.mimeType !== void 0 ? { mimeType: a.mimeType } : {}, size })).uploadId, 128);
    try {
      for (let offset = 0; ; ) {
        const chunk = object(await from.call("blob.get", { ref: a.ref, offset, length: BLOB_CHUNK }, BLOB_TIMEOUT));
        const content = typeof chunk.contentBase64 === "string" ? chunk.contentBase64 : "";
        if (content.length > 2 * BLOB_CHUNK) throw new Error("Invalid attachment chunk");
        if (content) await deps.writeAttachment(r.sessionId, { uploadId, offset, dataBase64: content });
        offset += Buffer.from(content, "base64").length;
        if (chunk.eof === true || !content) break;
      }
      await deps.commitAttachment(r.sessionId, uploadId);
    } catch (error) {
      await deps.discardAttachment?.(r.sessionId, uploadId).catch(() => void 0);
      throw error;
    }
  }
  async function serveBlob(r, ref, offset, length) {
    const local = deps.readAttachment ? await deps.readAttachment(r.sessionId, ref, offset, length).catch(() => void 0) : void 0;
    if (local) return { size: local.size, offset: local.offset, eof: local.eof, contentBase64: local.contentBase64 };
    const message2 = r.messages.find((m) => m.attachments?.some((a) => a.ref === ref));
    if (!message2) throw new Error("Unknown attachment");
    const author = peers.get(key(r.id, message2.groupChat.memberId));
    if (!author) throw new Error("Attachment unavailable");
    const relayed = object(await author.call("blob.get", { ref, offset, length }, BLOB_TIMEOUT));
    return { size: relayed.size, offset: relayed.offset, eof: relayed.eof, contentBase64: relayed.contentBase64 };
  }
  async function ensureBlobs(r, refs, author) {
    const unique = [...new Set(refs)].slice(0, 32);
    await Promise.allSettled(unique.map(async (ref) => {
      try {
        await pullBlob(r, { ref, name: "attachment", kind: "file" }, author);
      } catch (error) {
        console.warn("Room attachment fetch failed", error instanceof Error ? error.message : "Unavailable");
      }
    }));
  }
  function ensureMessageBlobs(r, m) {
    const attachments = (m.attachments ?? []).filter((a) => a.kind !== "session");
    if (!attachments.length) return;
    const author = m.groupChat.memberId;
    void (async () => {
      await Promise.allSettled(attachments.map(async (a) => {
        try {
          await pullBlob(r, a, author);
        } catch (error) {
          console.warn("Room attachment fetch failed", error instanceof Error ? error.message : "Unavailable");
        }
      }));
      try {
        await deps.refreshMessage?.(r.sessionId, clone(m));
      } catch {
      }
    })();
  }
  async function flush(r) {
    for (const m of r.messages) {
      if (r.appended.includes(m.id)) continue;
      await deps.appendMessage(r.sessionId, clone(m));
      r.appended.push(m.id);
      await persist();
    }
  }
  async function init() {
    initialized ??= (async () => {
      const saved = await deps.store.load();
      revision = saved.revision;
      if (saved.state !== null) {
        const s = object(saved.state);
        if (s.version !== 1 || !Array.isArray(s.rooms) || s.rooms.length > 32) throw new Error("Invalid persisted rooms");
        text(s.machineId);
        state = clone(s);
        for (const r of state.rooms) {
          snapshot(view(r), r.id);
          text(r.selfId);
          text(r.sessionId);
          text(r.projectPath, 4096);
          for (const m of r.members) m.selection = selection(m.selection, m.models);
          for (const m of r.members) m.online = m.id === r.selfId;
          for (const run of r.runs) if (run.status === "running") run.status = "unknown";
        }
      }
      if (saved.secret) {
        const value = object(JSON.parse(saved.secret));
        text(value.key, 16384);
        text(value.cert, 16384);
        object(value.links);
        secrets = value;
      } else {
        if (state.rooms.length) throw new Error("Room secrets missing");
        const identity = createIdentity();
        secrets = { key: identity.key, cert: identity.cert, links: {} };
      }
      await persist();
      for (const r of state.rooms) await flush(r);
      for (const r of state.rooms) if (!r.host && !r.revoked && secrets.links[r.id]) schedule(r.id, 0);
    })();
    try {
      await initialized;
    } catch (error) {
      initialized = void 0;
      throw error;
    }
  }
  async function locked(action) {
    await init();
    const operation = serial.then(action);
    serial = operation.catch(() => void 0);
    return operation;
  }
  async function sync(r) {
    await Promise.all(r.members.filter((m) => m.id !== r.selfId).map(async (m) => {
      const p = peers.get(key(r.id, m.id));
      if (p) await p.call("sync", clone(view(r)));
    }));
  }
  async function receiveSnapshot(r, value) {
    const s = snapshot(value, r.id);
    if (s.sequence < r.sequence) throw new Error("Stale snapshot");
    if (!s.members.some((m) => m.id === r.selfId)) throw new Error("Membership revoked");
    for (const m of s.messages) {
      const previous = r.messages.find((p) => p.id === m.id);
      if (previous && !(0, import_node_util.isDeepStrictEqual)(JSON.parse(JSON.stringify(previous)), JSON.parse(JSON.stringify(m)))) throw new Error("Message ID collision");
    }
    Object.assign(r, s);
    r.appended = r.appended.filter((id) => r.messages.some((m) => m.id === id));
    await persist();
    await flush(r);
    for (const m of r.messages) ensureMessageBlobs(r, m);
  }
  function schedule(roomId, delay) {
    const current = state.rooms.find((r) => r.id === roomId);
    if (stopped || !current || current.revoked || timers.has(roomId) || !Object.hasOwn(secrets.links, roomId)) return;
    const attempt = attempts.get(roomId) ?? 0;
    timers.set(roomId, setTimeout(() => {
      timers.delete(roomId);
      void reconnect(roomId).catch(() => {
        attempts.set(roomId, attempt + 1);
        schedule(roomId);
      });
    }, delay ?? Math.min(3e4, 250 * 2 ** Math.min(attempt, 7))));
  }
  function attach(r, id, p) {
    const k = key(r.id, id);
    peers.get(k)?.close();
    peers.set(k, p);
  }
  function closed(roomId, id, p) {
    if (peers.get(key(roomId, id)) !== p) return;
    peers.delete(key(roomId, id));
    void locked(async () => {
      const r = state.rooms.find((r2) => r2.id === roomId);
      if (!r) return;
      const m = r.members.find((m2) => m2.id === id);
      if (m) m.online = false;
      if (!r.host) {
        for (const m2 of r.members) if (m2.id !== r.selfId) m2.online = false;
      }
      for (const run of r.runs) if (run.status === "running" && (run.targetMemberId === id || !r.host)) run.status = "unknown";
      if (!r.host) {
        for (const run of r.runs) if (run.targetMemberId === r.selfId && executing.has(run.id)) void deps.stopRun(run.id).catch(() => void 0);
      }
      await persist();
      if (r.host) await sync(r);
    }).catch(() => void 0);
    if (id === "host") schedule(roomId);
  }
  async function reconnect(roomId) {
    await init();
    if (room(roomId).revoked || stopped || connecting.has(roomId) || peers.has(key(roomId, "host"))) return;
    const link = Object.hasOwn(secrets.links, roomId) ? secrets.links[roomId] : void 0;
    if (!link) return;
    connecting.add(roomId);
    let opened;
    try {
      const ws = await dial(link.address, link.fingerprint, link.token, networkAbort.signal);
      if (stopped || !secrets.links[roomId]) {
        ws.terminate();
        return;
      }
      let p;
      p = new Peer(ws, (method, data) => clientHandler(roomId, method, data), () => closed(roomId, "host", p));
      opened = p;
      attach(room(roomId), "host", p);
      const result = object(await p.call("resume", {}));
      await locked(() => receiveSnapshot(room(roomId), result.snapshot));
      attempts.delete(roomId);
    } catch (error) {
      if ((attempts.get(roomId) ?? 0) === 0) console.warn("Room reconnect failed", error instanceof Error ? error.message : "Network error");
      opened?.close();
      throw error;
    } finally {
      connecting.delete(roomId);
    }
  }
  async function append(r, m) {
    message(m, r.id);
    const existing = r.messages.find((v) => v.id === m.id);
    if (existing) {
      if (!(0, import_node_util.isDeepStrictEqual)(JSON.parse(JSON.stringify(existing)), JSON.parse(JSON.stringify(m)))) throw new Error("Message ID collision");
      await flush(r);
      return;
    }
    r.messages.push(m);
    ensureMessageBlobs(r, m);
    while (r.messages.length > LIMIT_MESSAGES || Buffer.byteLength(JSON.stringify(r.messages)) > LIMIT_HISTORY_BYTES) {
      const first = r.messages[0];
      if (!r.appended.includes(first.id)) throw new Error("Unflushed history full");
      r.messages.shift();
      r.appended = r.appended.filter((id) => id !== first.id);
    }
    await persist();
    await flush(r);
  }
  async function admit(r, sender, raw) {
    if (stopping || stopped) throw new Error("Room service stopped");
    const req = input(raw);
    if (req.roomId !== r.id) throw new Error("Room mismatch");
    const author = member(r, sender);
    const attachmentRefs = (req.attachments ?? []).map((a) => a.ref);
    const digest = hash(JSON.stringify(req.targets === void 0 ? [sender, req.content, attachmentRefs, req.targetMemberId ?? null, req.modelKey ?? null, req.thinkingLevel ?? null] : [sender, req.content, attachmentRefs, req.targets.map((t) => [t.targetMemberId, t.modelKey, t.thinkingLevel ?? null])]));
    const previous = Object.hasOwn(r.admissions, req.id) ? r.admissions[req.id] : void 0;
    if (previous) {
      if (previous.digest !== digest || previous.memberId !== sender) throw new Error("Message ID has different payload");
      await persist();
      await flush(r);
      await sync(r);
      return { turnId: previous.turnId, ...previous.turnIds ? { turnIds: clone(previous.turnIds) } : {} };
    }
    const targets = req.targets ?? (req.targetMemberId ? [{ targetMemberId: req.targetMemberId, modelKey: req.modelKey, thinkingLevel: req.thinkingLevel }] : []);
    if (Object.keys(r.admissions).length >= 1e4 || r.runs.length >= 1e4 || r.runs.length + targets.length > 1e4) throw new Error("Room admission capacity reached");
    for (const config of targets) {
      const target = member(r, config.targetMemberId);
      if (target.agentStatus !== "approved" || !target.online || target.id !== r.selfId && !peers.has(key(r.id, target.id))) throw new Error("Agent unavailable or not approved");
      if (r.runs.some((v) => v.targetMemberId === target.id && ["running", "unknown"].includes(v.status))) throw new Error("Agent already has an active or uncertain run");
      const model = target.models.find((m) => m.key === config.modelKey);
      if (!model || config.thinkingLevel && !model.thinkingLevels.includes(config.thinkingLevel)) throw new Error("Model or thinking level unavailable");
    }
    const userMessage = message({ id: req.id, role: "user", content: req.content, createdAt: (/* @__PURE__ */ new Date()).toISOString(), status: "complete", ...req.attachments ? { attachments: req.attachments } : {}, groupChat: { roomId: r.id, memberId: sender, memberName: author.label, kind: "human", sequence: r.sequence + 1 } }, r.id);
    if (r.messages.some((m) => m.id === req.id)) throw new Error("Message ID collision");
    const window = [...r.messages, userMessage];
    while (window.length > LIMIT_MESSAGES || Buffer.byteLength(JSON.stringify(window)) > LIMIT_HISTORY_BYTES) {
      if (!r.appended.includes(window[0].id)) throw new Error("Unflushed history full");
      window.shift();
    }
    const history = clone(window.filter((m) => m.id !== req.id));
    const runs = targets.map((t) => ({ id: (0, import_node_crypto2.randomUUID)(), targetMemberId: t.targetMemberId, status: "running", sourceMessageId: req.id, modelKey: t.modelKey, ...t.thinkingLevel !== void 0 ? { thinkingLevel: t.thinkingLevel } : {} }));
    const result = { turnId: runs[0]?.id ?? null, ...req.targets ? { turnIds: runs.map((run) => run.id) } : {} };
    r.runs.push(...runs);
    Object.defineProperty(r.admissions, req.id, { value: { digest, memberId: sender, ...result }, enumerable: true, configurable: true, writable: true });
    r.sequence++;
    try {
      await append(r, userMessage);
      await Promise.allSettled(r.members.filter((m) => m.id !== r.selfId).map(async (m) => {
        const p = peers.get(key(r.id, m.id));
        if (p) await p.call("sync", clone(view(r)));
      }));
    } catch (error) {
      if (state.rooms.includes(r) && runs.length) {
        for (const run of runs) run.status = "unknown";
        await persist();
      }
      throw error;
    }
    const local = runs.find((run) => run.targetMemberId === r.selfId);
    if (local) {
      r.started.push(local.id);
      await persist();
    }
    const failures = await Promise.all(runs.map(async (run, i) => {
      const request = { roomId: req.roomId, id: req.id, content: req.content, ...req.attachments ? { attachments: req.attachments } : {}, ...targets[i] };
      if (run.targetMemberId === r.selfId) {
        queueMicrotask(() => launch(r.id, run.id, request, history));
        return void 0;
      }
      try {
        const p = peers.get(key(r.id, run.targetMemberId));
        if (!p) throw new Error("Disconnected");
        await p.call("execute", { runId: run.id, request, history });
        return void 0;
      } catch {
        return run;
      }
    }));
    if (failures.some(Boolean)) {
      for (const run of failures) if (run) run.status = "unknown";
      await persist();
      await sync(r);
    }
    return result;
  }
  async function output(r, sender, value) {
    const data = object(value), runId = text(data.runId);
    const run = r.runs.find((v) => v.id === runId);
    if (!run || run.targetMemberId !== sender || !["running", "unknown"].includes(run.status)) throw new Error("Invalid run output");
    const event = envelope(data.event);
    const e = event.event;
    const finalized = [];
    const chosen = run.modelKey ? member(r, sender).models.find((m) => m.key === run.modelKey) : void 0;
    const modelLabel = run.modelKey ? `${chosen?.label ?? run.modelKey}${run.thinkingLevel ? ` \xB7 ${run.thinkingLevel}` : ""}` : void 0;
    const tag = (value2) => {
      const raw = object(value2);
      if (!["assistant", "tool"].includes(String(raw.role))) return;
      const id = messageId(runId, text(raw.id));
      const old = r.messages.find((m) => m.id === id);
      const g = old?.groupChat ?? { roomId: r.id, memberId: sender, memberName: member(r, sender).label, ...modelLabel ? { modelLabel } : {}, kind: "agent", sequence: ++r.sequence, runId };
      const mapped = { ...raw, id, groupChat: g };
      for (const key2 of ["toolCallId", "parentToolCallId", "nestedParentToolCallId"]) {
        if (mapped[key2] !== void 0) mapped[key2] = messageId(runId, text(mapped[key2]));
      }
      finalized.push(message(mapped, r.id));
    };
    if (e.type === "message_end") {
      if (e.precedingAssistant) tag(e.precedingAssistant);
      tag(e.message);
    }
    for (const m of finalized) await append(r, m);
    const publicEvent = clone(event);
    const mapTool = (value2) => {
      for (const key2 of ["toolCallId", "parentToolCallId", "nestedParentToolCallId"]) {
        if (value2[key2] !== void 0) value2[key2] = messageId(runId, text(value2[key2]));
      }
    };
    mapTool(publicEvent);
    if (["tool_start", "tool_update", "tool_end"].includes(publicEvent.event.type)) mapTool(publicEvent.event);
    if (publicEvent.event.type === "message_start" || publicEvent.event.type === "message_update" || publicEvent.event.type === "message_end") {
      const source = publicEvent.event.message;
      mapTool(source);
      if (source.role !== "assistant" && source.role !== "tool") return;
      const id = messageId(runId, source.id);
      publicEvent.event.message = { ...source, id, groupChat: r.messages.find((m) => m.id === id)?.groupChat ?? {
        roomId: r.id,
        memberId: sender,
        memberName: member(r, sender).label,
        ...modelLabel ? { modelLabel } : {},
        kind: "agent",
        sequence: r.sequence + 1,
        runId
      } };
      if (publicEvent.event.type === "message_end" && publicEvent.event.precedingAssistant) {
        mapTool(publicEvent.event.precedingAssistant);
        publicEvent.event.precedingAssistant = { ...publicEvent.event.precedingAssistant, id: messageId(runId, publicEvent.event.precedingAssistant.id), groupChat: publicEvent.event.message.groupChat };
      }
    }
    if (["tool_permission_request", "asktool_request", "planning_state", "status", "user_message_persisted"].includes(publicEvent.event.type)) return;
    await deps.emitEvent?.(r.sessionId, { ...publicEvent, sessionId: r.sessionId, turnId: runId });
    await Promise.allSettled(r.members.filter((m) => m.id !== r.selfId).map(async (m) => {
      const p = peers.get(key(r.id, m.id));
      if (p) await p.call("event", { runId, event: publicEvent });
    }));
    if (finalized.length) await sync(r);
  }
  async function terminal(r, sender, value) {
    const data = object(value), run = r.runs.find((v) => v.id === text(data.runId));
    if (!run || run.targetMemberId !== sender || !["completed", "failed", "aborted", "unknown"].includes(String(data.status))) throw new Error("Invalid run terminal");
    if (["completed", "failed", "aborted"].includes(run.status) && run.status !== data.status) throw new Error("Terminal conflict");
    run.status = data.status;
    await persist();
    await sync(r);
  }
  function launch(roomId, runId, req, history) {
    if (executing.has(runId) || stopped || stopping) return;
    const work = (async () => {
      const r = room(roomId), run = r.runs.find((v) => v.id === runId), self = member(r, r.selfId);
      if (!run || run.targetMemberId !== r.selfId || run.status !== "running" || self.agentStatus !== "approved") throw new Error("Run not admitted");
      const catalog = models(await deps.listModels()), model = catalog.find((m) => m.key === req.modelKey);
      if (!model || req.thinkingLevel && !model.thinkingLevels.includes(req.thinkingLevel)) throw new Error("Local model unavailable");
      if (stopped || stopping) return;
      const refs = (req.attachments ?? []).map((a) => a.ref);
      if (refs.length) await ensureBlobs(r, refs, r.messages.find((m) => m.id === run.sourceMessageId)?.groupChat.memberId);
      if (stopped || stopping) return;
      let count = 0, bytes = 0;
      const result = await deps.executeRun({ runId, roomId, targetMemberId: r.selfId, model, thinkingLevel: req.thinkingLevel, projectPath: r.projectPath, content: req.content, ...req.attachments ? { attachments: req.attachments } : {}, history: clone(history) }, async (event) => {
        if (stopped) throw new Error("Room service stopped");
        bytes += Buffer.byteLength(JSON.stringify(event));
        if (++count > 1e4 || bytes > 8 * MAX_FRAME) throw new Error("Run output capacity exceeded");
        if (r.host) await locked(() => output(r, r.selfId, { runId, event }));
        else await hostPeer(r).call("output", { runId, event });
      });
      if (!stopped) {
        if (r.host) await locked(() => terminal(r, r.selfId, { runId, status: result.status }));
        else await hostPeer(r).call("terminal", { runId, status: result.status });
      }
    })().catch(async (error) => {
      console.error("Room execution failed", error instanceof Error ? error.message : "Run failed");
      if (stopped) return;
      const r = state.rooms.find((v) => v.id === roomId);
      if (!r) return;
      try {
        if (r.host) await locked(() => terminal(r, r.selfId, { runId, status: "failed" }));
        else await hostPeer(r).call("terminal", { runId, status: "failed" });
      } catch {
      }
    }).finally(() => {
      executing.delete(runId);
    });
    executing.set(runId, work);
  }
  async function stopLocal(runId) {
    const work = executing.get(runId);
    if (!work) throw new Error("Run outcome unknown");
    await deps.stopRun(runId);
    let timer;
    try {
      await Promise.race([work, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("Run outcome unknown")), 1e4);
      })]);
    } finally {
      clearTimeout(timer);
    }
  }
  async function cancel(roomId, runId) {
    const r = room(roomId), run = r.runs.find((v) => v.id === runId);
    if (!run) throw new Error("Run not found");
    if (["completed", "failed", "aborted"].includes(run.status)) return;
    try {
      if (run.targetMemberId === r.selfId) await stopLocal(runId);
      else if (r.host) {
        const p = peers.get(key(roomId, run.targetMemberId));
        if (!p) throw new Error("Run outcome unknown");
        await p.call("cancelLocal", { runId }, 12e3);
      } else await hostPeer(r).call("cancel", { runId }, 14e3);
      if (["running", "unknown"].includes(run.status)) throw new Error("Run outcome unknown");
    } catch {
      await locked(async () => {
        if (run.status === "running") {
          run.status = "unknown";
          await persist();
          if (r.host) await sync(r);
        }
      });
      throw new Error("Run outcome unknown");
    }
  }
  async function clientHandler(roomId, method, value) {
    const data = object(value), r = room(roomId);
    if (method === "sync") return locked(() => receiveSnapshot(r, value));
    if (method === "revoked") {
      await Promise.allSettled(r.runs.filter((v) => v.targetMemberId === r.selfId && executing.has(v.id)).map((v) => deps.stopRun(v.id)));
      await locked(async () => {
        r.revoked = true;
        const timer = timers.get(roomId);
        clearTimeout(timer);
        timers.delete(roomId);
        for (const m of r.members) if (m.id !== r.selfId) m.online = false;
        for (const run of r.runs) if (run.status === "running") run.status = "unknown";
        await persist();
      });
      return {};
    }
    if (method === "execute") {
      const runId = text(data.runId), req = input(data.request);
      if (req.roomId !== roomId || req.targetMemberId !== r.selfId) throw new Error("Invalid run target");
      const history = data.history === void 0 ? clone(r.messages.filter((m) => m.id !== req.id)) : snapshot({ ...view(r), messages: data.history }, roomId).messages;
      if (history.some((m) => m.id === req.id)) throw new Error("Invalid admission history");
      const run = r.runs.find((v) => v.id === runId);
      await locked(async () => {
        if (!run || run.sourceMessageId !== req.id || run.status !== "running" || r.started.includes(runId)) throw new Error("Run not admitted or already started");
        r.started.push(runId);
        await persist();
      });
      queueMicrotask(() => launch(roomId, runId, req, history));
      return {};
    }
    if (method === "cancelLocal") {
      await stopLocal(text(data.runId));
      return {};
    }
    if (method === "blob.get") {
      const ref = text(data.ref, 128);
      if (sha(ref).length !== 64) throw new Error("Invalid attachment ref");
      const offset = Number.isSafeInteger(data.offset) ? Number(data.offset) : 0;
      const length = Number.isSafeInteger(data.length) ? Math.min(Number(data.length), BLOB_CHUNK) : BLOB_CHUNK;
      return serveBlob(r, ref, offset, length);
    }
    if (method === "event") {
      const runId = text(data.runId), event = envelope(data.event);
      if (!r.runs.some((v) => v.id === runId)) throw new Error("Unknown run");
      await deps.emitEvent?.(r.sessionId, { ...event, sessionId: r.sessionId, turnId: runId });
      return {};
    }
    throw new Error("Unknown room method");
  }
  async function hostHandler(roomId, memberId, method, value) {
    const data = object(value), r = room(roomId);
    if (!r.host || !r.credentials[memberId]) throw new Error("Membership revoked");
    if (method === "cancel") {
      await cancel(roomId, text(data.runId));
      return {};
    }
    if (method === "leave") {
      await revoke(roomId, memberId, false);
      return {};
    }
    if (method === "blob.get") {
      const ref = text(data.ref, 128);
      if (sha(ref).length !== 64) throw new Error("Invalid attachment ref");
      const offset = Number.isSafeInteger(data.offset) ? Number(data.offset) : 0;
      const length = Number.isSafeInteger(data.length) ? Math.min(Number(data.length), BLOB_CHUNK) : BLOB_CHUNK;
      return serveBlob(r, ref, offset, length);
    }
    return locked(async () => {
      member(r, memberId);
      if (method === "resume") {
        const resumed = member(r, memberId);
        const wasOffline = resumed.online === false;
        resumed.online = true;
        if (r.host && wasOffline) {
          const retired = r.runs.filter((v) => v.targetMemberId === memberId && ["running", "unknown"].includes(v.status));
          if (retired.length) {
            r.runs = r.runs.filter((v) => !(v.targetMemberId === memberId && ["running", "unknown"].includes(v.status)));
            for (const v of retired) if (executing.has(v.id)) void deps.stopRun(v.id).catch(() => void 0);
          }
        }
        await persist();
        await sync(r);
        return { snapshot: view(r) };
      }
      if (method === "send") return admit(r, memberId, data);
      if (method === "requestAgent") {
        const m = member(r, memberId);
        m.models = models(data.models);
        m.selection = selection(m.selection, m.models);
        m.agentStatus = "pending";
        await persist();
        await sync(r);
        return {};
      }
      if (method === "setSelection") {
        applySelection(r, memberId, data.selection);
        await persist();
        await sync(r);
        return {};
      }
      if (method === "output") {
        await output(r, memberId, data);
        return {};
      }
      if (method === "terminal") {
        await terminal(r, memberId, data);
        return {};
      }
      throw new Error("Unknown room method");
    });
  }
  async function revoke(roomId, memberId, notify = true) {
    await locked(async () => {
      const r = room(roomId);
      if (!r.host || memberId === r.selfId) throw new Error("Host membership required");
      member(r, memberId);
      delete r.credentials[memberId];
      r.members = r.members.filter((m) => m.id !== memberId);
      for (const run of r.runs) if (run.targetMemberId === memberId && run.status === "running") run.status = "unknown";
      await persist();
      const p = peers.get(key(roomId, memberId));
      if (p && notify) {
        try {
          await p.call("revoked", {}, 2e3);
        } catch {
        }
      }
      peers.delete(key(roomId, memberId));
      if (notify) p?.close();
      await sync(r);
      if (!notify && p) setImmediate(() => p.close());
    });
  }
  return {
    async start({ port, bindAddress }) {
      await init();
      if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("Invalid listener port");
      if (listener) return clone(listener);
      stopped = false;
      stopping = false;
      if (networkAbort.signal.aborted) networkAbort = new AbortController();
      const srv = (0, import_node_https.createServer)({ key: secrets.key, cert: secrets.cert, minVersion: "TLSv1.2", maxHeaderSize: 8192 }, (_, res) => {
        res.writeHead(404);
        res.end();
      });
      srv.maxConnections = 128;
      srv.headersTimeout = 1e4;
      srv.requestTimeout = 1e4;
      srv.on("connection", (socket) => {
        socketsInFlight.add(socket);
        socket.once("close", () => socketsInFlight.delete(socket));
      });
      const sockets = new import_websocket_server.default({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
      server = srv;
      wss = sockets;
      srv.on("upgrade", (req, socket, head) => {
        void locked(async () => {
          const auth = req.headers.authorization;
          if (req.url !== "/" || typeof auth !== "string" || !/^Bearer [\w-]{43}$/.test(auth)) throw new Error("Unauthorized");
          const digest = hash(auth.slice(7));
          const r = state.rooms.find((r2) => r2.host && (Object.values(r2.credentials).includes(digest) || r2.tickets.some((t) => t.hash === digest && t.expires > Date.now())));
          if (!r || stopped) throw new Error("Unauthorized");
          const known = Object.keys(r.credentials).find((id) => r.credentials[id] === digest);
          const ticket = r.tickets.find((t) => t.hash === digest);
          if (ticket) {
            r.tickets = r.tickets.filter((t) => t !== ticket);
          }
          await persist();
          if (socket.destroyed) return;
          sockets.handleUpgrade(req, socket, head, (ws) => {
            let assigned = known, p;
            p = new Peer(ws, async (method, value) => {
              if (assigned) return hostHandler(r.id, assigned, method, value);
              if (method !== "join") throw new Error("Join required");
              const data = object(value), label = text(data.label, 256);
              return locked(async () => {
                if (stopped || !state.rooms.includes(r) || r.members.length >= 32) throw new Error("Room unavailable or full");
                assigned = (0, import_node_crypto2.randomUUID)();
                const credential = token();
                r.credentials[assigned] = hash(credential);
                const ghosts = r.members.filter((m) => m.id !== r.selfId && m.online === false && m.label === label);
                if (ghosts.length) {
                  const gone = new Set(ghosts.map((m) => m.id));
                  for (const id of gone) delete r.credentials[id];
                  for (const run of r.runs) if (run.targetMemberId && gone.has(run.targetMemberId) && run.status === "running") run.status = "unknown";
                  r.members = r.members.filter((m) => !gone.has(m.id));
                }
                r.members.push({ id: assigned, label, online: true, agentStatus: "none", models: [], selection: null });
                attach(r, assigned, p);
                await persist();
                await sync(r);
                return { memberId: assigned, credential, snapshot: view(r) };
              });
            }, () => {
              if (assigned) closed(r.id, assigned, p);
            });
            if (known) attach(r, known, p);
            else {
              const timer = setTimeout(() => {
                if (!assigned) p.close();
              }, 1e4);
              ws.once("close", () => clearTimeout(timer));
            }
          });
        }).catch(() => {
          socket.end("HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n");
        });
      });
      await new Promise((resolve, reject) => {
        srv.once("error", reject);
        srv.listen(port, bindAddress ?? "0.0.0.0", () => {
          srv.removeListener("error", reject);
          resolve();
        });
      });
      const info = srv.address();
      if (!info || typeof info === "string") throw new Error("Listener unavailable");
      listener = { port: info.port, fingerprint: hash(new import_node_crypto2.X509Certificate(secrets.cert).raw) };
      for (const r of state.rooms) if (!r.host) schedule(r.id, 0);
      deps.changed();
      return clone(listener);
    },
    async stop(graceful = false) {
      await init();
      if (stopped) return;
      stopping = true;
      if (graceful) await Promise.allSettled([...executing.keys()].map(stopLocal));
      stopped = true;
      networkAbort.abort();
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
      for (const p of peers.values()) p.close();
      peers.clear();
      for (const socket of socketsInFlight) socket.destroy();
      socketsInFlight.clear();
      await Promise.allSettled([...executing.keys()].map((id) => deps.stopRun(id)));
      wss?.close();
      wss = void 0;
      const srv = server;
      server = void 0;
      listener = void 0;
      if (srv) {
        srv.closeAllConnections();
        await new Promise((resolve) => srv.close(() => resolve()));
      }
      await locked(async () => {
        for (const r of state.rooms) {
          for (const m of r.members) m.online = m.id === r.selfId;
          for (const run of r.runs) if (run.status === "running") run.status = "unknown";
        }
        await persist();
      });
    },
    async status() {
      return locked(async () => ({ machineId: state.machineId, ...listener ? { listener: clone(listener) } : {}, rooms: state.rooms.map((r) => ({ id: r.id, sessionId: r.sessionId, name: r.name, projectPath: r.projectPath, selfMemberId: r.selfId, host: r.host, connected: r.host || peers.has(key(r.id, "host")), revoked: r.revoked === true, members: clone(r.members), runs: clone(r.runs) })) }));
    },
    async shareRoom(args) {
      return locked(async () => {
        if (!listener) throw new Error("Start the room listener first");
        const id = text(args.roomId), label = text(args.label, 256), url = address(args.address);
        let r = state.rooms.find((r2) => r2.id === id);
        if (!r) {
          if (state.rooms.length >= 32) throw new Error("Room capacity reached");
          const selfId = (0, import_node_crypto2.randomUUID)();
          r = { id, sessionId: text(args.sessionId), name: text(args.name, 256), projectPath: text(args.projectPath, 4096), host: true, selfId, members: [{ id: selfId, label, online: true, agentStatus: "approved", models: models(await deps.listModels()), selection: null }], runs: [], messages: [], appended: [], started: [], admissions: {}, credentials: {}, tickets: [], sequence: 0 };
        }
        if (!r.host) throw new Error("Host membership required");
        if (r.sequence === 0 && deps.readMessages) {
          const previous = await deps.readMessages(r.sessionId);
          if (previous.length > LIMIT_MESSAGES || Buffer.byteLength(JSON.stringify(previous)) > LIMIT_HISTORY_BYTES) throw new Error("Existing room history exceeds the sharing window; create a new room to share");
          let sequence = 0;
          const seeded = previous.filter((m) => m.role === "user" || m.role === "assistant" || m.role === "tool").map((m) => {
            const tagged = message({ ...m, groupChat: { roomId: r.id, memberId: r.selfId, memberName: label, kind: m.role === "user" ? "human" : "agent", sequence: ++sequence } }, r.id);
            return tagged;
          });
          snapshot({ ...view(r), messages: seeded, sequence }, r.id);
          r.messages = seeded;
          r.sequence = sequence;
          r.appended = r.messages.map((m) => m.id);
        }
        const ticket = token(), expires = Date.now() + 5 * 6e4;
        r.tickets = r.tickets.filter((t) => t.expires > Date.now());
        if (r.tickets.length >= 32) throw new Error("Invitation capacity reached");
        r.tickets.push({ hash: hash(ticket), expires });
        if (!state.rooms.includes(r)) state.rooms.push(r);
        await persist();
        return { invitation: encodeInvitation({ v: 1, roomId: id, address: url, fingerprint: listener.fingerprint, ticket, expires }) };
      });
    },
    async joinRoom(args) {
      await init();
      stopped = false;
      if (networkAbort.signal.aborted) networkAbort = new AbortController();
      const inv = decodeInvitation(args.invitation), label = text(args.label, 256), projectPath = text(args.projectPath, 4096);
      if (state.rooms.some((r) => r.id === inv.roomId) || connecting.has(inv.roomId)) throw new Error("Room already joined");
      if (state.rooms.length >= 32) throw new Error("Room capacity reached");
      const departed = state.departed?.find((r) => r.id === inv.roomId);
      if (departed && (departed.fingerprint !== inv.fingerprint || departed.projectPath !== projectPath)) throw new Error("Rejoin requires the original host and local project path");
      connecting.add(inv.roomId);
      let p;
      try {
        const ws = await dial(inv.address, inv.fingerprint, inv.ticket, networkAbort.signal);
        let joined = false, earlySnapshot;
        p = new Peer(ws, async (method, data) => {
          if (!joined && method === "sync") {
            earlySnapshot = data;
            return {};
          }
          return clientHandler(inv.roomId, method, data);
        }, () => {
          if (p && joined) closed(inv.roomId, "host", p);
        });
        const result = object(await p.call("join", { label })), memberId = text(result.memberId), credential = text(result.credential);
        if (!/^[\w-]{43}$/.test(credential)) throw new Error("Invalid room credential");
        const s = snapshot(result.snapshot, inv.roomId);
        const sessionId = departed?.sessionId ?? (args.sessionId ? text(args.sessionId) : await deps.createSession(s.name, projectPath));
        await locked(async () => {
          const r = { ...s, sessionId, projectPath, host: false, selfId: memberId, appended: [], started: [], admissions: {}, credentials: {}, tickets: [] };
          if (Object.hasOwn(secrets.links, r.id)) secrets.links[`retired:${(0, import_node_crypto2.randomUUID)()}`] = clone(secrets.links[r.id]);
          Object.defineProperty(secrets.links, r.id, { value: { address: inv.address, fingerprint: inv.fingerprint, token: credential }, enumerable: true, configurable: true, writable: true });
          state.rooms.push(r);
          state.departed = state.departed?.filter((v) => v.id !== r.id);
          await persist();
          await flush(r);
          if (earlySnapshot) await receiveSnapshot(r, earlySnapshot);
          joined = true;
          if (p?.socket.readyState === 1) attach(r, "host", p);
          else {
            for (const m of r.members) if (m.id !== r.selfId) m.online = false;
            await persist();
            schedule(r.id, 0);
          }
        });
        if (p.socket.readyState === 1) {
          try {
            const resumed = object(await p.call("resume", {}));
            await locked(() => receiveSnapshot(room(inv.roomId), resumed.snapshot));
          } catch (error) {
            if (p.socket.readyState === 1) throw error;
            closed(inv.roomId, "host", p);
            schedule(inv.roomId, 0);
          }
        }
        return { roomId: inv.roomId, sessionId, name: s.name };
      } catch (error) {
        p?.close();
        throw error;
      } finally {
        connecting.delete(inv.roomId);
      }
    },
    async requestAgent(roomId) {
      await init();
      const r = room(roomId), catalog = models(await deps.listModels());
      if (r.host) await locked(async () => {
        const m = member(r, r.selfId);
        m.models = catalog;
        m.selection = selection(m.selection, m.models);
        m.agentStatus = "pending";
        await persist();
        await sync(r);
      });
      else await hostPeer(r).call("requestAgent", { models: catalog });
    },
    async setSelection(roomId, memberId, value) {
      await init();
      const r = room(roomId);
      const target = text(memberId);
      if (r.host) await locked(async () => {
        applySelection(r, target, value);
        await persist();
        await sync(r);
      });
      else {
        if (target !== r.selfId) throw new Error("Only the member itself can change its selection");
        await hostPeer(r).call("setSelection", { selection: value });
        await locked(async () => {
          applySelection(r, r.selfId, value);
          await persist();
        });
      }
    },
    async approveAgent(roomId, memberId, approved) {
      await locked(async () => {
        const r = room(roomId);
        if (!r.host || typeof approved !== "boolean") throw new Error("Host approval required");
        const m = member(r, memberId);
        if (m.agentStatus !== "pending") throw new Error("No pending agent request");
        m.agentStatus = approved ? "approved" : "rejected";
        await persist();
        await sync(r);
      });
    },
    revoke,
    async renameRoom(roomId, name) {
      await locked(async () => {
        const r = room(roomId);
        if (!r.host) throw new Error("Only the room host can rename a shared room");
        r.name = text(name.trim(), 256);
        await persist();
        await sync(r);
      });
    },
    async leave(roomId) {
      await init();
      const r = room(roomId);
      for (const run of r.runs) if (run.targetMemberId === r.selfId && executing.has(run.id)) {
        try {
          await stopLocal(run.id);
        } catch {
        }
      }
      if (r.host) {
        for (const m of [...r.members]) if (m.id !== r.selfId) await revoke(roomId, m.id);
      } else if (!r.revoked) {
        await hostPeer(r).call("leave", {});
      }
      await locked(async () => {
        if (!r.host) {
          state.departed ??= [];
          state.departed.push({ id: r.id, fingerprint: secrets.links[r.id].fingerprint, sessionId: r.sessionId, projectPath: r.projectPath });
        }
        const timer = timers.get(roomId);
        clearTimeout(timer);
        timers.delete(roomId);
        state.rooms = state.rooms.filter((v) => v.id !== roomId);
        const p = peers.get(key(roomId, "host"));
        peers.delete(key(roomId, "host"));
        p?.close();
        await persist();
      });
    },
    async forgetDeparted(roomId) {
      await locked(async () => {
        const id = text(roomId);
        if (state.departed?.some((r) => r.id === id)) {
          state.departed = state.departed.filter((r) => r.id !== id);
          await persist();
        }
      });
    },
    async forgetRunStatus(roomId, memberId, statuses) {
      await locked(async () => {
        const r = state.rooms.find((v) => v.id === text(roomId));
        if (!r) return;
        const next = r.runs.filter((v) => !(v.targetMemberId === text(memberId) && Array.isArray(statuses) && statuses.includes(v.status)));
        if (next.length === r.runs.length) return;
        r.runs = next;
        await persist();
      });
    },
    async sendMessage(args) {
      await init();
      const req = input(args), r = room(req.roomId);
      if (r.host) return locked(() => admit(r, r.selfId, req));
      const response = object(await hostPeer(r).call("send", req));
      if (response.turnIds !== void 0 && (!Array.isArray(response.turnIds) || response.turnIds.length < 1 || response.turnIds.length > 32 || new Set(response.turnIds).size !== response.turnIds.length)) throw new Error("Invalid run IDs");
      return { turnId: response.turnId === null ? null : text(response.turnId), ...Array.isArray(response.turnIds) ? { turnIds: response.turnIds.map((id) => text(id)) } : {} };
    },
    async cancelRun(roomId, runId) {
      await init();
      await cancel(text(roomId), text(runId));
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createRoomNetworkService
});
