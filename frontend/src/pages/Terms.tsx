import LegalPage from "../components/LegalPage";

// Terms of Service: issue #61. Opens logged in and logged out (see App.tsx).
// PLACEHOLDER TEXT ONLY. The final wording is written by the person responsible for what it promises, not by contributors.
// To find everything left to replace, search the project for "PLACEHOLDER".
// When the real text goes in, update TERMS_VERSION in src/lib/legal.ts.
function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <h2>About these terms</h2>
      <p>[PLACEHOLDER: who runs Cohort and who these terms are between]</p>

      <h2>Who can use Cohort</h2>
      <p>[PLACEHOLDER: who is allowed to sign up]</p>

      <h2>Your account</h2>
      <p>[PLACEHOLDER: keeping your account secure and what you're responsible for]</p>

      <h2>Syllabi and deadlines you add</h2>
      <p>[PLACEHOLDER: rules for what you upload, and what happens when you share a syllabus with other students]</p>

      <h2>Accuracy of deadlines</h2>
      <p>[PLACEHOLDER: deadlines are read automatically and may be wrong]</p>

      <h2>Study buddy and messages</h2>
      <p>[PLACEHOLDER: how to treat other students, and what happens after a report or block]</p>

      <h2>Acceptable use</h2>
      <p>[PLACEHOLDER: what you must not do on Cohort]</p>

      <h2>Ending your account</h2>
      <p>[PLACEHOLDER: how you can close your account and when we may suspend one]</p>

      <h2>Disclaimers and limits</h2>
      <p>[PLACEHOLDER: limits on what Cohort is responsible for]</p>

      <h2>Changes to these terms</h2>
      <p>[PLACEHOLDER: how we tell you about changes]</p>

      <h2>Contact</h2>
      <p>[PLACEHOLDER: how to contact us]</p>
    </LegalPage>
  );
}

export default Terms;
