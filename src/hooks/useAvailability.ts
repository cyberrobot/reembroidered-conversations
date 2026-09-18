"use client";

import { useCallback, useEffect, useState } from "react";
import type { AvailabilityResponse, DayAvailability } from "../types";
import { presentAvailability } from "../lib/availability/present-availability.mjs";

type AvailabilityStatus = "idle" | "loading" | "ready" | "error";

export function useAvailability({
  enabled = true,
}: { enabled?: boolean } = {}) {
  const [availableDays, setAvailableDays] = useState<DayAvailability[]>([]);
  const [timezone, setTimezone] = useState("");
  const [status, setStatus] = useState<AvailabilityStatus>(
    enabled ? "loading" : "idle",
  );
  const [request, setRequest] = useState(0);

  const refresh = useCallback(() => setRequest((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    setStatus("loading");
    fetch("/api/availability", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("availability request failed");
        return response.json() as Promise<AvailabilityResponse>;
      })
      .then((response) => {
        setAvailableDays(presentAvailability(response));
        setTimezone(response.timezone);
        setStatus("ready");
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setAvailableDays([]);
        setStatus("error");
      });
    return () => controller.abort();
  }, [enabled, request]);

  return { availableDays, timezone, status, refresh };
}
