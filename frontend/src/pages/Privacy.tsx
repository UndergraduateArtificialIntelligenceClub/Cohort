import LegalPage from "../components/LegalPage";
import { CONTACT_EMAIL } from "../lib/legal";

// Privacy Policy: issue #61. Opens logged in and logged out (see App.tsx).
// Every promise here should match the code: what's stored (supabase/migrations/), what other students see
// (study buddy first name only, library never shows the uploader), what's kept after an account is deleted
// (study buddy reports). If a change makes any of it untrue, update this page in the same PR and change
// TERMS_VERSION in src/lib/legal.ts so everyone is asked to agree again.
function Privacy() {
  return (
    <LegalPage title="Privacy Policy">
      <h2>Who we are</h2>
      <p>
        Cohort is a student project made by UAIS, a student club at the University of Alberta. The Cohort team is
        responsible for the information you give Cohort. This policy explains what we collect, why, who can see it
        and how to delete it. We don't sell your data, show ads or use tracking or analytics tools.
      </p>

      <h2>What data we collect</h2>
      <ul>
        <li>
          <strong>Your account:</strong> your @ualberta.ca email address and password (stored scrambled, so nobody
          can read it). If you sign in with Google, we also get the name and profile details Google sends, such as a
          link to your profile picture.
        </li>
        <li>
          <strong>Your deadlines:</strong> each deadline's course, title, date, time, type and weight, the sentence
          from the syllabus it was read from, and whether you've marked it done. Also any dates you add yourself,
          including personal ones.
        </li>
        <li>
          <strong>Your settings:</strong> your course colors and your notification choices.
        </li>
        <li>
          <strong>What you share:</strong> syllabi you share to the course library, and mistakes you report on
          someone else's.
        </li>
        <li>
          <strong>Study buddy:</strong> the courses you're looking for a buddy in, your matches, the messages you
          send and when you last read each chat, plus anyone you block or report.
        </li>
        <li>
          <strong>Notifications:</strong> if you turn them on, the address your browser gives us for sending them,
          and which reminders we've already sent so you don't get one twice.
        </li>
        <li>
          <strong>Your agreement:</strong> which version of these Terms and this Privacy Policy you agreed to, and
          when.
        </li>
      </ul>
      <p>
        Our hosting providers also keep standard technical logs, such as IP addresses, browser type and times of
        requests, which are used for security and fixing problems. Your browser stores your login and a few small
        settings (like your calendar filters) on your own device.
      </p>

      <h2>How syllabus text is used</h2>
      <p>
        When you upload a syllabus, its text is sent to our server and on to Google's Gemini AI, which reads out the
        deadlines. We don't keep the file or the full text, only the deadlines you save and the sentence each one
        came from. We use Gemini's paid service, so Google doesn't use your syllabus to train or improve its models.
        Google may keep it for a short time to detect abuse, as its terms allow.
      </p>
      <p>
        If you import from Canvas, our server uses your calendar feed link once to download your due dates. We don't
        save the link.
      </p>
      <p>
        We count how many syllabi each account reads per day, to apply the daily upload limit. That count isn't
        saved.
      </p>

      <h2>What other students can see</h2>
      <ul>
        <li>
          <strong>Your calendar</strong> is private. Nobody else can see your deadlines or the dates you add.
        </li>
        <li>
          <strong>Course library:</strong> if you share a syllabus, other users see the course, the instructor's name,
          the deadlines and the sentence each came from, and how many people have used it. They never see who shared
          it. If someone reports a mistake on it, you see their message but not who sent it.
        </li>
        <li>
          <strong>Study buddy:</strong> your match sees your first name (from your Google account, or "Classmate" if
          you signed up with email), the course you matched in, and the messages you send them. They never see your
          email address, CCID or photo, and they aren't told if you block or report them, only that the chat ended.
        </li>
      </ul>

      <h2>Who on our team can see your data</h2>
      <p>
        A few members of the Cohort team can reach the database to run and fix the app. They only look at someone's
        data when they need to, for example to answer your request or to deal with a report. When you report a
        study buddy, we save your note, both of your email addresses and first names, and the last 100 messages of
        the chat, so the team can decide whether to suspend that account.
      </p>

      <h2>Services we use</h2>
      <p>These companies store or process data for us, only so Cohort can work:</p>
      <ul>
        <li>
          <strong>Supabase:</strong> logins and our database, where everything above is stored. Our database is in
          the United States (US East).
        </li>
        <li>
          <strong>Google Gemini:</strong> reads deadlines from syllabus text.
        </li>
        <li>
          <strong>Google sign-in:</strong> if you choose to log in with Google.
        </li>
        <li>
          <strong>Vercel</strong> hosts the website and <strong>Render</strong> runs our syllabus reader.
        </li>
        <li>
          <strong>Your browser's push service</strong> (from Google, Apple or Mozilla, depending on your browser)
          delivers notifications. Notifications are encrypted, so the push service can't read them.
        </li>
      </ul>
      <p>
        This means your information is stored and processed outside Canada, mostly in the United States, and may be
        available to authorities there under their laws.
      </p>

      <h2>Notifications</h2>
      <p>
        Notifications are off until you turn them on and your browser asks your permission. If you do, we send
        deadline reminders (the evening before something is due, and a heads-up 3 days before exams and anything
        worth 15% or more) and study buddy alerts (a new match or new messages). A study buddy alert says who and which
        course, never what they wrote. Nothing is sent between 11 PM and 8 AM Edmonton time. You can turn either kind
        off in the account menu under Notifications, or block notifications in your browser.
      </p>

      <h2>Your agreement record</h2>
      <p>
        When you agree to the Terms and this Privacy Policy, we save which version you agreed to and the time, so we
        know whether to ask you again after a change. Nobody can edit that record. It's deleted with your account.
      </p>

      <h2>How long we keep data</h2>
      <p>
        We keep your data until you delete it or delete your account. A shared syllabus stops showing in the course
        library once its last deadline has passed, and is deleted when you stop sharing it or delete your account.
        Study buddy reports are kept after either account is deleted, so the team can still act on them and spot
        repeat problems. Deleted data can stay in our database provider's backups for a short time before those are
        replaced.
      </p>

      <h2>How to delete your account</h2>
      <p>
        Open the account menu and choose Delete account. That permanently deletes your account and everything linked
        to it: your deadlines, settings, notification sign-ups, study buddy requests, matches and chats (for both of
        you), the syllabi you shared to the course library and your agreement record. It can't be undone. The only
        thing kept is any study buddy report made by you or about you, as explained above.
      </p>

      <h2>Your rights</h2>
      <p>
        You can see and edit your deadlines, settings and shared syllabi in the app at any time. To get a copy of
        your data, ask a question about it, correct something you can't change yourself, or make a complaint, email
        us at the address below. We'll answer within 30 days.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If we change this policy in a way that matters, Cohort asks you to read and agree to the new version the next
        time you open the app. The date at the top of this page shows when it last changed.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests about your privacy? Email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="link">
          {CONTACT_EMAIL}
        </a>
        .
      </p>
    </LegalPage>
  );
}

export default Privacy;
