import { useEffect, type ReactNode } from "react";
import { IconAlert } from "./Icons";
import { LEGAL_IS_DRAFT, LEGAL_UPDATED } from "../lib/legal";

// Shared layout for the Terms and Privacy pages (issue #61). The wording lives in src/pages/Terms.tsx and Privacy.tsx.
// The draft banner goes away on its own once TERMS_VERSION in src/lib/legal.ts no longer starts with "draft".
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  // Footer links are at the bottom of the page, so start each legal page from the top.
  // Braces matter: an effect may only return a cleanup function, and newer browsers make scrollTo return a Promise.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <main className="page legal-page">
      <div className="page-head">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-sub">Last updated: {LEGAL_UPDATED}</p>
        </div>
      </div>
      {LEGAL_IS_DRAFT && (
        <p role="note" className="notice notice-error mb-5">
          <IconAlert />
          <span>
            <strong>Draft, not final.</strong> This page is placeholder text, not our actual {title.toLowerCase()}.
          </span>
        </p>
      )}
      <div className="legal-body">{children}</div>
    </main>
  );
}

export default LegalPage;
