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
  | { type: "note"; text: string }
  /** One real HTTP endpoint — method + path + what it does. Used only by
   *  the API Reference category; the app's Server Actions (its actual
   *  mutation surface) are listed via plain `list` blocks instead, since
   *  they have no stable path to show here — see that article's own copy. */
  | { type: "endpoint"; method: string; path: string; description: string }
  /** A monospace snippet — an example request/response, not prose. */
  | { type: "code"; text: string }
  /** An inline link to a downloadable/viewable file or another page. */
  | { type: "link"; href: string; text: string };

export const HELP_CATEGORIES = [
  "Getting started",
  "Everyday finances",
  "Severance & redundancy scenarios",
  "Concepts & disclaimers",
  "API Reference",
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
      {
        type: "p",
        text: "For a privately insured (PKV) member, the app automatically counts their monthly premium as an outgoing on the Dashboard and in severance scenarios — the employer only pays half of a PKV premium, and that half already shows up as extra net pay, so leaving the premium out entirely would overstate take-home income. Uncheck 'Count private health insurance as an outgoing' on the member if you're already tracking that premium as a manual commitment, to avoid double-counting it.",
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
        text: "You can create additional profiles and clone an existing one (duplicates its properties, commitments, and income) as a starting point for a what-if variant. Severance scenarios can switch to a different profile from a given date via a Cost Phase — see the severance scenario articles.",
      },
      {
        type: "p",
        text: "On a cloned profile, each commitment or income row remembers the value it started at. Use the 'Adjust' control next to a row to move its amount up or down from there — a small badge shows the running difference (e.g. '+€50 vs baseline') so you can see at a glance how far that line item has drifted from where the profile began. This only appears on rows that came from a clone; items you add fresh to a profile have no baseline to compare against.",
      },
      {
        type: "p",
        text: "A profile's commitments are grouped by the property they're linked to — click a group to expand it, or its 'Delete all' button to remove every commitment linked to that property in one go, e.g. after deciding to sell it in this profile's what-if version. Anything not linked to a property is grouped by category instead (Housing, Utilities, Insurance, and so on), each its own collapsible section with its own subtotal.",
      },
      {
        type: "p",
        text: "The Income card and table show both net and gross — net is the headline figure, using each linked person's tax profile the same way the Income page does; a row whose share has no tax profile yet shows 'no tax profile' instead of guessing.",
      },
      {
        type: "p",
        text: "Once you have two or more profiles, a 'Compare' button on the Living Profiles list opens a side-by-side view — pick 2–4 profiles and see commitments (broken down by category), gross/net income, and the resulting net surplus or deficit lined up as columns.",
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
      {
        type: "p",
        text: "The list is grouped by property (each a collapsible section with its own subtotal); anything not linked to a property is grouped by category instead, in the same order as the list above.",
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
      {
        type: "p",
        text: "Alongside the monthly net/gross totals, the income page shows a total annual figure (recurring income annualized, plus any one-time bonus/holiday pay on top) — each broken down by household member and by income type whenever more than one contributes, so you can see at a glance who or what a year's income actually comes from.",
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
        text: "The scenario workspace is split into seven tabs: Overview (each person's negotiated package), Cash Flow (the projected balance chart and the full list of income/cost assumptions feeding it), Spend Analysis ('if you cut X, how much longer does this last'), Savings & Investment (setting aside part of a severance lump sum), Tax (a per-year, per-person tax breakdown), Timeline (cost-of-living phase changes, property endings, and one-off events), and Checklist (redundancy admin tasks).",
      },
      {
        type: "p",
        text: "Duplicate (next to Edit, on the scenario page, and on each card in the scenario list) makes a full copy — packages, phases, events, property changes, and savings rules — under a new name, and takes you straight to it. It's the fastest way to try a different multiplier, bonus inclusion, or garden-leave length: duplicate a known-good scenario, then edit the copy's package(s) rather than re-entering everything from scratch. Only this scenario's own (non-global) events/property changes/rules are copied — the copy still sees every global item fresh, with no overrides carried over. Delete removes a scenario and everything in it — packages, phases, events, checklist, savings rules, and any per-scenario overrides — permanently.",
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
      {
        type: "p",
        text: "\"Work end date\" and \"Severance payment date\" are separate fields, because they often are in real life. Work end date drives garden leave, ALG I timing, and notice pay — it's when employment actually ends. Severance payment date is about both tax and cash flow: German severance is taxed in the calendar year it's received, so paying it in a later tax year — once salary has stopped for the year — can meaningfully lower the tax owed on it, versus taking it immediately; and the projected balance chart moves the lump sum to land exactly on that date too, instead of assuming it arrives the moment garden leave ends. Leave the payment date blank to assume it lands the same month garden leave ends (today's default assumption).",
      },
      {
        type: "p",
        text: "Whenever the chosen payment date makes a real difference, the package card shows a \"Payment timing\" callout: a confirmed saving (green) when the payment already lands in a later tax year than employment ends, or a suggestion (amber) — \"delaying to January <year> could save €X more\" — when it's still scheduled within the departure year. The figure compares the two sides of that calendar-year boundary directly, so it's specific to your own numbers, not a generic rule of thumb.",
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
      {
        type: "p",
        text: "Each package's Overview card also shows 'Severance remaining after ALG I' — that person's own net severance carried forward by the household's actual projected cash-flow change from the month the lump sum landed to the month ALG I runs out, with a small up/down indicator showing that change on its own. It's a more useful checkpoint than a bare return-to-work date: 'if you haven't found work by then, here's roughly what's left of your payout.' It's anchored to that person's own severance rather than the whole household's balance, so a second person's much larger package in the same scenario doesn't distort the figure.",
      },
    ],
  },
  {
    slug: "projected-balance",
    title: "Projected balance & monthly breakdown",
    category: "Severance & redundancy scenarios",
    summary: "The depletion chart, the do-nothing comparison line, and clicking any month for its full income/outgoings breakdown.",
    blocks: [
      {
        type: "p",
        text: "The Cash Flow tab projects the household's balance forward month by month — garden leave pay, the severance lump sum, ALG I, health insurance, ordinary commitments and income, cost-phase changes, and one-off events, all combined. It reports the depletion date (the first month the balance goes negative, if ever, within a 10-year horizon) and the lowest balance point reached. The chart and its month-breakdown table start from today's calendar month and run through the severance event, so you see the household's real run-up to it rather than just the months from the severance event onward. If your household's own current liquid savings are set on the baseline Living Profile, a dashed 'do-nothing' line overlays the same chart — today's surplus or deficit held flat, for comparison against actually taking the severance.",
      },
      {
        type: "p",
        text: "Click any column on the chart to pin that month's full breakdown below it — every income and outgoing line item for that specific month, not just the running total. An income line shows its net amount, plus its gross amount underneath whenever tax genuinely reduces it (not shown when there's no tax profile yet, or for tax-exempt income like ALG I, which is labeled '(tax-free)' instead).",
      },
      {
        type: "p",
        text: "If a severance is still months (or years) away, the chart and breakdown table also show every month between today and the severance event — the household's ordinary income and costs before the severance itself begins — so you can see the whole run-up at a glance, not just the months from the severance event onward. The depletion date and lowest balance figures stay based on the severance scenario itself, though, not these extra lead-in months.",
      },
      {
        type: "p",
        text: "For a household with more than one person, everything on this tab also breaks out per person: a \"Runway status\" row shows each person's own depletion date alongside the household total, the month breakdown groups income and outgoings into each person's own section plus a \"Shared\" section for anything that isn't wholly one person's (a joint bill, or a cost split by percentage between you), and a \"Balance\" line shows each person's own running share alongside the total — each person's share is either their own income/cost outright, their real split percentage of a shared item, or an even split of a general household item with no owner set. The chart's hover tooltip and small colored dots on the balance line follow the same per-person breakdown, so you can see at a glance whether it's one person's spending or income driving a dip. With only one household member, none of this extra detail shows — the total is already the whole picture.",
      },
    ],
  },
  {
    slug: "spend-analysis",
    title: "Spend Analysis",
    category: "Severance & redundancy scenarios",
    summary: "\"If I cut this category entirely, how much longer does the runway last?\"",
    blocks: [
      {
        type: "p",
        text: "For every discretionary category (essential commitments are never suggested here) present anywhere in the scenario, Spend Analysis re-runs the projection with that category cut entirely from today onward and reports how many months it adds — or, if the scenario is already sustainable within the 10-year horizon after the cut, that it becomes sustainable outright.",
      },
      {
        type: "p",
        text: "Expand a row to see the individual commitments behind that category's total and the plain-language effect on the depletion date. Ranked with the biggest runway gain first. If the scenario is already sustainable before cutting anything, this tab has nothing to show.",
      },
    ],
  },
  {
    slug: "global-events-and-rules",
    title: "Global events & rules",
    category: "Severance & redundancy scenarios",
    summary: "Mark a one-off event, cost phase, property change, or savings rule as \"All scenarios\" so it applies everywhere without copy-pasting it into each one.",
    blocks: [
      {
        type: "p",
        text: "Every one-off event, cost phase, property change, and savings rule is either scoped to the one scenario it was created in, or global — applying to every scenario at once. Pick which when you add it: the add form has an \"Applies to\" toggle for \"This scenario only\" vs. \"All scenarios.\" Choosing \"All scenarios\" creates it directly in the Global list, not inside whichever scenario you happened to be viewing. A property can only have one global end date — if it already has one, edit that instead of adding a second. A global cost phase has no such limit — a timeline can have as many global phases as you need.",
      },
      {
        type: "p",
        text: "Global Rules (in the sidebar) is the dedicated home for these — view and edit them there without opening any particular scenario. Inside a scenario's own Timeline and Savings & Investment tabs, global items show up merged alongside that scenario's own, each labeled with a Global or Scenario badge. Editing a global item — from either place — edits the single shared object, and the change applies everywhere it's referenced immediately.",
      },
      {
        type: "p",
        text: "If just the amount (or, for a property change, the end date; or, for a cost phase, which Living Profile it switches to) needs to differ for one scenario, use Override right from that scenario's merged list — it supersedes the global default there only, without splitting the item into a separate copy; the row picks up an \"Overridden here\" badge, and a reset icon clears it back to the shared default. A cost phase's override only ever changes the profile, never the date it switches on. If more than that needs to diverge, use \"duplicate into this scenario\" instead — it makes a fully independent scenario-only copy seeded from the current values, and the global item stops counting in that one scenario so nothing is double-counted.",
      },
      {
        type: "note",
        text: "Deleting a global item doesn't delete any per-scenario overrides tied to it — they're kept and flagged under \"Needs review\" on the Global Rules page so you can see which scenarios had one before deciding what to do.",
      },
    ],
  },
  {
    slug: "savings-and-investment-rules",
    title: "Savings & Investment rules",
    category: "Severance & redundancy scenarios",
    summary: "Set aside part of a severance lump sum and model a return on it, without double-counting the principal.",
    blocks: [
      {
        type: "p",
        text: "A rule sets aside either a fixed amount or a percentage of one package's own net severance, plus an annual return rate and how often it's applied (monthly, quarterly, or annually). The form won't let a package's rules add up to more than its own severance — the available headroom is shown live as you allocate.",
      },
      {
        type: "p",
        text: "A rule can also be marked global (see Global events & rules) instead of tied to one scenario's package — it's set up against a household member instead, and resolves against whichever package that person has in each scenario it's viewed from, so the same rule can produce a different pot size per scenario.",
      },
      {
        type: "p",
        text: "The allocated amount compounds on its own, in its own pot, from the return rate and accrual frequency you set — ordinary household income never inflates it. It isn't fully walled off from spending, though: that money was never moved into a separate untouchable account, so if the household's overall spending draws its real balance below what's currently invested, the pot is drawn down to match (and stays down — it doesn't bounce back on its own later). Only the return shows up as income in the projection; the principal is never added twice, since it's already counted once as part of the severance lump sum itself.",
      },
      {
        type: "p",
        text: "Each rule's table row shows an example monthly figure (allocation × annual return ÷ 12) — a steady-state estimate of what the rule is worth per month at the start, before tax. It's for a quick sense of scale, not the exact amount any single accrual period pays: that depends on the accrual frequency, and grows over time as the pot compounds.",
      },
      {
        type: "p",
        text: "The accrued return is taxed under the flat Abgeltungsteuer (see Concepts & disclaimers) using the rule's own person's tax profile, and shown net of that tax in the monthly breakdown — with the gross figure alongside it, same as any other taxed income line.",
      },
    ],
  },
  {
    slug: "tax-tab",
    title: "Tax tab",
    category: "Severance & redundancy scenarios",
    summary: "A full annual tax position per person, per year — income by source, the tax bracket ladder, and the severance's own Fünftelregelung.",
    blocks: [
      {
        type: "p",
        text: "The Tax tab gives each household member their own full-year tax position for any calendar year touched by the scenario — pick a year from the pill selector at the top (it defaults to the year a severance lump sum actually lands, usually the most interesting one). Every regular income source for that person that year — salary, garden leave pay, rental, anything else — is combined into one figure and taxed together, so a second income source shares that person's real tax position instead of getting its own fresh tax-free allowance. If a severance starts partway through the year, the months before it (January onward) are included too, so the year's total is complete.",
      },
      {
        type: "p",
        text: "The 'Income by tax bracket' bar always shows the full 0–45% German tax ladder, not just the part reached — every band from 0% up to 45% is visible, with the reached ones lit up (showing how much of that band's own range is filled) and the rest greyed out, so you can see both the whole structure and exactly where the income sits on it at a glance. Any severance lump sum landing that year gets its own separate segment at the end, since it's taxed via the Fünftelregelung (a genuinely different mechanism) rather than stacking through the bands like ordinary income.",
      },
      {
        type: "p",
        text: "Investment/savings returns (from the Savings & Investment tab) show up in their own 'Investment & savings income' block — gross, tax, and net — kept separate from the bracket bar since they're taxed under the flat Abgeltungsteuer, not the progressive bands, but still counted in the year's overall gross/tax/net totals.",
      },
      {
        type: "note",
        text: "ALG I is tax-free but, in reality, can still push up the tax rate on a person's other income that year (Progressionsvorbehalt) — that specific effect isn't modeled here, so a year with substantial ALG I plus other income may be a little more favorable in this app than in a real Steuerbescheid.",
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
        text: "A Cost Phase switches the scenario to a different Living Profile from a given date — the whole set of commitments and income changes at once (e.g. modeling a move to a cheaper home 6 months in), rather than editing individual line items. It can also be marked global instead of scoped to this one scenario — see Global events & rules — so every scenario switches profile at the same date by default; a scenario can still override just which profile it switches to there, without changing the date.",
      },
      {
        type: "p",
        text: "Ending a property stops every commitment linked to that property from a given date, without affecting the property or its commitments elsewhere. It can also be marked global instead of scoped to this one scenario — see Global events & rules — so the same end date applies everywhere without re-entering it per scenario.",
      },
      {
        type: "p",
        text: "One-off events add a single inflow or outflow on a specific date (e.g. a lump-sum expense, an unexpected payment), or start a new recurring income stream from a date onward (e.g. modeling a new job before you know the exact terms — the variant generator, below, automates this for job-search timing specifically). An event can also be marked global instead of scoped to this one scenario — see Global events & rules.",
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
      {
        type: "p",
        text: "Below the chart, a Summary table lists the scenarios as columns and metrics as rows, so it's easy to scan one figure at a time across every scenario — starting balance, gross and net severance (with an indented row for each person's own share directly underneath), tax on severance, tax saved via the Fünftelregelung, garden leave pay, total package, ALG I (amount and duration), health insurance costs, Sperrzeit risk, monthly burn, lowest balance, and the depletion date.",
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
          "Abgeltungsteuer — the flat 25% tax on capital income (interest, dividends, investment/savings returns), plus Soli and church tax if registered, after an annual tax-free allowance (the Sparerpauschbetrag — €1,000 single, €2,000 married). Separate from, and not part of, the progressive wage-tax bands everything else in this app is taxed under.",
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
        text: "When a person has more than one income source, each one's net figure is apportioned from their combined tax position by its own share of the gross total, rather than one source being deemed 'first' and taxed at a literal marginal rate on top of another — a reasonable approximation with no single correct answer, but not identical to a real Steuerbescheid's own attribution. ALG I's Progressionsvorbehalt effect (tax-free, but still nudging the rate on other income that year) also isn't modeled, on the Tax tab.",
      },
      {
        type: "p",
        text: "Every figure here is a planning estimate to help you understand the shape of your options — not a substitute for your payroll department, the Agentur für Arbeit, a Steuerberater, or a lawyer, especially before signing anything or relying on a specific date. Where the app itself isn't sure, it says so directly (e.g. the Sperrzeit risk banner, or a note next to figures like the ALG I subsidy ceiling that need periodic re-verification against current official publications).",
      },
    ],
  },

  // ── API Reference ────────────────────────────────────────────────────
  {
    slug: "data-export-api",
    title: "Data export API",
    category: "API Reference",
    summary: "The two real HTTP endpoints this app has — CSV exports of your commitments and income — documented as an OpenAPI spec.",
    blocks: [
      {
        type: "p",
        text: "Runaway doesn't have a general-purpose REST API. Almost everything — adding a commitment, sizing a severance package, generating scenario variants — goes through Next.js Server Actions, an internal call mechanism wired directly into the app's own forms (see 'Server Actions reference' below). The two routes below are the exception: genuine HTTP endpoints with a stable path, callable outside the app's own pages by anything that can send an authenticated GET request.",
      },
      {
        type: "endpoint",
        method: "GET",
        path: "/commitments/export",
        description: "Every commitment on your baseline Living Profile as a CSV file — name, category, amount, frequency, essential flag, split ownership, and dates.",
      },
      {
        type: "endpoint",
        method: "GET",
        path: "/income/export",
        description: "Every income row on your baseline Living Profile as a CSV file — name, type, gross amount, currency, split ownership, and the salary/rental-specific detail fields for rows of that type.",
      },
      {
        type: "p",
        text: "Both require the same signed-in session the app's own UI uses (a Supabase Auth session cookie set at /login) — there's no separate API key. Row Level Security means a valid session can only ever export that account's own household data, never anyone else's.",
      },
      {
        type: "link",
        href: "/openapi.yaml",
        text: "View the full OpenAPI 3.1 spec (openapi.yaml)",
      },
      {
        type: "code",
        text: "GET /commitments/export\n\n> Name,Category,Amount (EUR),Frequency,Essential,Linked to,Start date,End date\n> Rent,Housing,1800,Monthly,Yes,Household,2024-01-01,",
      },
      {
        type: "note",
        text: "The OpenAPI spec deliberately covers only these two routes. Turning Server Actions into fake REST paths just to list them in the same document would misrepresent how they actually work — they have no stable URL and aren't meant to be called from outside this app.",
      },
    ],
  },
  {
    slug: "server-actions-reference",
    title: "Server Actions reference",
    category: "API Reference",
    summary: "Every mutation the app can make, grouped by area — the real write surface behind every form.",
    blocks: [
      {
        type: "p",
        text: "Every add/edit/delete form in the app is backed by a Next.js Server Action — a plain async function marked \"use server\" that a form posts to directly. They're not reachable as ordinary HTTP endpoints (no fixed URL, no versioning, nothing an external client could call), so they're listed here as a reference, not as part of the OpenAPI spec above. Most either return a small { error } shape the form displays inline, or redirect/refresh the page on success.",
      },
      {
        type: "list",
        items: [
          "Auth — login, logout: the Supabase Auth session itself.",
          "Household — createHouseholdMember, updateHouseholdMember, deleteHouseholdMember; upsertTaxProfile for Steuerklasse/church tax/children.",
          "Income & commitments — createIncome/updateIncome/deleteIncome/adjustIncomeAmount; createCommitment/updateCommitment/deleteCommitment/adjustCommitmentAmount/deleteCommitmentsByProperty, both including their split rows. The adjust* actions only touch the amount field, for the profile detail page's baseline-adjustment control; deleteCommitmentsByProperty is that same page's per-property \"Delete all\" bulk action.",
          "Properties — createProperty, updateProperty, deleteProperty, plus ownership splits.",
          "Living Profiles — createLivingProfile, cloneLivingProfile (also duplicates the source profile's properties/property_splits/commitments/income, snapshotting each commitment/income row's starting value as its baseline and remapping cloned commitments onto the new profile's own copy of each property), updateLivingProfile, deleteLivingProfile, updateCurrentLiquidSavings (the baseline's \"do-nothing\" reference figure).",
          "Severance scenarios — createScenario, updateScenario, deleteScenario (cascades to every child table); duplicateScenario deep-clones a scenario's packages/phases/events/property-ends/savings rules into a new one and takes you straight to it.",
          "Scenario packages, phases, events & property-ends — addScenarioPackage/updateScenarioPackage/deleteScenarioPackage; addScenarioPhase/deleteScenarioPhase (creates directly in the Global list instead when scoped \"All scenarios\"), setPhaseOverride/clearPhaseOverride/duplicateGlobalPhaseIntoScenario/dismissStalePhaseOverride (the override only ever supersedes profile_id, never start_date); addScenarioEvent/deleteScenarioEvent (same \"All scenarios\" global-insert exception as addScenarioPhase), setEventOverride/clearEventOverride/duplicateGlobalEventIntoScenario/dismissStaleEventOverride; addScenarioPropertyEnd/deleteScenarioPropertyEnd (same \"All scenarios\" global-insert exception), setPropertyEndOverride/clearPropertyEndOverride/duplicateGlobalPropertyEndIntoScenario/dismissStalePropertyEndOverride.",
          "Scenario checklist — addChecklistItem, toggleChecklistItem, deleteChecklistItem.",
          "Savings & investment rules — addSavingsRule (re-validates the target package's own headroom server-side, not just in the form), deleteSavingsRule, setSavingsRuleOverride/clearSavingsRuleOverride/duplicateGlobalSavingsRuleIntoScenario/dismissStaleSavingsRuleOverride.",
          "Global events & rules — addGlobalEvent/updateGlobalEvent/deleteGlobalEvent, addGlobalPhase/updateGlobalPhase/deleteGlobalPhase, addGlobalSavingsRule/updateGlobalSavingsRule/deleteGlobalSavingsRule, addGlobalPropertyEnd/updateGlobalPropertyEnd/deleteGlobalPropertyEnd: the shared objects behind Global Rules, edited independently of any scenario. Deleting one flags (doesn't delete) any scenario override tied to it.",
          "Scenario variants — generateScenarioVariants: bulk-creates several derived scenarios (different job-search timing assumptions) in one step.",
        ],
      },
      {
        type: "note",
        text: "This list is a reference for understanding what the app can change, not an invitation to call these directly — they're internal to the Next.js app and can change shape at any time without notice, unlike the two documented HTTP endpoints above.",
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
