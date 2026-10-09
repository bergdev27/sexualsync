import AppShell from "@/components/AppShell";
import ScreenHeader from "@/components/ScreenHeader";
import "../desire.css";

// Static explainer behind the "how common is this" tags on Kinks. Every claim
// here comes from a published study; the tags in lib/fantasy-themes.ts point
// at these anchors. Keep the two in step.
export default function WhyWeSayThisPage() {
  return (
    <AppShell>
      <ScreenHeader variant="bar" back={{ href: "/inspiration", label: "Inspiration" }} title="Why we say this" />
      <article className="why-stage">
        <p className="why-lead">
          Most fantasies are ordinary. A study that asked 1,516 adults about 55 fantasies found very few that were statistically unusual. When a Kink matches a fantasy that research actually measured, we say how common it is. When we don&apos;t know, we say nothing.
        </p>

        <section id="power" className="why-section">
          <h2 className="why-title">Power play</h2>
          <p>
            Fantasies about being dominated came up often in that study, and more often among women than men. Dominance and submission fantasies tend to go together.
          </p>
          <p className="why-source">Joyal, Cossette &amp; Lapierre, Journal of Sexual Medicine, 2015</p>
        </section>

        <section id="stranger" className="why-section">
          <h2 className="why-title">Someone new</h2>
          <p>
            Sex with a stranger was a fantasy for just under half of women and over 70% of men. Having the fantasy says nothing about wanting to act on it.
          </p>
          <p className="why-source">Joyal, Cossette &amp; Lapierre, Journal of Sexual Medicine, 2015</p>
        </section>

        <section id="swinging" className="why-section">
          <h2 className="why-title">Swapping partners</h2>
          <p>
            42% of men and 18% of women reported fantasizing about swinging.
          </p>
          <p className="why-source">Joyal, Cossette &amp; Lapierre, Journal of Sexual Medicine, 2015</p>
        </section>

        <section id="kink" className="why-section">
          <h2 className="why-title">Kink</h2>
          <p>
            Consensual kink is play, not a symptom. In a study of 902 people who practice BDSM, they were less neurotic, less sensitive to rejection, and reported higher well-being than a comparison group. The comparison group wasn&apos;t a perfect cross-section of the population, but later work points the same way.
          </p>
          <p className="why-source">Wismeijer &amp; van Assen, Journal of Sexual Medicine, 2013</p>
        </section>

        <section id="line" className="why-section">
          <h2 className="why-title">Where the line is</h2>
          <p>
            The same researchers describe the fantasies worth worrying about: ones involving someone who didn&apos;t consent, real harm, or a fantasy you need in order to be satisfied at all. Role-play you both agree to is still play.
          </p>
        </section>

        <p className="why-foot">
          Numbers come from a few studies, not from this app. Nobody here sees what anyone else wrote.
        </p>
      </article>
    </AppShell>
  );
}
