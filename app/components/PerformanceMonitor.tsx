"use client";

import { useEffect, useRef } from "react";

interface PerformanceMonitorProps {
  componentName: string;
  enabled?: boolean;
}

export function PerformanceMonitor({
  componentName,
  enabled = process.env.NODE_ENV === "development"
}: PerformanceMonitorProps) {
  const renderCount = useRef(0);
  const lastRenderTime = useRef(Date.now());

  useEffect(() => {
    if (!enabled) return;

    renderCount.current += 1;
    const now = Date.now();
    const timeSinceLastRender = now - lastRenderTime.current;

    // Log if re-renders are too frequent (< 16ms = 60fps)
    if (timeSinceLastRender < 16 && renderCount.current > 1) {
      console.warn(
        `🚨 Frequent re-render detected in ${componentName}:`,
        `Render #${renderCount.current} after ${timeSinceLastRender}ms`
      );
    }

    // Log total render count every 10 renders
    if (renderCount.current % 10 === 0) {
      console.log(`📊 ${componentName} render count: ${renderCount.current}`);
    }

    lastRenderTime.current = now;
  });

  return null;
}

// Hook for performance monitoring with throttling
export function useRenderTracking(componentName: string, deps: any[] = []) {
  const renderCount = useRef(0);
  const prevDeps = useRef(deps);
  const lastLogTime = useRef(Date.now());

  useEffect(() => {
    renderCount.current += 1;

    if (process.env.NODE_ENV === "development") {
      const now = Date.now();
      const timeSinceLastLog = now - lastLogTime.current;

      // Throttle logging to prevent console spam (max once per 100ms)
      if (timeSinceLastLog < 100 && renderCount.current > 1) {
        prevDeps.current = deps;
        return;
      }

      const changedDeps = deps.filter(
        (dep, index) => dep !== prevDeps.current[index]
      );

      if (changedDeps.length > 0) {
        console.log(
          `🔄 ${componentName} re-rendered (#${renderCount.current}) due to:`,
          { changedDeps, allDeps: deps }
        );
        lastLogTime.current = now;
      }
    }

    prevDeps.current = deps;
  });
}
