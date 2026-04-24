"use client";

// wagmi auto-reconnects on page load via `useAccount().isReconnecting`.
// The UX no longer needs a dedicated welcome-back prompt — keep the stub so
// existing imports don't break, but render nothing.
export function WelcomeBackBanner() {
  return null;
}
