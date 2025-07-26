import "@testing-library/jest-dom";

// Mock Web Audio API globally for all tests
Object.defineProperty(window, "AudioContext", {
  writable: true,
  value: jest.fn()
});

Object.defineProperty(window, "webkitAudioContext", {
  writable: true,
  value: jest.fn()
});

// Mock TextEncoder/TextDecoder for Node environment
if (typeof TextEncoder === "undefined") {
  global.TextEncoder = class TextEncoder {
    encode(str) {
      return new Uint8Array(Buffer.from(str, "utf8"));
    }
  };
}

if (typeof TextDecoder === "undefined") {
  global.TextDecoder = class TextDecoder {
    decode(bytes) {
      return Buffer.from(bytes).toString("utf8");
    }
  };
}

// Mock atob/btoa for base64 encoding/decoding
if (typeof atob === "undefined") {
  global.atob = str => Buffer.from(str, "base64").toString("binary");
}

if (typeof btoa === "undefined") {
  global.btoa = str => Buffer.from(str, "binary").toString("base64");
}

// Mock setImmediate for Node environments (Jest runs in Node)
if (typeof setImmediate === "undefined") {
  global.setImmediate = callback => {
    setTimeout(callback, 0);
  };
}

// Mock URL constructor for tests
if (typeof URL === "undefined") {
  global.URL = class MockURL {
    constructor(url, base) {
      this.href = url;
      this.origin = base || "";
      this.pathname = url.split("?")[0];
      this.search = url.includes("?") ? "?" + url.split("?")[1] : "";
      this.searchParams = new URLSearchParams(this.search);
    }
  };
}

// Mock URLSearchParams if not available
if (typeof URLSearchParams === "undefined") {
  global.URLSearchParams = class MockURLSearchParams {
    constructor(search = "") {
      this.params = new Map();
      if (search.startsWith("?")) search = search.slice(1);
      if (search) {
        search.split("&").forEach(param => {
          const [key, value] = param.split("=");
          this.params.set(
            decodeURIComponent(key),
            decodeURIComponent(value || "")
          );
        });
      }
    }

    get(key) {
      return this.params.get(key) || null;
    }

    set(key, value) {
      this.params.set(key, value);
    }

    has(key) {
      return this.params.has(key);
    }
  };
}

// Mock AbortController with proper implementation for testing
// Always override for consistent test behavior
global.AbortController = class MockAbortController {
  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn()
    };
  }

  abort() {
    this.signal.aborted = true;
    // Trigger abort event
    const event = { type: "abort" };
    this.signal.addEventListener.mock.calls.forEach(
      ([eventType, listener]) => {
        if (eventType === "abort") {
          listener(event);
        }
      }
    );
  }
};

// Mock Response for fetch API
if (typeof Response === "undefined") {
  global.Response = class MockResponse {
    constructor(body, init = {}) {
      this.body = body;
      this.status = init.status || 200;
      this.statusText = init.statusText || "OK";
      this.headers = new Headers(init.headers);
      this.ok = this.status >= 200 && this.status < 300;
    }

    async text() {
      return typeof this.body === "string" ? this.body : "";
    }

    async json() {
      return typeof this.body === "string" ? JSON.parse(this.body) : this.body;
    }

    async arrayBuffer() {
      if (this.body instanceof ArrayBuffer) return this.body;
      return new ArrayBuffer(0);
    }
  };
}

// Mock Headers for HTTP headers
if (typeof Headers === "undefined") {
  global.Headers = class MockHeaders {
    constructor(init = {}) {
      this.headers = new Map();
      if (init) {
        Object.entries(init).forEach(([key, value]) => {
          this.headers.set(key.toLowerCase(), value);
        });
      }
    }

    get(name) {
      return this.headers.get(name.toLowerCase()) || null;
    }

    set(name, value) {
      this.headers.set(name.toLowerCase(), value);
    }

    has(name) {
      return this.headers.has(name.toLowerCase());
    }

    delete(name) {
      this.headers.delete(name.toLowerCase());
    }
  };
}

// Mock FormData for form submissions
if (typeof FormData === "undefined") {
  global.FormData = class MockFormData {
    constructor() {
      this.data = new Map();
    }

    append(name, value) {
      if (!this.data.has(name)) {
        this.data.set(name, []);
      }
      this.data.get(name).push(value);
    }

    get(name) {
      const values = this.data.get(name);
      return values ? values[0] : null;
    }

    getAll(name) {
      return this.data.get(name) || [];
    }

    set(name, value) {
      this.data.set(name, [value]);
    }

    has(name) {
      return this.data.has(name);
    }

    delete(name) {
      this.data.delete(name);
    }
  };
}

// Mock Blob for binary data
if (typeof Blob === "undefined") {
  global.Blob = class MockBlob {
    constructor(parts = [], options = {}) {
      this.parts = parts;
      this.type = options.type || "";
      this.size = parts.reduce((size, part) => size + part.length, 0);
    }
  };
}

// Mock File for file uploads
if (typeof File === "undefined") {
  global.File = class MockFile extends Blob {
    constructor(parts, name, options = {}) {
      super(parts, options);
      this.name = name;
      this.lastModified = options.lastModified || Date.now();
    }
  };
}

// Mock requestAnimationFrame and cancelAnimationFrame
let rafId = 1;
global.requestAnimationFrame = jest.fn(cb => {
  const id = rafId++;
  setTimeout(cb, 16); // Simulate 60fps
  return id;
});

global.cancelAnimationFrame = jest.fn(id => {
  // In tests, this is a no-op since we use setTimeout
});

// Silence console.log in tests unless explicitly needed
// Temporarily enable for debugging
// global.console = {
//   ...console,
//   log: jest.fn(),
//   error: jest.fn()
// };
