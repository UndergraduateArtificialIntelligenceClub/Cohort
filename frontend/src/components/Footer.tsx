import { Link } from "react-router";

// Links to the Terms and Privacy pages (issue #61), under the login page and the legal pages before login.
// In the app they're in the account menu instead, to keep the app's screens clear.
function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

export default Footer;
