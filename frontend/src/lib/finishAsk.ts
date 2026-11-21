// "Did you finish?" answers of "No" are kept in this browser, so each late deadline is asked about once.
// Used by the desktop sidebar (components/CalendarSidebar.tsx) and the phone list (components/AgendaList.tsx).
const DISMISSED_KEY = "cohort:did-you-finish:dismissed";

export function loadDismissed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}

export function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify([...ids]));
  } catch {
    // Storage blocked: the question just comes back next visit
  }
}
