import { Link } from "react-router";
import LegalPage from "../components/LegalPage";
import { CONTACT_EMAIL } from "../lib/legal";

// Terms of Service: issue #61. Opens logged in and logged out (see App.tsx).
// Everything here should match what the app actually does. If a feature changes what these terms describe
// (who can sign up, what's shared, the upload limit, reports), update this page in the same PR and change
// TERMS_VERSION in src/lib/legal.ts so everyone is asked to agree again.
function Terms() {
  return (
    <LegalPage title="Terms of Service">
      <h2>About these terms</h2>
      <p>
        Cohort is a student project made by UAIS, a student club at the University of Alberta. These terms are an
        agreement between you and the Cohort team. By using Cohort you agree to them and to our{" "}
        <Link to="/privacy" className="link">
          Privacy Policy
        </Link>
        . If you don't agree, please don't use Cohort.
      </p>

      <h2>Who can use Cohort</h2>
      <p>
        Cohort is for University of Alberta students. You need a @ualberta.ca email address to make an account,
        whether you sign up with Google or with an email and password.
      </p>

      <h2>Your account</h2>
      <p>
        Keep your password to yourself and don't let anyone else use your account. You're responsible for what
        happens on your account. If you think someone else has got into it, reset your password and tell us.
      </p>

      <h2>Syllabi and deadlines you add</h2>
      <p>
        Only upload syllabi and other files you're allowed to use, such as ones your instructor gave your class.
        Your deadlines, and any dates you add yourself, stay yours and only you can see them, unless you share them.
      </p>
      <p>
        When you upload a syllabus, "Share with classmates" is on unless you untick it. Sharing adds the course,
        the instructor's name and the deadlines (with the sentence each one was read from) to the course library,
        where any Cohort user can find them and copy them to their own calendar. The library never shows who shared
        them. By sharing, you let us store that information and show it to other Cohort users until you stop sharing
        it or delete your account. Dates you added yourself, personal items and Canvas imports are never shared. You
        can stop sharing a course at any time from the course library.
      </p>

      <h2>Accuracy of deadlines</h2>
      <p>
        Cohort uses AI to read deadlines from syllabi, and shared syllabi come from other students. Either can be
        wrong, out of date or missing something. Always check dates, times and weights against your course's
        official syllabus and eClass, and follow your instructor if they disagree with Cohort. Cohort isn't an
        official University of Alberta service, and we're not responsible for a missed or late deadline.
      </p>

      <h2>Study buddy and messages</h2>
      <p>
        Study buddy pairs you with another student in one of your courses so you can chat. Be respectful. Don't
        harass, threaten or pressure anyone, don't send sexual or hateful content, and don't ask for or share
        anything that would break the University's rules on academic integrity, such as answers to graded work.
      </p>
      <p>
        You can unmatch or block someone at any time, and they won't be paired with you again. If you report
        someone, they're blocked and our team reads your note and a copy of the chat to decide what to do. We may
        warn, suspend or remove an account that breaks these terms.
      </p>

      <h2>Acceptable use</h2>
      <p>When you use Cohort, don't:</p>
      <ul>
        <li>pretend to be someone else, or use someone else's account</li>
        <li>upload anything illegal, harmful or that you don't have the right to share</li>
        <li>share deadlines you know are wrong, or misuse the "report a mistake" button</li>
        <li>spam other students, or use study buddy to advertise or sell things</li>
        <li>
          try to get around the daily upload limit, collect other people's information, or copy the course library
          in bulk with scripts or bots
        </li>
        <li>try to break into, overload or interfere with Cohort or the services it runs on</li>
      </ul>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time from the account menu (Delete account). That removes your account
        and your data as described in the Privacy Policy. We may suspend or remove an account that breaks these
        terms, or that we need to remove to protect other students or Cohort itself.
      </p>

      <h2>Disclaimers and limits</h2>
      <p>
        Cohort is a free project run by student volunteers. We provide it "as is", without promises that it will
        always be available, free of mistakes or kept running. We may change features, set limits (like the daily
        upload limit) or shut Cohort down. To the extent the law allows, the Cohort team and UAIS aren't liable for
        any loss that comes from using Cohort, including missed deadlines, lost data or what other students say or
        do.
      </p>
      <p>These terms are governed by the laws of Alberta and the federal laws of Canada that apply there.</p>

      <h2>Changes to these terms</h2>
      <p>
        If we change these terms in a way that matters, Cohort asks you to read and agree to the new version the
        next time you open the app. The date at the top of this page shows when they last changed.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="link">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}

export default Terms;
