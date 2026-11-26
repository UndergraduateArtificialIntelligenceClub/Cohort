import { Link } from "react-router";

// Links to the Terms and Privacy pages (issue #61), at the bottom of every screen, logged in or out
function Footer() {
  return (
    <footer className="site-footer">
      <Link to="/terms">Terms</Link>
      <Link to="/privacy">Privacy</Link>
    </footer>
  );
}

export default Footer;
