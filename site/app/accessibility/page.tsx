import { setting } from "@/lib/server";
import Link from "next/link";

export const metadata = { title: "Accessibility | Coursewise" };

export default function Accessibility() {
  const email = setting("COURSEWISE_SUPPORT_EMAIL");
  return <main className="legal-page">
    <Link href="/">← Coursewise</Link>
    <h1>Accessibility at Coursewise</h1>
    <p>Coursewise is being developed for keyboard use, screen readers, zoom, and small screens. We use WCAG 2.1 Level AA as a design and testing target. This page does not claim that every feature has passed a full independent audit.</p>
    <h2>Get help or report a barrier</h2>
    <p>{email ? <>Email <a href={`mailto:${email}`}>{email}</a> with the page or Canvas feature, what you were trying to do, and your preferred way to receive a reply. Do not include passwords or sensitive student records.</> : <>A public support contact has not been configured for this private preview.</>}</p>
    <p>You can use the agenda calendar view if a month or week grid is difficult to navigate. In the Canvas organizer, use Tab to reach controls; the resize handle supports arrow keys, Page Up and Page Down, Home, and End.</p>
    <p><a href="/privacy-policy">Privacy notice</a></p>
  </main>;
}
