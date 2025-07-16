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

// Mock setImmediate for Node environments (Jest runs in Node)
if (typeof setImmediate === "undefined") {
  global.setImmediate = callback => {
    setTimeout(callback, 0);
  };
}

// Silence console.log in tests unless explicitly needed
global.console = {
  ...console,
  log: jest.fn()
};
