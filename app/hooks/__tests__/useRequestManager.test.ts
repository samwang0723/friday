import { renderHook, act } from "@testing-library/react";
import { useRequestManager } from "../useRequestManager";

// We'll use the global AbortController mock from jest.setup.js
// No need to define it here again

describe("useRequestManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should initialize with no current controller", () => {
    const { result } = renderHook(() => useRequestManager());

    expect(result.current.currentController).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it("should create new request controller", () => {
    const { result } = renderHook(() => useRequestManager());

    act(() => {
      const controller = result.current.createNewRequest();
      expect(controller).toBeInstanceOf(AbortController);
    });

    expect(result.current.currentController).toBeInstanceOf(AbortController);
    expect(result.current.isProcessing).toBe(true);
  });

  it("should cancel previous request when creating new one", () => {
    const { result } = renderHook(() => useRequestManager());

    let firstController: AbortController;
    let secondController: AbortController;

    act(() => {
      firstController = result.current.createNewRequest();
    });

    // Spy on the first controller's abort method
    const firstAbortSpy = jest.spyOn(firstController!, "abort");

    act(() => {
      secondController = result.current.createNewRequest();
    });

    expect(firstAbortSpy).toHaveBeenCalled();
    expect(result.current.currentController).toBe(secondController!);
    expect(result.current.currentController).not.toBe(firstController!);
  });

  it("should cancel current request manually", () => {
    const { result } = renderHook(() => useRequestManager());

    let controller: AbortController;

    act(() => {
      controller = result.current.createNewRequest();
    });

    const abortSpy = jest.spyOn(controller!, "abort");

    act(() => {
      result.current.cancelCurrentRequest();
    });

    expect(abortSpy).toHaveBeenCalled();
    expect(result.current.currentController).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it("should handle cancellation when no controller exists", () => {
    const { result } = renderHook(() => useRequestManager());

    act(() => {
      result.current.cancelCurrentRequest();
    });

    // Should not throw and should remain in initial state
    expect(result.current.currentController).toBeNull();
    expect(result.current.isProcessing).toBe(false);
  });

  it("should update processing state when controller is aborted", () => {
    const { result } = renderHook(() => useRequestManager());

    act(() => {
      const controller = result.current.createNewRequest();
      // Simulate abort by calling abort method directly
      controller.abort();
    });

    expect(result.current.isProcessing).toBe(false);
    expect(result.current.currentController).toBeNull();
  });

  it("should not update state if aborted controller is not current", () => {
    const { result } = renderHook(() => useRequestManager());

    let firstController: AbortController;
    let secondController: AbortController;

    act(() => {
      firstController = result.current.createNewRequest();
    });

    act(() => {
      // Create second controller (which cancels first)
      secondController = result.current.createNewRequest();
    });

    // The first controller should already be aborted when second was created
    // So manually triggering abort again should not affect current state
    act(() => {
      // Try to abort first controller again (should not affect state)
      firstController.abort();
    });

    // State should still reflect second controller
    expect(result.current.isProcessing).toBe(true);
    expect(result.current.currentController).toBe(secondController!);
    expect(result.current.currentController).not.toBe(firstController!);
  });

  it("should cleanup on unmount", () => {
    const { result, unmount } = renderHook(() => useRequestManager());

    let controller: AbortController;

    act(() => {
      controller = result.current.createNewRequest();
    });

    const abortSpy = jest.spyOn(controller!, "abort");

    unmount();

    expect(abortSpy).toHaveBeenCalled();
  });

  it("should not abort null controller on unmount", () => {
    const { unmount } = renderHook(() => useRequestManager());

    // Should not throw when unmounting with no active controller
    expect(() => unmount()).not.toThrow();
  });
});
