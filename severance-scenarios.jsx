import { useState, useMemo } from "react";

const NOTICE_MONTHS = 6;

// German income tax 2025 - simplified progressive calculation
function germanIncomeTax(income) {
  if (income <= 11604) return 0;
  if (income <= 17005) {
    const y = (income - 11604) / 10000;
    return (979.18 * y + 1400) * y;
  }
  if (income <= 66760) {
    const z = (income - 17005) / 10000;
    return (192.59 * z + 2397) * z + 966.53;
  }
  if (income <= 277825) return 0.42 * income - 10602.13;
  return 0.45 * income - 18936.88;
}

function solidaritySurcharge(tax) {
  if (tax <= 18130) return 0;
  return Math.min(tax * 0.055, (tax - 18130) * 0.119);
}

function calcTax(income) {
  const lst = germanIncomeTax(Math.max(income, 0));
  const soli = solidaritySurcharge(lst);
  return lst + soli;
}

// Fünftelregelung: tax on severance = 5 × [tax(regular + severance/5) - tax(regular)]
function fuenftelTax(regularIncome, severance) {
  const baseTax = calcTax(regularIncome);
  const withFifth = calcTax(regularIncome + severance / 5);
  return 5 * (withFifth - baseTax);
}

function marginalTax(regularIncome, severance) {
  return calcTax(regularIncome + severance) - calcTax(regularIncome);
}

const fmt = (n) => "€" + Math.round(n).toLocaleString("de-DE");

const MULTIPLIERS = [1, 1.5, 1.75, 2, 2.5];

const SCENARIO_CONFIGS = [
  { id: "base_only", label: "Base only", includeBonus: false, includeCar: false, gardenLeave: false, color: "#94a3b8" },
  { id: "with_garden", label: "+ Garden leave", includeBonus: false, includeCar: false, gardenLeave: true, color: "#60a5fa" },
  { id: "with_bonus", label: "+ Bonus in base", includeBonus: true, includeCar: false, gardenLeave: true, color: "#34d399" },
  { id: "full", label: "Full package", includeBonus: true, includeCar: true, gardenLeave: true, color: "#f59e0b" },
];

const MULTIPLIER_LABELS = {
  1:    { tag: "Minimum", desc: "Statutory floor for voluntary packages" },
  1.5:  { tag: "Standard", desc: "Common for AT staff at large German corporates" },
  1.75: { tag: "Good", desc: "Achievable with negotiation at director level" },
  2:    { tag: "Strong", desc: "Siemens/SAP range for long-tenured senior staff" },
  2.5:  { tag: "Best case", desc: "Exceptional — requires strong leverage or legal pressure" },
};

function NumberField({ label, value, onChange, suffix, hint }) {
  return (
    <div>
      <div style={{ fontSize: "0.62rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>{label}</div>
      <div style={{ position: "relative" }}>
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
          style={{
            width: "100%",
            background: "#080c18",
            border: "1.5px solid #1a2235",
            borderRadius: 8,
            color: "#f1f5f9",
            fontSize: "1.05rem",
            fontWeight: 700,
            padding: "0.55rem 2.6rem 0.55rem 0.75rem",
            boxSizing: "border-box",
            outline: "none",
          }}
        />
        {suffix && (
          <span style={{
            position: "absolute", right: "0.75rem", top: "50%", transform: "translateY(-50%)",
            fontSize: "0.72rem", color: "#475569", fontWeight: 600,
          }}>{suffix}</span>
        )}
      </div>
      {hint && <div style={{ fontSize: "0.62rem", color: "#334155", marginTop: 3 }}>{hint}</div>}
    </div>
  );
}

export default function App() {
  // Editable inputs — default to the example payslip values
  const [monthlySalary, setMonthlySalary] = useState(10480);
  const [holidayPct, setHolidayPct] = useState(79);
  const [annualBonus, setAnnualBonus] = useState(12000);
  const [carBenefit, setCarBenefit] = useState(6630);
  const [pensionMonthly, setPensionMonthly] = useState(600);
  const [yearsService, setYearsService] = useState(19);

  const [activeConfig, setActiveConfig] = useState("with_bonus");
  const [activeMultiplier, setActiveMultiplier] = useState(1.75);
  const [view, setView] = useState("scenarios");

  const derived = useMemo(() => {
    const annualBase = monthlySalary * 12;
    const xmasPay = monthlySalary;
    const holidayPay = monthlySalary * (holidayPct / 100);
    const totalAnnualCash = annualBase + xmasPay + holidayPay + annualBonus;
    const regularTaxable = annualBase + annualBonus - (853 * 12) - 1200; // approx SV + BAV deduction
    return { annualBase, xmasPay, holidayPay, totalAnnualCash, regularTaxable };
  }, [monthlySalary, holidayPct, annualBonus]);

  function buildScenario(multiplier, includeBonus, includeCar, gardenLeave) {
    let monthlyBase = monthlySalary;
    if (includeBonus) monthlyBase += annualBonus / 12;
    if (includeCar) monthlyBase += carBenefit / 12;
    const severanceGross = multiplier * yearsService * monthlyBase;
    const noticePay = gardenLeave ? NOTICE_MONTHS * monthlySalary : 0;
    const totalGross = severanceGross + noticePay;
    const taxFuenftel = fuenftelTax(derived.regularTaxable, severanceGross);
    const taxMarginal = marginalTax(derived.regularTaxable, severanceGross);
    const taxSaving = taxMarginal - taxFuenftel;
    const netSeverance = severanceGross - taxFuenftel;
    return { multiplier, monthlyBase, severanceGross, noticePay, totalGross, taxFuenftel, taxMarginal, taxSaving, netSeverance };
  }

  const cfg = SCENARIO_CONFIGS.find(s => s.id === activeConfig);
  const result = buildScenario(activeMultiplier, cfg.includeBonus, cfg.includeCar, cfg.gardenLeave);
  const mlabel = MULTIPLIER_LABELS[activeMultiplier];

  const allResults = MULTIPLIERS.map(m => buildScenario(m, cfg.includeBonus, cfg.includeCar, cfg.gardenLeave));
  const maxGross = allResults[allResults.length - 1].totalGross;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#080c18",
      color: "#e2e8f0",
      fontFamily: "'DM Sans', system-ui, sans-serif",
      padding: "1.75rem 1rem 3rem",
    }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.65rem", letterSpacing: "0.18em", color: "#475569", textTransform: "uppercase", marginBottom: 6 }}>
            BMW Group · {yearsService} Years Service · AT Staff · Munich
          </div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 800, margin: "0 0 0.2rem", color: "#f8fafc", letterSpacing: "-0.025em" }}>
            Voluntary Severance Planner
          </h1>
          <p style={{ fontSize: "0.8rem", color: "#475569", margin: 0 }}>
            Enter your figures below · Fünftelregelung tax modelling · German state pension threshold Oct 2027
          </p>
        </div>

        {/* Editable inputs */}
        <div style={{ background: "#0e1525", border: "1.5px solid #60a5fa40", borderRadius: 14, padding: "1.25rem 1.4rem", marginBottom: "1.5rem" }}>
          <div style={{ fontSize: "0.62rem", color: "#60a5fa", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.9rem", fontWeight: 700 }}>
            Your figures — edit to recalculate
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "0.9rem", marginBottom: "0.9rem" }}>
            <NumberField label="Monthly Base Salary" value={monthlySalary} onChange={setMonthlySalary} suffix="€/mo" hint="Gross AT-Gehalt from payslip" />
            <NumberField label="Years of Service" value={yearsService} onChange={setYearsService} suffix="years" hint="Total group service used in severance formula" />
            <NumberField label="Holiday Pay" value={holidayPct} onChange={setHolidayPct} suffix="% of 1mo" hint="e.g. 79 = 79% of one month" />
            <NumberField label="Annual Bonus" value={annualBonus} onChange={setAnnualBonus} suffix="€/yr" />
            <NumberField label="Car Benefit" value={carBenefit} onChange={setCarBenefit} suffix="€/yr" hint="GWV private use + km value" />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "0.9rem" }}>
            <NumberField label="Employer + Employee Pension Contribution" value={pensionMonthly} onChange={setPensionMonthly} suffix="€/mo" hint="BAV — for reference only, not included in severance calc" />
          </div>
        </div>

        {/* Package summary strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "0.6rem", marginBottom: "1.75rem" }}>
          {[
            { l: "Base Salary", v: fmt(derived.annualBase), s: "p.a." },
            { l: "Xmas + Holiday", v: fmt(derived.xmasPay + derived.holidayPay), s: "p.a." },
            { l: "Bonus", v: fmt(annualBonus), s: "p.a." },
            { l: "Car + Pension", v: fmt(carBenefit + pensionMonthly * 12), s: "p.a." },
          ].map(item => (
            <div key={item.l} style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 10, padding: "0.8rem 0.9rem" }}>
              <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 3 }}>{item.l}</div>
              <div style={{ fontSize: "1.05rem", fontWeight: 700, color: "#f1f5f9" }}>{item.v}</div>
              <div style={{ fontSize: "0.6rem", color: "#334155" }}>{item.s}</div>
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem" }}>
          {[["scenarios","Scenarios"],["tax","Tax Analysis"],["pension","Pension Timing"]].map(([id, label]) => (
            <button key={id} onClick={() => setView(id)} style={{
              padding: "0.4rem 1rem", borderRadius: 6,
              border: `1.5px solid ${view === id ? "#60a5fa" : "#1a2235"}`,
              background: view === id ? "#60a5fa18" : "#0e1525",
              color: view === id ? "#60a5fa" : "#64748b",
              fontSize: "0.78rem", fontWeight: 600, cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>

        {/* ── SCENARIOS VIEW ── */}
        {view === "scenarios" && (<>

          <div style={{ marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.5rem" }}>
              Base calculation includes
            </div>
            <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
              {SCENARIO_CONFIGS.map(s => (
                <button key={s.id} onClick={() => setActiveConfig(s.id)} style={{
                  padding: "0.4rem 0.9rem", borderRadius: 6,
                  border: `1.5px solid ${activeConfig === s.id ? s.color : "#1a2235"}`,
                  background: activeConfig === s.id ? s.color + "18" : "#0e1525",
                  color: activeConfig === s.id ? s.color : "#64748b",
                  fontSize: "0.75rem", fontWeight: 600, cursor: "pointer",
                }}>{s.label}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.5rem" }}>
              Multiplier (× months per year of service)
            </div>
            <div style={{ display: "flex", gap: "0.5rem" }}>
              {MULTIPLIERS.map(m => (
                <button key={m} onClick={() => setActiveMultiplier(m)} style={{
                  padding: "0.4rem 0.85rem", borderRadius: 6, flex: 1,
                  border: `1.5px solid ${activeMultiplier === m ? cfg.color : "#1a2235"}`,
                  background: activeMultiplier === m ? cfg.color + "18" : "#0e1525",
                  color: activeMultiplier === m ? cfg.color : "#64748b",
                  fontSize: "0.85rem", fontWeight: 700, cursor: "pointer",
                }}>{m}×</button>
              ))}
            </div>
            <div style={{ marginTop: "0.5rem", fontSize: "0.72rem", color: "#475569" }}>
              <span style={{ color: cfg.color, fontWeight: 600 }}>{mlabel.tag}</span> — {mlabel.desc}
            </div>
          </div>

          <div style={{
            background: "#0e1525", border: `1.5px solid ${cfg.color}50`,
            borderRadius: 14, padding: "1.4rem", marginBottom: "1rem",
          }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
              <div>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Gross Severance</div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: cfg.color, letterSpacing: "-0.03em" }}>{fmt(result.severanceGross)}</div>
                <div style={{ fontSize: "0.68rem", color: "#334155" }}>{activeMultiplier}× · {yearsService} yrs · {fmt(result.monthlyBase)}/mo base</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Net (Fünftelregelung)</div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: "#f1f5f9", letterSpacing: "-0.03em" }}>{fmt(result.netSeverance)}</div>
                <div style={{ fontSize: "0.68rem", color: "#334155" }}>Tax: {fmt(result.taxFuenftel)} · saves {fmt(result.taxSaving)} vs marginal</div>
              </div>
              <div>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>Garden Leave</div>
                <div style={{ fontSize: "2.1rem", fontWeight: 800, color: cfg.gardenLeave ? "#a78bfa" : "#1e293b", letterSpacing: "-0.03em" }}>
                  {cfg.gardenLeave ? fmt(result.noticePay) : "—"}
                </div>
                <div style={{ fontSize: "0.68rem", color: "#334155" }}>{cfg.gardenLeave ? "6 months full pay" : "Not included"}</div>
              </div>
            </div>
            <div style={{
              background: "#080c18", borderRadius: 8, padding: "0.9rem 1rem",
              display: "flex", justifyContent: "space-between", alignItems: "center",
            }}>
              <div>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Total Package</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: "#f8fafc" }}>{fmt(result.totalGross)}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em" }}>Equiv. Years of Salary</div>
                <div style={{ fontSize: "1.5rem", fontWeight: 800, color: cfg.color }}>
                  {derived.annualBase > 0 ? (result.totalGross / derived.annualBase).toFixed(1) : "0.0"}×
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 14, padding: "1.4rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.1rem" }}>
              All multipliers — {cfg.label} — gross total
            </div>
            {allResults.map((r) => {
              const pct = maxGross > 0 ? (r.totalGross / maxGross) * 100 : 0;
              const isActive = r.multiplier === activeMultiplier;
              return (
                <div key={r.multiplier} style={{ marginBottom: "0.75rem", cursor: "pointer" }}
                  onClick={() => setActiveMultiplier(r.multiplier)}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: "0.75rem", fontWeight: 700, color: isActive ? cfg.color : "#64748b" }}>
                      {r.multiplier}× <span style={{ fontWeight: 400, fontSize: "0.68rem", color: "#334155" }}>— {MULTIPLIER_LABELS[r.multiplier].tag}</span>
                    </span>
                    <span style={{ fontSize: "0.75rem", color: isActive ? "#f1f5f9" : "#475569", fontWeight: isActive ? 700 : 400 }}>
                      {fmt(r.totalGross)} <span style={{ fontSize: "0.65rem", color: "#334155" }}>net {fmt(r.netSeverance)}</span>
                    </span>
                  </div>
                  <div style={{ background: "#1a2235", borderRadius: 4, height: 7, overflow: "hidden" }}>
                    <div style={{
                      width: `${pct}%`, height: "100%",
                      background: isActive ? cfg.color : cfg.color + "40",
                      borderRadius: 4, transition: "all 0.25s",
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {/* ── TAX VIEW ── */}
        {view === "tax" && (<>
          <div style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 14, padding: "1.4rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
              Fünftelregelung vs marginal rate — by multiplier (bonus + garden leave config)
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #1a2235" }}>
                    {["Multiplier","Gross Severance","Tax (Marginal ~42%)","Tax (Fünftelregelung)","Tax Saving","Net Received"].map(h => (
                      <th key={h} style={{ padding: "0.4rem 0.6rem", textAlign: "right", color: "#475569", fontWeight: 600, fontSize: "0.65rem", textTransform: "uppercase", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MULTIPLIERS.map(m => {
                    const r = buildScenario(m, true, false, true);
                    const isActive = m === activeMultiplier;
                    return (
                      <tr key={m}
                        onClick={() => { setActiveMultiplier(m); setView("scenarios"); }}
                        style={{
                          borderBottom: "1px solid #111827", cursor: "pointer",
                          background: isActive ? "#60a5fa08" : "transparent",
                        }}>
                        <td style={{ padding: "0.65rem 0.6rem", fontWeight: 700, color: isActive ? "#60a5fa" : "#94a3b8" }}>{m}×</td>
                        <td style={{ padding: "0.65rem 0.6rem", textAlign: "right", color: "#f1f5f9" }}>{fmt(r.severanceGross)}</td>
                        <td style={{ padding: "0.65rem 0.6rem", textAlign: "right", color: "#f87171" }}>{fmt(r.taxMarginal)}</td>
                        <td style={{ padding: "0.65rem 0.6rem", textAlign: "right", color: "#fb923c" }}>{fmt(r.taxFuenftel)}</td>
                        <td style={{ padding: "0.65rem 0.6rem", textAlign: "right", color: "#34d399", fontWeight: 700 }}>+{fmt(r.taxSaving)}</td>
                        <td style={{ padding: "0.65rem 0.6rem", textAlign: "right", color: "#f1f5f9", fontWeight: 700 }}>{fmt(r.netSeverance)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ background: "#0e1525", border: "1.5px solid #f59e0b30", borderRadius: 14, padding: "1.25rem 1.4rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.5rem" }}>How Fünftelregelung works</div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.7 }}>
              Germany taxes severance as if you received <strong style={{ color: "#f1f5f9" }}>one-fifth of it per year for 5 years</strong>, calculated within a single tax year. This avoids pushing the entire lump sum into the top 42-45% bracket. At your income level the saving is typically <strong style={{ color: "#34d399" }}>8–12 percentage points</strong> of effective rate on the severance amount.
            </div>
            <div style={{ marginTop: "0.75rem", padding: "0.75rem", background: "#080c18", borderRadius: 8, fontSize: "0.72rem", color: "#64748b", lineHeight: 1.6 }}>
              ⚠️ To qualify: the payment must be a genuine one-off compensation for job loss, paid in a single year. Spreading payments across years to "achieve" the Fünftelregelung artificially is <strong style={{ color: "#f87171" }}>not permitted</strong>. Use a <strong style={{ color: "#f1f5f9" }}>Steuerberater</strong> to structure correctly.
            </div>
          </div>

          <div style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 14, padding: "1.4rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1rem" }}>
              Tax saved via Fünftelregelung vs multiplier
            </div>
            {MULTIPLIERS.map(m => {
              const r = buildScenario(m, true, false, true);
              const maxSaving = buildScenario(2.5, true, false, true).taxSaving;
              const pct = maxSaving > 0 ? (r.taxSaving / maxSaving) * 100 : 0;
              return (
                <div key={m} style={{ marginBottom: "0.75rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: "0.75rem", color: "#94a3b8", fontWeight: 600 }}>{m}× multiplier</span>
                    <span style={{ fontSize: "0.75rem", color: "#34d399", fontWeight: 700 }}>+{fmt(r.taxSaving)} saved</span>
                  </div>
                  <div style={{ background: "#1a2235", borderRadius: 4, height: 7 }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#34d399", borderRadius: 4 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>)}

        {/* ── PENSION VIEW ── */}
        {view === "pension" && (<>
          <div style={{ background: "#0e1525", border: "1.5px solid #f59e0b40", borderRadius: 14, padding: "1.4rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "flex-start" }}>
              <div style={{ fontSize: "2rem" }}>🇩🇪</div>
              <div>
                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: "#fbbf24", marginBottom: "0.4rem" }}>
                  German State Pension — 5-Year Wartezeit Threshold
                </div>
                <div style={{ fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.7 }}>
                  You started Munich employment <strong style={{ color: "#f1f5f9" }}>October 2022</strong>. You need 5 full years of RV contributions, reached at <strong style={{ color: "#fbbf24" }}>October 2027</strong>.
                  <br /><br />
                  Garden leave and Freistellung (paid release from duties) both count as active employment for Rentenversicherung purposes as long as the employment contract is still live and contributions continue.
                  <br /><br />
                  Estimated Rente at retirement based on ~5 years contributions at this salary level: <strong style={{ color: "#34d399" }}>~€250–350/month</strong>. Over a 20-year retirement that is <strong style={{ color: "#34d399" }}>€60,000–€84,000</strong> in today's money.
                </div>
              </div>
            </div>
          </div>

          <div style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 14, padding: "1.4rem", marginBottom: "1rem" }}>
            <div style={{ fontSize: "0.6rem", color: "#475569", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "1.25rem" }}>
              Departure timing vs pension eligibility
            </div>
            {[
              { date: "Now (May 2026)", months: 0, pension: false, note: "If you left today — no German state pension. RV contributions forfeit." },
              { date: "Oct 2026", months: 5, pension: false, note: "4 years service. Still 1 year short of Wartezeit. Don't leave here." },
              { date: "Apr 2027", months: 11, pension: false, note: "Getting close but not there. Garden leave should bridge this gap." },
              { date: "Oct 2027 ✓", months: 17, pension: true, note: "5 years complete. Full Wartezeit met. Optimal departure trigger point." },
              { date: "Apr 2028", months: 23, pension: true, note: "Extra half year. Marginal additional pension accrual only." },
            ].map((row, i) => (
              <div key={i} style={{
                display: "flex", gap: "1rem", alignItems: "flex-start",
                padding: "0.85rem 1rem", marginBottom: "0.5rem",
                background: row.pension ? "#065f4618" : "#080c18",
                border: `1px solid ${row.pension ? "#34d39930" : "#1a2235"}`,
                borderRadius: 10,
              }}>
                <div style={{ minWidth: 110 }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: row.pension ? "#34d399" : "#64748b" }}>{row.date}</div>
                  <div style={{ fontSize: "0.65rem", color: "#334155" }}>+{row.months}mo from now</div>
                </div>
                <div style={{
                  minWidth: 80, padding: "0.2rem 0.6rem", borderRadius: 4, fontSize: "0.62rem", fontWeight: 700,
                  textTransform: "uppercase", letterSpacing: "0.1em", textAlign: "center", alignSelf: "flex-start",
                  background: row.pension ? "#34d39920" : "#f8717120",
                  color: row.pension ? "#34d399" : "#f87171",
                }}>{row.pension ? "✓ Eligible" : "✗ Not eligible"}</div>
                <div style={{ fontSize: "0.75rem", color: "#64748b", lineHeight: 1.5 }}>{row.note}</div>
              </div>
            ))}
          </div>

          <div style={{ background: "#0e1525", border: "1px solid #1a2235", borderRadius: 14, padding: "1.4rem" }}>
            <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#a78bfa", marginBottom: "0.6rem" }}>
              How to frame this in negotiation
            </div>
            <div style={{ fontSize: "0.75rem", color: "#94a3b8", lineHeight: 1.7 }}>
              You are asking BMW to keep your contract live until October 2027 — approximately <strong style={{ color: "#f1f5f9" }}>17 months of garden leave</strong> from now. The cost to BMW is roughly <strong style={{ color: "#f1f5f9" }}>17 × {fmt(monthlySalary)} = {fmt(17 * monthlySalary)}</strong> in base salary. In return you sign the settlement agreement and waive claims. Frame it as mutual convenience: you stop working immediately, they keep the contract live on paper until the pension threshold, then make the severance payment at that point.
              <br /><br />
              The severance payment itself should still be paid as a lump sum in a single tax year to preserve Fünftelregelung treatment. The garden leave period and the payment date can be negotiated separately.
            </div>
          </div>
        </>)}

        <div style={{ textAlign: "center", marginTop: "1.5rem", fontSize: "0.6rem", color: "#1e293b" }}>
          Estimates only · Tax model uses 2025 German income tax tables · Seek Fachanwalt für Arbeitsrecht and Steuerberater advice before signing
        </div>
      </div>
    </div>
  );
}
