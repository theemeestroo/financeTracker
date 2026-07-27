/**
 * Source data for the in-app Help Centre (`/help`). Keep this in sync with
 * user-facing feature changes — see claude.md's Documentation Policy.
 *
 * Content is structured (not markdown) so the /help page can render it
 * without a markdown-parser dependency.
 */

export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "list"; items: string[] }
  | { type: "note"; text: string };

export const HELP_CATEGORIES = [
  "Getting started",
  "Everyday finances",
  "Severance & redundancy scenarios",
  "Concepts & disclaimers",
] as const;

export type HelpCategory = (typeof HELP_CATEGORIES)[number];

export type HelpArticle = {
  slug: string;
  title: string;
  category: HelpCategory;
  summary: string;
  blocks: HelpBlock[];
};

export const HELP_ARTICLES: HelpArticle[] = [
  // ── Getting started ─────────────────────────────────────────────────
  {
    slug: "household-and-tax-profiles",
    title: "Household members & tax profiles",
    category: "Getting started",
    summary: "Who's in the household, and the tax details that drive every net-income figure in the app.",
    blocks: [
      {
        type: "p",
        text: "Household is the list of people whose money this app tracks. A new account starts with one member ('You') created automatically. Add a partner or anyone else whose income/commitments you want to split or attribute.",
      },
      {
        type: "p",
        text: "Each member can have a Tax Profile — Steuerklasse (tax class I–VI), whether they pay church tax (and in which state, since the rate is 8% in Bavaria/Baden-Württemberg and 9% elsewhere), and whether they have children (exempts from the childless Pflegeversicherung surcharge). Nothing is netted for a member without a tax profile — income linked to them shows gross only, and the dashboard flags how many rows are missing a profile rather than silently guessing.",
      },
      {
        type: "p",
        text: "Health insurance status (statutory GKV vs. private PKV, plus GKV Zusatzbeitrag rate or PKV monthly premium) lives on the member directly, not the tax profile — it's a personal fact that matters even before a tax profile exists, and it drives the post-severance health-insurance cost modeling in severance scenarios.",
      },
      { type: "note", text: "Tax class V/VI withholding is approximated as the standard tariff — a documented simplification, not the exact real-world V/VI mechanism. See Concepts & disclaimers." },
    ],
  },
  {
    slug: "living-profiles",
    title: "Living Profiles",
    category: "Getting started",
    summary: "A named snapshot of ongoing costs and income — the baseline everything else is measured against.",
    blocks: [
      {
        type: "p",
        text: "A Living Profile is a set of commitments and income representing one version of the household's ongoing finances — e.g. 'Current', or a hypothetical 'After the move' profile. Every account has exactly one baseline profile (created automatically, name 'Current'), which can never be deleted — it's the default target for new commitments and income.",
      },
      {
        type: "p",
        text: "You can create additional profiles and clone an existing one (duplicates its commitments and income) as a starting point for a what-if variant. Severance scenarios can switch to a different profile from a given date via a Cost Phase — see the severance scenario articles.",
      },
    ],
  },

  // ── Everyday finances ────────────────────────────────────────────────
  {
    slug: "dashboard",
    title: "Dashboard",
    category: "Everyday finances",
    summary: "The household's current monthly surplus/deficit, spend by category, and a trend line.",
    blocks: [
      {
        type: "p",
        text: "The dashboard shows the baseline profile's current net monthly surplus or deficit (net income minus commitments), a spend-by-category breakdown, and a trend chart reconstructed from your commitments' and income's start dates (there's no separate history table — the trend is recomputed from current data as of each past month, up to 12 months back).",
      },
      {
        type: "p",
        text: "Use the owner filter to see the same figures scoped to one household member's share only, based on how commitments/income are split.",
      },
    ],
  },
  {
    slug: "commitments",
    title: "Commitments",
    category: "Everyday finances",
    summary: "Recurring or one-off expenses — rent, insurance, subscriptions, and everything else you pay out.",
    blocks: [
      {
        type: "p",
        text: "A commitment is anything the household pays: rent, insurance, subscriptions, debt repayments, and so on. Each has a category, an amount, a frequency (monthly, quarterly, annual, or one-off), and an essential/discretionary flag (essential vs. Leisure/Discretionary-style categories aren't the same thing — essential is its own toggle, independent of category).",
      },
      {
        type: "list",
        items: [
          "Housing", "Utilities", "Insurance", "Subscriptions", "Debt / Loans", "Transport",
          "Childcare / Education", "Healthcare", "Groceries & Living", "Leisure / Discretionary",
          "Savings / Investment", "One-off", "Other",
        ],
      },
      {
        type: "p",
        text: "A commitment can be split across household members by percentage (for shared costs) or left unattributed (a general household cost). It can also be linked to a property — linking a mortgage/insurance/utility bill to a property lets a severance scenario end all of them at once by ending the property, instead of deleting each commitment individually.",
      },
      { type: "p", text: "Export the current commitment list as CSV from the commitments page." },
    ],
  },
  {
    slug: "income",
    title: "Income",
    category: "Everyday finances",
    summary: "Salary, part-time, rental, or other income — with the compensation detail salary rows need for accurate net figures.",
    blocks: [
      {
        type: "p",
        text: "An income row has a type — Salary, Part-time, Rental, or Other — an amount, and a frequency. Salary rows carry extra fields the net-income calculation actually uses: Christmas money (Weihnachtsgeld) and holiday pay (Urlaubsgeld) as a % of one month's base, an annual bonus (with a choice of whether it's paid as a lump sum or spread across the year for display purposes), a car allowance (cash received, taxable) versus a company car cost (a payroll deduction that reduces net pay, not gross), and a pension contribution (pre-tax, reference only).",
      },
      {
        type: "p",
        text: "Rental income has its own field instead — an overhead % reserved for vacancy/maintenance, deducted before the figure is taxed.",
      },
      {
        type: "p",
        text: "Income can be split across household members the same way commitments can. A split share is netted using that specific person's own tax profile — if a share's member has no tax profile yet, that share is excluded from net totals (not silently shown as gross), and the app tells you how many rows are affected rather than guessing.",
      },
      {
        type: "p",
        text: "Non-EUR income (currently EUR or GBP) converts to EUR using a manually-entered exchange rate — this app doesn't fetch live rates.",
      },
      { type: "p", text: "Export the current income list as CSV from the income page." },
    ],
  },
  {
    slug: "properties",
    title: "Properties",
    category: "Everyday finances",
    summary: "Group related commitments (mortgage, insurance, utilities) under one physical asset.",
    blocks: [
      {
        type: "p",
        text: "A property is a lightweight grouping — a name, address, and notes — that commitments can link to. It has its own ownership split, independent of the splits on the commitments linked to it. The main value of linking commitments to a property shows up in severance scenarios: ending a property there ends every linked commitment on the same date in one step, instead of editing each one.",
      },
    ],
  },

  // ── Severance & redundancy scenarios ────────────────────────────────
  {
    slug: "severance-scenarios-overview",
    title: "Severance scenarios: the big picture",
    category: "Severance & redundancy scenarios",
    summary: "What a scenario models, and how the workspace (Overview / Cash Flow / Timeline / Checklist) is organized.",
    blocks: [
      {
        type: "p",
        text: "A severance scenario models a household's finances through a redundancy — garden leave, the severance lump sum, unemployment benefit (ALG I), the health-insurance transition, and everything else that changes for a while. A scenario has a starting balance (today's liquid savings, separate from any severance figure) and one or two severance packages — most households model one person; a two-earner household can model both people's severance running on independent timelines within the same scenario.",
      },
      {
        type: "p",
        text: "The scenario workspace is split into four tabs: Overview (each person's negotiated package), Cash Flow (the projected balance chart and the full list of income/cost assumptions feeding it), Timeline (cost-of-living phase changes, property endings, and one-off events), and Checklist (redundancy admin tasks).",
      },
    ],
  },
  {
    slug: "severance-packages",
    title: "Severance packages",
    category: "Severance & redundancy scenarios",
    summary: "How the gross severance figure is calculated, garden leave, and the net-of-tax result.",
    blocks: [
      {
        type: "p",
        text: "A package's gross severance is multiplier × years of service × monthly base salary — the multiplier defaults to presets from 1× (statutory floor for voluntary packages) up to 2.5× (exceptional, strong-leverage cases), or enter any value. Optionally fold the annual bonus, car benefit, and/or Christmas money into the base used for that formula. If you already know the real negotiated figure, override the computed gross directly instead.",
      },
      {
        type: "p",
        text: "Garden leave models a notice period (in months) during which the package holder keeps receiving net salary before the severance lump sum and any unemployment benefit begin. The net severance lump sum itself is computed using Fünftelregelung (§34 EStG) — Germany's rule for taxing a one-time lump sum without pushing all of it into the top bracket — see Concepts & disclaimers.",
      },
      { type: "p", text: "The employment start date also drives a pension Wartezeit view — a timeline of departure-timing options around Germany's 5-year statutory pension qualifying period." },
    ],
  },
  {
    slug: "alg1-and-sperrzeit",
    title: "Unemployment benefit (ALG I) & Sperrzeit",
    category: "Severance & redundancy scenarios",
    summary: "Claiming ALG I, the Sperrzeit risk flag, and the health-insurance cost that comes with each.",
    blocks: [
      {
        type: "p",
        text: "Toggle whether a package's holder claims ALG I. The app estimates both the monthly amount (Leistungsentgelt) and the eligible duration from salary, insured months (defaults from years of service — override it if that doesn't reflect your full insured history), age, and whether the claimant has a qualifying child. You can also defer the claim start by a number of months (e.g. self-funding a few months of travel first) and enter a known return-to-work date, which stops ALG I and the related health-insurance cost from that date.",
      },
      {
        type: "p",
        text: "Sperrzeit is a benefit-suspension risk: the Agentur für Arbeit can withhold ALG I for up to 12 weeks if it decides the exit wasn't sufficiently involuntary. This app flags the risk with a heuristic — no risk is flagged only if a notice period was modeled (garden leave with a positive notice period) and the severance is at or below the statutory 0.5×-salary-per-year reference ceiling. Outside that, ALG I is modeled starting 12 weeks later than it otherwise would, as a conservative default.",
      },
      {
        type: "note",
        text: "This is a heuristic, not a legal determination — always confirm with the Agentur für Arbeit or a lawyer. If you already know your exit agreement's wording avoids a Sperrzeit, check 'Exit agreement wording confirmed to avoid a Sperrzeit' on the package to model ALG I starting right away instead. That's your own assertion, not something this app verifies.",
      },
      {
        type: "p",
        text: "Health insurance is priced separately for the gap before ALG I starts (self-funded — voluntary GKV continuation at the full rate, or the full PKV premium) versus while on ALG I (the Bundesagentur pays GKV in full; PKV gets a capped subsidy). This cost shows up automatically in the projected balance and the assumed income & costs table once a package claims ALG I or has garden leave.",
      },
    ],
  },
  {
    slug: "projected-balance",
    title: "Projected balance & monthly breakdown",
    category: "Severance & redundancy scenarios",
    summary: "The depletion chart, and clicking any month for its full income/outgoings breakdown.",
    blocks: [
      {
        type: "p",
        text: "The Cash Flow tab projects the household's balance forward month by month — garden leave pay, the severance lump sum, ALG I, health insurance, ordinary commitments and income, cost-phase changes, and one-off events, all combined. It reports the depletion date (the first month the balance goes negative, if ever, within a 10-year horizon) and the lowest balance point reached.",
      },
      {
        type: "p",
        text: "Click any column on the chart to pin that month's full breakdown below it — every income and outgoing line item for that specific month, not just the running total.",
      },
    ],
  },
  {
    slug: "timeline-phases-events",
    title: "Cost phases, property changes & one-off events",
    category: "Severance & redundancy scenarios",
    summary: "Everything in a scenario that changes the household's costs or income partway through.",
    blocks: [
      {
        type: "p",
        text: "A Cost Phase switches the scenario to a different Living Profile from a given date — the whole set of commitments and income changes at once (e.g. modeling a move to a cheaper home 6 months in), rather than editing individual line items.",
      },
      {
        type: "p",
        text: "Ending a property within a scenario stops every commitment linked to that property from a given date, without affecting the property or its commitments outside this scenario.",
      },
      {
        type: "p",
        text: "One-off events add a single inflow or outflow on a specific date (e.g. a lump-sum expense, an unexpected payment), or start a new recurring income stream from a date onward (e.g. modeling a new job before you know the exact terms — the variant generator, below, automates this for job-search timing specifically).",
      },
    ],
  },
  {
    slug: "checklist",
    title: "Redundancy checklist",
    category: "Severance & redundancy scenarios",
    summary: "Admin tasks with target dates, auto-seeded from the scenario's severance start date.",
    blocks: [
      {
        type: "p",
        text: "The first severance package added to a scenario auto-seeds a checklist of common redundancy admin tasks — registering as job-seeking, deciding on health insurance, using the legal reflection period on a mutual-exit agreement (Aufhebungsvertrag), registering unemployed and applying for ALG I, and requesting a reference (Arbeitszeugnis) — each with a target date relative to the severance start date.",
      },
      { type: "note", text: "These are reasonable planning defaults, not exact statutory deadlines — for example, the real notification deadline depends on when you actually learn your end date, which this app doesn't separately track. Add, edit, or remove items freely." },
    ],
  },
  {
    slug: "variants-and-compare",
    title: "Generating variants & comparing scenarios",
    category: "Severance & redundancy scenarios",
    summary: "Model a few job-search timelines at once and see them side by side.",
    blocks: [
      {
        type: "p",
        text: "From a scenario with at least one package, 'Generate variants' clones the scenario into three copies — by default 3, 6, and 9 months until a new job at 100%, 90%, and 80% of the previous combined salary, all editable — each with its own new-job recurring-income event, and takes you straight to a side-by-side comparison of all three.",
      },
      {
        type: "p",
        text: "The Compare page overlays any set of scenarios' projected balance lines on one chart, so you can see at a glance how sensitive the runway is to how long the job search actually takes.",
      },
    ],
  },

  // ── Concepts & disclaimers ───────────────────────────────────────────
  {
    slug: "german-concepts-explained",
    title: "German tax & benefit concepts, in plain English",
    category: "Concepts & disclaimers",
    summary: "Steuerklasse, Fünftelregelung, ALG I, Sperrzeit, and the statutory severance floor.",
    blocks: [
      {
        type: "list",
        items: [
          "Steuerklasse (tax class, I–VI) — determines how much wage tax is withheld from a salary. Roughly: I = single, II = single parent, III/V = a married couple splitting withholding unevenly (III gets more take-home, V less, evening out at tax return time), IV = married with similar earnings, VI = a second job.",
          "Fünftelregelung (§34 EStG) — the rule for taxing a one-time lump sum like severance: it taxes 1/5 of the lump sum stacked on top of your regular income, takes the extra tax that causes, and multiplies by 5. This avoids the whole lump sum being taxed as if it were your permanent new income level.",
          "ALG I (Arbeitslosengeld I) — unemployment benefit, roughly 60% of your capped, tax-adjusted net salary (67% with a qualifying child), for a duration based on how long you were insured and your age.",
          "Sperrzeit — a period (commonly 12 weeks) during which ALG I can be withheld if the Agentur für Arbeit decides you contributed to your own unemployment (e.g. an exit with no notice period and an outsized payout).",
          "Statutory severance floor (§1a KSchG) — a rule-of-thumb reference ceiling of 0.5 months' salary per year of service, used both as a common negotiation reference point and as half of this app's Sperrzeit safe-harbor heuristic.",
        ],
      },
    ],
  },
  {
    slug: "not-tax-or-legal-advice",
    title: "Important: this app is not tax or legal advice",
    category: "Concepts & disclaimers",
    summary: "Every German tax/benefit figure here is a planning estimate, not a determination.",
    blocks: [
      {
        type: "p",
        text: "This app models German wage tax, severance tax (Fünftelregelung), unemployment benefit (ALG I), and Sperrzeit risk using published formulas and rates, with documented simplifications where the exact real-world mechanism is either legally uncertain in advance (Sperrzeit) or materially harder to model precisely (tax classes V/VI, the Bundesagentur's own internal Leistungsgruppen system for ALG I).",
      },
      {
        type: "p",
        text: "Every figure here is a planning estimate to help you understand the shape of your options — not a substitute for your payroll department, the Agentur für Arbeit, a Steuerberater, or a lawyer, especially before signing anything or relying on a specific date. Where the app itself isn't sure, it says so directly (e.g. the Sperrzeit risk banner, or a note next to figures like the ALG I subsidy ceiling that need periodic re-verification against current official publications).",
      },
    ],
  },
];

export function helpArticlesByCategory(): { category: HelpCategory; articles: HelpArticle[] }[] {
  return HELP_CATEGORIES.map((category) => ({
    category,
    articles: HELP_ARTICLES.filter((a) => a.category === category),
  }));
}
