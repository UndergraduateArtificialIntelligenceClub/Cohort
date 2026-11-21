import { IconShare } from "./Icons";
import Sheet from "./Sheet";

// How to add Cohort to the Home Screen by hand (iPhone, and phones without an install dialog).
// Opened from the account menu (AccountMenu.tsx) and the iPhone notifications card (NotificationPrompt.tsx).
function InstallSteps({ onClose }: { onClose: () => void }) {
  return (
    <Sheet title="Add Cohort to your Home Screen" onClose={onClose}>
      <p className="muted">It opens like an app, without the browser bars. Takes about 10 seconds.</p>
      <ol className="steps">
        {/* Each step's text sits in one span, so the bold words and icon flow inside the sentence */}
        <li>
          <span>
            Open your browser's menu: <strong>•••</strong>, <strong>⋮</strong> or the Share button{" "}
            <IconShare size={16} className="inline align-[-3px]" />
          </span>
        </li>
        <li>
          <span>
            If you don't see it straight away, tap <strong>Share</strong> and scroll down
          </span>
        </li>
        <li>
          <span>
            Tap <strong>Add to Home Screen</strong>
          </span>
        </li>
      </ol>
      <button type="button" className="btn btn-primary btn-block btn-lg" onClick={onClose}>
        Got it
      </button>
    </Sheet>
  );
}

export default InstallSteps;
