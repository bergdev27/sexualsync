import Link from "next/link";
import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import "./tutorial.css";

// One step per tab, in the order a want usually travels: spark, Ask, talk,
// what's live, and the room's own rules.
const STEPS = [
  {
    href: "/games",
    label: "Play",
    title: "Catch the spark",
    sub: "Inspiration holds kinks, fantasies, clips, and links. Sex Quiz, Green Lights, The Pile, and Blind Reveal find the overlap with no one going first.",
    cta: "Open Play",
  },
  {
    href: "/ask",
    label: "Ask",
    title: "Make the want explicit",
    sub: "Tap the + in the middle of the tab bar to send one clear Ask. Your partner can accept, counter, pass, or park it.",
    cta: "Create an Ask",
  },
  {
    href: "/chat",
    label: "Sext",
    title: "Keep the heat going",
    sub: "A private thread just for the two of you — tease, plan, send a little heat.",
    cta: "Open Sext",
  },
  {
    href: "/sexboard",
    label: "Home",
    title: "See what is live",
    sub: "Active Asks, locked answers, and the overlap that is ready to act on.",
    cta: "Open Home",
  },
  {
    href: "/space",
    label: "Us",
    title: "Keep the room safe",
    sub: "Limits, Acts, private notes, Health, and the Vault. Notifications, privacy, and your account sit under the gear.",
    cta: "Back to Us",
  },
];

export default function TutorialPage() {
  return (
    <AppShell>
      <ScreenHeader
        back={{ href: "/space", label: "Us" }}
        showBrand={false}
        title="Quick tour"
        subtitle="A short map for getting from spark to yes."
      />

      <div className="settings-stage">
        <section className="settings-section tutorial-intro">
          <p className="eyebrow">The loop</p>
          <h2>Catch a spark, map what you want, make it explicit — and keep the boundaries in plain sight.</h2>
          <p>
            Sexualsync is your private, judgment-free room for the hot maybes, the explicit asks, and the shared rules that keep it safe enough to be greedy in.
          </p>
          <Link href="/inspiration" className="btn-primary pressable">Start with Inspiration</Link>
        </section>

        <section className="settings-section">
          <p className="eyebrow">Quick path</p>
          <div className="settings-card" aria-label="Tutorial steps">
            {STEPS.map((step, index) => (
              <TutorialStep key={step.href} index={index + 1} {...step} />
            ))}
          </div>
        </section>

        <Link href="/space" className="btn-primary tutorial-done-bottom pressable">
          Done
        </Link>
      </div>
    </AppShell>
  );
}

function TutorialStep({
  index,
  href,
  label,
  title,
  sub,
  cta,
}: {
  index: number;
  href: string;
  label: string;
  title: string;
  sub: string;
  cta: string;
}) {
  return (
    <Link href={href} className="settings-link tutorial-step pressable">
      <span className="tutorial-step-index">{index}</span>
      <span className="tutorial-step-copy">
        <span className="tutorial-step-label">{label}</span>
        <span className="settings-row-title">{title}</span>
        <span className="settings-row-sub">{sub}</span>
      </span>
      <span className="settings-link-chev tutorial-step-cta">{cta}</span>
    </Link>
  );
}
