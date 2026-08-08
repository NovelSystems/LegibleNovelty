// Design-token PROOF PAGE — not a product feature.
// Exercises the full token set (both fonts, every color role, the type scale,
// spacing, radius, and a hover transition that honors prefers-reduced-motion) so
// the system is visibly verified. Safe to delete once real UI exists; it imports
// no app/lib code and has no route dependencies.

type Swatch = { name: string; cls: string; hex: string; dark?: boolean };

const teal: Swatch[] = [
  { name: "50", cls: "bg-teal-50", hex: "#eaf5f4" },
  { name: "100", cls: "bg-teal-100", hex: "#cfe7e5" },
  { name: "200", cls: "bg-teal-200", hex: "#a6d2cf" },
  { name: "300", cls: "bg-teal-300", hex: "#6fb3af" },
  { name: "400", cls: "bg-teal-400", hex: "#3d908c", dark: true },
  { name: "500", cls: "bg-teal-500", hex: "#167c78", dark: true },
  { name: "600·primary", cls: "bg-teal-600", hex: "#0f6360", dark: true },
  { name: "700·hover", cls: "bg-teal-700", hex: "#0c4f4d", dark: true },
  { name: "800·active", cls: "bg-teal-800", hex: "#0a403e", dark: true },
  { name: "900", cls: "bg-teal-900", hex: "#072b2a", dark: true },
];
const gold: Swatch[] = [
  { name: "100", cls: "bg-gold-100", hex: "#f5e4bf" },
  { name: "300", cls: "bg-gold-300", hex: "#e0b457" },
  { name: "400·accent", cls: "bg-gold-400", hex: "#ce9a2c" },
  { name: "600·text", cls: "bg-gold-600", hex: "#916413", dark: true },
  { name: "700·text", cls: "bg-gold-700", hex: "#6f4e0e", dark: true },
];
const sage: Swatch[] = [
  { name: "100", cls: "bg-sage-100", hex: "#dee8e4" },
  { name: "300", cls: "bg-sage-300", hex: "#9db6ad" },
  { name: "400·secondary", cls: "bg-sage-400", hex: "#7c9b90" },
  { name: "600·text", cls: "bg-sage-600", hex: "#495f55", dark: true },
  { name: "700", cls: "bg-sage-700", hex: "#37463f", dark: true },
];
const gray: Swatch[] = [
  { name: "50", cls: "bg-gray-50", hex: "#f7f8f8" },
  { name: "100", cls: "bg-gray-100", hex: "#eef0ef" },
  { name: "200·border", cls: "bg-gray-200", hex: "#e1e4e3" },
  { name: "300·input", cls: "bg-gray-300", hex: "#cbd0cf" },
  { name: "400", cls: "bg-gray-400", hex: "#9aa3a1" },
  { name: "500·muted", cls: "bg-gray-500", hex: "#63706d", dark: true },
  { name: "600", cls: "bg-gray-600", hex: "#4c5754", dark: true },
  { name: "700·body", cls: "bg-gray-700", hex: "#333b39", dark: true },
  { name: "800", cls: "bg-gray-800", hex: "#242a29", dark: true },
  { name: "900·heading", cls: "bg-gray-900", hex: "#141918", dark: true },
];

function Ramp({ title, note, items }: { title: string; note: string; items: Swatch[] }) {
  return (
    <div className="mb-8">
      <h3 className="text-lg mb-1">{title}</h3>
      <p className="text-sm text-muted-foreground mb-3">{note}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((s) => (
          <div key={s.name} className={`${s.cls} rounded-md w-28 h-16 p-2 flex flex-col justify-between border border-border`}>
            <span className={`text-xs ${s.dark ? "text-white" : "text-gray-900"}`}>{s.name}</span>
            <span className={`text-xs ${s.dark ? "text-white" : "text-gray-900"}`}>{s.hex}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const typeScale = [
  { cls: "text-4xl", label: "text-4xl · 36 / 1.2 — h1" },
  { cls: "text-3xl", label: "text-3xl · 30 / 1.25 — h2" },
  { cls: "text-2xl", label: "text-2xl · 24 / 1.35 — h3" },
  { cls: "text-xl", label: "text-xl · 20 / 1.5" },
  { cls: "text-lg", label: "text-lg · 18 / 1.6" },
  { cls: "text-base", label: "text-base · 16 / 1.6 — default UI body" },
  { cls: "text-sm", label: "text-sm · 14 / 1.5 — labels" },
  { cls: "text-xs", label: "text-xs · 12 / 1.5 — meta" },
];

const spacing = [1, 2, 3, 4, 6, 8, 12];

export default function StyleGuidePage() {
  return (
    <main className="max-w-4xl mx-auto p-8">
      <header className="mb-10 border-b border-border pb-6">
        <p className="text-xs text-accent-text font-bold tracking-wide uppercase mb-2">
          Design tokens · proof page
        </p>
        <h1 className="text-4xl mb-2">Legible Novelty</h1>
        <p className="text-base text-gray-600">
          Interface text is Atkinson Hyperlegible. Module content is Lora. Clarity over flair.
        </p>
      </header>

      <section className="mb-12">
        <h2 className="text-2xl mb-4">Color</h2>
        <Ramp title="Primary — deep teal" note="Base teal-600 (AAA on white). Hover 700, active 800, disabled 300." items={teal} />
        <Ramp title="Accent — warm gold" note="Sparingly: discoverability indicators, key CTAs. 400 for fills; 600/700 for text." items={gold} />
        <Ramp title="Secondary — sage" note="Quieter, less-prominent UI. 400 for fills; 600 for text." items={sage} />
        <Ramp title="Neutral gray" note="Text, borders, surfaces. 500+ meet WCAG AA text contrast on white." items={gray} />
      </section>

      <section className="mb-12">
        <h2 className="text-2xl mb-4">Buttons &amp; state</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-bold transition-colors duration-200 ease-standard hover:bg-primary-hover">
            Primary (hover me)
          </button>
          <button className="bg-secondary text-secondary-foreground rounded-md px-4 py-2 text-sm font-bold transition-colors duration-200 ease-standard hover:bg-sage-200">
            Secondary
          </button>
          <button className="bg-accent text-accent-foreground rounded-md px-4 py-2 text-sm font-bold transition-colors duration-200 ease-standard hover:bg-gold-500">
            Accent CTA
          </button>
          <button className="bg-danger text-danger-foreground rounded-md px-4 py-2 text-sm font-bold transition-colors duration-200 ease-standard hover:bg-danger-700">
            Danger
          </button>
          <button disabled className="bg-primary-disabled text-white rounded-md px-4 py-2 text-sm font-bold cursor-not-allowed">
            Disabled
          </button>
        </div>
        <p className="text-sm text-muted-foreground mt-3">
          Hover transitions use duration-200 · ease-standard, and collapse to near-instant under
          prefers-reduced-motion.
        </p>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl mb-4">Typography — interface (Atkinson)</h2>
        <div className="space-y-2">
          {typeScale.map((t) => (
            <p key={t.cls} className={t.cls}>
              {t.label}
            </p>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl mb-4">Typography — module content (Lora)</h2>
        <div className="module-content max-w-prose border border-border rounded-lg p-6 bg-gray-50">
          <p className="mb-4">
            This block is wrapped in <code className="font-sans text-sm bg-muted px-1 rounded-sm">.module-content</code>,
            the only place Lora appears. It sets an 18px reading size with 1.75 line-height for
            comfortable long-form reading — the authored module text, not the editor chrome around it.
          </p>
          <p>
            The surrounding interface stays in Atkinson Hyperlegible; the two families are never
            blended within one region. <em>Emphasis renders in Lora italic</em> and{" "}
            <strong>strong renders in Lora bold</strong>.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="text-2xl mb-4">Spacing (Tailwind default scale)</h2>
        <div className="space-y-2">
          {spacing.map((n) => (
            <div key={n} className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground w-14">p/gap-{n}</span>
              <div className="bg-teal-600 h-4 rounded-sm" style={{ width: `${n * 0.25}rem` }} />
              <span className="text-xs text-muted-foreground">{n * 4}px</span>
            </div>
          ))}
        </div>
      </section>

      <footer className="text-xs text-muted-foreground border-t border-border pt-6">
        Tokens: <code>app/globals.css</code> · Reference: <code>docs/design-tokens.md</code>. Brand
        color seeds are placeholders pending a logo sample.
      </footer>
    </main>
  );
}
