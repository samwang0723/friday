import type { RequestManagerHookReturn } from "@/types/voiceChat";
import { useCallback, useEffect, useRef, useState } from "react";

export function useRequestManager(): RequestManagerHookReturn {
  const currentControllerRef = useRef<AbortController | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [currentController, setCurrentController] =
    useState<AbortController | null>(null);

  // Create a new request controller and cancel any existing one
  const createNewRequest = useCallback((): AbortController => {
    // Cancel current request if it exists
    if (currentControllerRef.current) {
      console.log("RequestManager: Cancelling previous client-side request");
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

    console.debug("RequestManager: Created new client-side request controller");

    // Set up abort handler to update processing state
    newController.signal.addEventListener("abort", () => {
      console.debug("RequestManager: Client-side request aborted");
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
      console.debug(
        "RequestManager: Manually cancelling current client-side request"
      );
      currentControllerRef.current.abort();
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
