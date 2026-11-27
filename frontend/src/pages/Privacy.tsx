import LegalPage from "../components/LegalPage";

// Privacy Policy: issue #61. Opens logged in and logged out (see App.tsx).
// PLACEHOLDER TEXT ONLY. The final wording is written by the person responsible for what it promises, not by contributors.
// To find everything left to replace, search the project for "PLACEHOLDER".
// When the real text goes in, update TERMS_VERSION in src/lib/legal.ts.
function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <h2>Who we are</h2>
      <p>[PLACEHOLDER: who is responsible for your data]</p>

      <h2>What data we collect</h2>
      <p>[PLACEHOLDER: what data we collect]</p>

      <h2>How syllabus text is used</h2>
      <p>[PLACEHOLDER: how syllabus text is used]</p>

      <h2>What other students can see</h2>
      <p>[PLACEHOLDER: what is visible to other students]</p>

      <h2>Services we use</h2>
      <p>[PLACEHOLDER: outside services that store or process your data, and where]</p>

      <h2>Notifications</h2>
      <p>[PLACEHOLDER: what notifications we send and how to turn them off]</p>

      <h2>Your agreement record</h2>
      <p>[PLACEHOLDER: what we save when you agree to these terms]</p>

      <h2>How long we keep data</h2>
      <p>[PLACEHOLDER: how long we keep your data]</p>

      <h2>How to delete your account</h2>
      <p>[PLACEHOLDER: how to delete your account]</p>

      <h2>Your rights</h2>
      <p>[PLACEHOLDER: how to see, correct or get a copy of your data]</p>

      <h2>Changes to this policy</h2>
      <p>[PLACEHOLDER: how we tell you about changes]</p>

      <h2>Contact</h2>
      <p>[PLACEHOLDER: how to contact us about privacy]</p>
    </LegalPage>
  );
}

export default Privacy;
