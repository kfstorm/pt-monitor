import { useCallback, useState } from "react";

import { isMetricKey, type MetricKey } from "./metrics";

const STORAGE_KEY = "pt-monitor.metric";

export function useMetric(): [MetricKey, (key: MetricKey) => void] {
  const [metric, setMetric] = useState<MetricKey>(() => {
    if (typeof window === "undefined") return "bonusPerHour";
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && isMetricKey(stored) ? stored : "bonusPerHour";
  });

  const change = useCallback((key: MetricKey) => {
    localStorage.setItem(STORAGE_KEY, key);
    setMetric(key);
  }, []);

  return [metric, change];
}