import { setting } from "@/lib/server";
import Link from "next/link";

export const metadata = { title: "Copyright reports | Coursewise" };

export default function CopyrightReports() {
  const email = setting("COURSEWISE_SUPPORT_EMAIL");
  return <main className="legal-page">
    <Link href="/">← Coursewise</Link>
    <h1>Copyright reports</h1>
    <p>Students should upload only material they are permitted to use. Coursewise stores uploaded files privately for the student who uploaded them.</p>
    <p>If you believe material stored in Coursewise infringes your copyright, {email
      ? <>send a report to <a href={`mailto:${email}`}>{email}</a>.</>
      : <>contact information must be configured before this service is opened to the public.</>} Include the work you own, the material you are reporting and enough information to locate it, your contact details, and an explanation of the rights involved. Do not include student passwords or unrelated private records.</p>
    <p>We review reports and may remove access to material while resolving them. This page does not designate a DMCA agent or claim safe-harbor registration.</p>
    <p><Link href="/privacy-policy">Privacy notice</Link></p>
  </main>;
}
