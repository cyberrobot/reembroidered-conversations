"use client";

import { ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileVerification({
  token,
  onTokenChange,
  resetKey,
  invalid,
}: {
  token: string | null;
  onTokenChange: (token: string | null) => void;
  resetKey: string;
  invalid: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | undefined>(undefined);
  const onTokenChangeRef = useRef(onTokenChange);
  onTokenChangeRef.current = onTokenChange;
  const [loadFailed, setLoadFailed] = useState(false);
  const [renderAttempt, setRenderAttempt] = useState(0);

  const renderWidget = useCallback(() => {
    if (!containerRef.current || !window.turnstile || widgetIdRef.current)
      return false;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
      action: "booking_hold",
      theme: "light",
      size: "flexible",
      appearance: "interaction-only",
      callback: (value: string) => {
        setLoadFailed(false);
        onTokenChangeRef.current(value);
      },
      "expired-callback": () => onTokenChangeRef.current(null),
      "error-callback": () => {
        onTokenChangeRef.current(null);
        setLoadFailed(true);
      },
    });
    return true;
  }, []);

  useEffect(() => {
    onTokenChangeRef.current(null);
    if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
  }, [resetKey]);

  useEffect(() => {
    if (!token) return;
    const expiry = window.setTimeout(() => {
      onTokenChangeRef.current(null);
      if (widgetIdRef.current) window.turnstile?.reset(widgetIdRef.current);
    }, 300_000);
    return () => window.clearTimeout(expiry);
  }, [token]);

  useEffect(() => {
    setLoadFailed(false);
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-turnstile="booking"]',
    );
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (!renderWidget()) setLoadFailed(true);
    };
    if (!existing) {
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.turnstile = "booking";
      document.head.appendChild(script);
    }
    if (window.turnstile) renderWidget();
    else script.addEventListener("load", onLoad, { once: true });
    const timeout = window.setTimeout(() => {
      if (!widgetIdRef.current && !token) setLoadFailed(true);
    }, 8_000);
    return () => {
      window.clearTimeout(timeout);
      script.removeEventListener("load", onLoad);
      if (widgetIdRef.current) window.turnstile?.remove?.(widgetIdRef.current);
      widgetIdRef.current = undefined;
    };
  }, [renderAttempt, renderWidget]);

  const retry = () => {
    onTokenChange(null);
    setLoadFailed(false);
    if (widgetIdRef.current && window.turnstile)
      window.turnstile.reset(widgetIdRef.current);
    else setRenderAttempt((value) => value + 1);
  };

  return (
    <div
      data-testid="turnstile-verification"
      className={`mb-6 rounded-xl border bg-[#FAF8F5] p-3 sm:p-4 ${invalid ? "border-[#A35048] ring-1 ring-[#A35048]" : "border-[#E8DFD5]"}`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-[#282524]">
          <ShieldCheck className="h-5 w-5 text-[#A35048]" aria-hidden="true" />
          <span>Security Verification</span>
        </div>
      </div>
      {loadFailed ? (
        <div
          role="alert"
          className="rounded-xl border border-[#F2D6CD] bg-[#FFF5F2] p-3 text-xs text-[#6B3E36]"
        >
          <p>
            Security verification could not load. Check your firewall or ad
            blocker, then retry.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={retry}
              className="font-medium underline underline-offset-4"
            >
              Retry verification
            </button>
          </div>
        </div>
      ) : (
        <div ref={containerRef} className="min-h-16" />
      )}
      {invalid && !token && (
        <p role="alert" className="mt-2 text-xs text-[#A35048]">
          Please complete the quick security verification before confirming.
        </p>
      )}
      {token && (
        <p className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Verification successful. You can proceed with booking.
        </p>
      )}
      <p className="mt-2 text-[11px] text-[#78716C]">
        Privacy-preserving bot protection. No puzzles or cookies required.
      </p>
    </div>
  );
}
