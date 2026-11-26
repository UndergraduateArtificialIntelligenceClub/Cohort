import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { IconCheck } from "./Icons";
import { PALETTE } from "../lib/courseColors";

// The palette, in a small box under a course chip (opened from the chip's color dot, CalendarFilters.tsx).
// Picking a color closes it, and so do Escape and clicking anywhere else. Only palette colors, never a free
// color picker, so every course stays readable and colorblind-friendly.
type Props = {
  course: string;
  current: number | undefined;
  onPick: (color: number) => void;
  // refocus: put focus back on the dot that opened it (Escape), not when the click went somewhere else
  onClose: (refocus: boolean) => void;
};

function ColorPopover({ course, current, onPick, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Lined up with the chip's left edge, or its right edge when that would run off the screen (phones)
  const [alignRight, setAlignRight] = useState(false);

  useLayoutEffect(() => {
    const box = ref.current?.getBoundingClientRect();
    if (box && box.right > window.innerWidth - 8) setAlignRight(true);
    // Start on the current color, so the keyboard can move from there
    const swatches = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    (swatches.find((b) => b.getAttribute("aria-pressed") === "true") ?? swatches[0])?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose(true);
    }
    function onPointerDown(e: PointerEvent) {
      // The chip's own dot toggles it, so clicks there are left to the dot
      const chip = ref.current?.parentElement;
      if (chip && !chip.contains(e.target as Node)) onClose(false);
    }
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={`Color for ${course}`}
      className={`color-pop${alignRight ? " is-right" : ""}`}
    >
      {PALETTE.map((color, i) => (
        <button
          key={color.name}
          type="button"
          className="swatch"
          style={{ "--c": color.hex } as CSSProperties}
          title={color.name}
          aria-label={color.name}
          aria-pressed={i === current}
          onClick={() => onPick(i)}
        >
          {i === current && <IconCheck size={14} />}
        </button>
      ))}
    </div>
  );
}

export default ColorPopover;
