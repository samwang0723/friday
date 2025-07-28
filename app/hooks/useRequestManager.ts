import { useRef, useCallback, useState, useEffect, useMemo } from "react";
import type { RequestManagerHookReturn } from "@/types/voiceChat";

export function useRequestManager(): RequestManagerHookReturn {
  const currentControllerRef = useRef<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentController, setCurrentController] =
    useState<AbortController | null>(null);

  // Create a new request controller and cancel any existing one
  const createNewRequest = useCallback((): AbortController => {
    // Cancel current request if it exists
    if (currentControllerRef.current) {
      console.log("Cancelling previous request");
      currentControllerRef.current.abort();
      // Don't wait for the event listener - immediately clear the ref
      currentControllerRef.current = null;
      setCurrentController(null);
      setIsProcessing(false);
    }

    // Create new controller
    const newController = new AbortController();
    currentControllerRef.current = newController;
    setCurrentController(newController);
    setIsProcessing(true);

    // Set up abort handler to update processing state
    newController.signal.addEventListener("abort", () => {
      // Only update state if this controller is still the current one
      if (currentControllerRef.current === newController) {
        setIsProcessing(false);
        currentControllerRef.current = null;
        setCurrentController(null);
      }
    });

    return newController;
  }, []);

  // Cancel current request without creating a new one
  const cancelCurrentRequest = useCallback(() => {
    if (currentControllerRef.current) {
      console.log("Manually cancelling current request");
      currentControllerRef.current.abort();
      currentControllerRef.current = null;
      setCurrentController(null);
      setIsProcessing(false);
    }
  }, []);

  // Mark request as completed
  const completeCurrentRequest = useCallback(() => {
    if (currentControllerRef.current) {
      currentControllerRef.current = null;
      setCurrentController(null);
      setIsProcessing(false);
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentControllerRef.current) {
        currentControllerRef.current.abort();
      }
    };
  }, []);

  // Return object with current controller from state
  return {
    currentController,
    createNewRequest,
    cancelCurrentRequest,
    isProcessing
  };
}
