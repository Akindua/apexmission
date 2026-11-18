"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";

export interface TurnstileWidgetProps {
  /** Cloudflare Turnstile site key (public). */
  siteKey: string;
  /** Called with the verified token on success (null clears it). */
  onSuccess: (token: string | null) => void;
  /** Called when the challenge expires. */
  onExpire?: () => void;
  /** Called when the challenge errors. */
  onError?: () => void;
}

/**
 * Imperative handle exposed via ref so parent pages can reset the widget.
 */
export interface TurnstileHandle {
  reset: () => void;
}

/**
 * Cloudflare Turnstile widget that only initialises after the component has
 * mounted in the DOM, inside a stable useRef container. This prevents the
 * "Cannot determine Turnstile's embedded location" error that occurs when the
 * Turnstile widget script (api.js) attempts to render into a container that
 * hasn't been hydrated yet (SSR / client navigation).
 *
 * The container ref is intentionally stable across renders so the widget script
 * always resolves the same DOM node.
 */
export const TurnstileWidget = forwardRef<TurnstileHandle, TurnstileWidgetProps>(
  ({ siteKey, onSuccess, onExpire, onError }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const turnstileRef = useRef<TurnstileInstance | null>(null);
    const [mounted, setMounted] = useState(false);

    // Mark as mounted only after the first client-side render so the Turnstile
    // widget script always finds a stable, hydrated container node.
    useEffect(() => {
      setMounted(true);
    }, []);

    useImperativeHandle(
      ref,
      () => ({
        reset: () => {
          turnstileRef.current?.reset();
        },
      }),
      [],
    );

    if (!mounted || !siteKey) return null;

    return (
      <div
        ref={containerRef}
        id="turnstile-widget"
        className="flex justify-center rounded-xl border border-emerald-500/20 bg-[#04100b]/60 p-3"
      >
        <Turnstile
          ref={turnstileRef}
          siteKey={siteKey}
          onSuccess={onSuccess}
          onExpire={onExpire}
          onError={onError}
          options={{ theme: "dark", size: "flexible" }}
        />
      </div>
    );
  },
);

TurnstileWidget.displayName = "TurnstileWidget";
