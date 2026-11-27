import { Link } from "react-router";

// Small links to the Terms and Privacy pages (issue #61) at the bottom of every page, logged in or out.
// People need the Privacy Policy now and then (to delete their data or contact us), so it stays one scroll away
// instead of in the account menu. inApp: on phones it has to sit above the bottom tabs.
function Footer({ inApp = false }: { inApp?: boolean }) {
  return (
    <footer className={inApp ? "site-footer site-footer-app" : "site-footer"}>
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

export default Footer;
