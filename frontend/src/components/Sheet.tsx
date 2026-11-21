import { useEffect, useId, type ReactNode } from "react";
import { createPortal } from "react-dom";

// A small popup for menus and short questions. On phones every popup (this one, DeadlineModal, ReviewPopup)
// slides up from the bottom as a sheet; that's all CSS (.overlay and .modal in index.css).
type Props = {
  title: string;
  // Shown as a heading, or only read out by screen readers when the sheet is a plain menu
  showTitle?: boolean;
  onClose: () => void;
  children: ReactNode;
};

function Sheet({ title, showTitle = true, onClose, children }: Props) {
  const id = useId();

  // Escape closes it, like tapping outside
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Rendered at the end of <body>: inside the frosted top bar (backdrop-filter), "position: fixed" would be
  // measured from the bar instead of the screen, and the sheet would be squashed into it
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        className="modal sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={id} className={showTitle ? "modal-title mb-3" : "sr-only"}>
          {title}
        </h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

export default Sheet;
