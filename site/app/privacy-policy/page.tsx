import { setting } from "@/lib/server";
import Link from "next/link";

export const metadata = { title: "Privacy notice | Coursewise" };

export default function PrivacyPolicy() {
  const email = setting("COURSEWISE_SUPPORT_EMAIL");
  const operator = setting("COURSEWISE_OPERATOR_NAME");
  return <main className="legal-page">
    <Link href="/">← Coursewise</Link>
    <h1>Coursewise privacy notice</h1>
    <p>Effective October 15, 2026. This notice covers the Coursewise website and Canvas browser extension. {operator ? <>Coursewise is operated by {operator}. </> : <>The legal operator has not been configured for this private preview. </>}Coursewise is intended for students age 13 or older. If you are under 13, do not use it or submit information.</p>
    <h2>Information Coursewise uses</h2>
    <p>For a signed-in workspace, Coursewise stores the account identifier supplied by ChatGPT sign-in; courses, assignments, dates and grade history you enter or connect; study plans and focus sessions; uploaded files; review cards; and preferences. If you connect Canvas through a school-approved OAuth connection, Coursewise reads course, assignment, and calendar data and stores encrypted access credentials needed to keep that connection. A calendar feed URL is used for one import and is not saved.</p>
    <p>After you accept the extension disclosure, the extension reads Canvas courses, grades, assignments, and announcements in your signed-in browser to show its organizer. It stores connected school domains, appearance choices, course names and pictures, and IDs of items you mark as read in Chrome local storage. It does not send Canvas data to Coursewise or another service.</p>
    <h2>Service providers and security</h2>
    <p>The website uses the Sites hosting platform on Cloudflare Workers, D1, and R2 to run the service and store account records and uploads. Canvas is provided by your school through Instructure. Account data is scoped to the signed-in user, and Canvas OAuth tokens are encrypted before storage. This release does not send content to an AI provider and has no ad pixels, analytics service, payment processor, or subscription trial. Hosting and provider operational logs or backups may persist under their own retention practices.</p>
    <h2>Your choices and retention</h2>
    <p>In Data &amp; privacy, you can export workspace data, download original uploads, delete a course, or delete your workspace. We record the date of your 13+ eligibility confirmation. Active workspace records remain until you delete them. Data from earlier preview features may remain in your account until you delete the workspace; those features are no longer available in this release. Workspace deletion removes account data, original uploads, and Canvas credentials, while retaining a minimal marker associated with your account identifier to avoid recreating sample data. Deletion cannot recall copies you downloaded or immediately remove provider backups or logs. Browser-local appearance choices and read-item IDs remain until you clear extension storage or remove the extension.</p>
    <p>You can review and correct courses, dates, grades, and study settings in your workspace. For account identity information managed by ChatGPT sign-in, use that provider&apos;s account controls. This version does not collect browsing across other sites for advertising or analytics, so a browser Do Not Track signal does not change its behavior; no third-party ad tracker is embedded in the site.</p>
    <h2>Questions and changes</h2>
    <p>Changes to this notice will appear here with a revised effective date. A new use of student data that requires consent will be presented for a separate choice before it begins. {email ? <>For privacy or accessibility questions or a correction request, contact <a href={`mailto:${email}`}>{email}</a>.</> : <>A public support contact has not been configured for this private preview.</>}</p>
    <p><a href="/accessibility">Accessibility information</a></p>
  </main>;
}
