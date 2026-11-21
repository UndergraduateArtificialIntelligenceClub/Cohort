import { useSyncExternalStore } from "react";

// Phone layout: bottom tabs, a list instead of the month grid, bottom sheets, full-screen chats.
// Keep this width in sync with the "Phones" @media block at the end of index.css.
export const PHONE_QUERY = "(max-width: 720px)";

const media = window.matchMedia(PHONE_QUERY);

function subscribe(onChange: () => void) {
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

// True while the screen is phone-sized. Updates when a window is resized or a tablet is rotated.
export function useIsPhone(): boolean {
  return useSyncExternalStore(subscribe, () => media.matches);
}
