"use client";

import { useEffect, useState } from "react";

export const ASSISTANT_OPEN_KEY = "jobfit-assistant-open";
export const ASSISTANT_OPEN_EVENT = "jobfit-assistant-open-changed";

/** Shared by every page that hosts the AssistantPanel (dashboard, jobs,
 * auto-apply, resume) so the collapsed/open preference is consistent
 * across all of them, persisted client-side only — this is UI chrome
 * state, not user data worth a DB column. The custom event lets the
 * support bubble (AppHeader, present on every page including ones that
 * don't render this hook's own setter) force the flag open even when
 * navigating to a page whose instance of this hook is already mounted
 * and won't re-read localStorage on its own. */
export function useAssistantOpen() {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(ASSISTANT_OPEN_KEY);
    if (stored !== null) setOpenState(stored === "1");

    function onExternalChange() {
      const stored = localStorage.getItem(ASSISTANT_OPEN_KEY);
      if (stored !== null) setOpenState(stored === "1");
    }
    window.addEventListener(ASSISTANT_OPEN_EVENT, onExternalChange);
    return () => window.removeEventListener(ASSISTANT_OPEN_EVENT, onExternalChange);
  }, []);

  function setOpen(value: boolean) {
    setOpenState(value);
    localStorage.setItem(ASSISTANT_OPEN_KEY, value ? "1" : "0");
    window.dispatchEvent(new Event(ASSISTANT_OPEN_EVENT));
  }

  return [open, setOpen] as const;
}
