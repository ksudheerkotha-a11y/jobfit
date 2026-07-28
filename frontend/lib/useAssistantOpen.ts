"use client";

import { useEffect, useState } from "react";

const KEY = "jobfit-assistant-open";

/** Shared by every page that hosts the AssistantPanel (dashboard, jobs,
 * auto-apply, resume) so the collapsed/open preference is consistent
 * across all of them, persisted client-side only — this is UI chrome
 * state, not user data worth a DB column. */
export function useAssistantOpen() {
  const [open, setOpenState] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem(KEY);
    if (stored !== null) setOpenState(stored === "1");
  }, []);

  function setOpen(value: boolean) {
    setOpenState(value);
    localStorage.setItem(KEY, value ? "1" : "0");
  }

  return [open, setOpen] as const;
}
