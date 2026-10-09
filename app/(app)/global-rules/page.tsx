import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  CalendarRange,
  Home,
  Landmark,
  Pencil,
  PiggyBank,
  Plus,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addGlobalEvent, deleteGlobalEvent } from "./event-actions";
import { addGlobalSavingsRule, deleteGlobalSavingsRule } from "./savings-rule-actions";
import { addGlobalPropertyEnd, deleteGlobalPropertyEnd } from "./property-end-actions";
import { addGlobalPhase, deleteGlobalPhase } from "./phase-actions";
import { updateGlobalPensionDepositDefault } from "./pension-deposit-actions";
import { PensionDepositForm } from "./pension-deposit-form";
import { SEVERANCE_PENSION_DEPOSIT_DEFAULT } from "@/lib/severance";
import { dismissStaleEventOverride } from "../severance-scenarios/event-actions";
import { dismissStaleSavingsRuleOverride } from "../severance-scenarios/savings-rule-actions";
import { dismissStalePropertyEndOverride } from "../severance-scenarios/property-end-actions";
import { dismissStalePhaseOverride } from "../severance-scenarios/phase-actions";
import { EventForm } from "../severance-scenarios/event-form";
import { SavingsRuleForm } from "../severance-scenarios/savings-rule-form";
import { PropertyEndForm } from "../severance-scenarios/property-end-form";
import { PhaseForm } from "../severance-scenarios/phase-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DeleteButton } from "@/components/delete-button";
import { AddDisclosure } from "@/components/add-disclosure";
import { TitleIcon } from "@/components/title-icon";
import { formatEUR } from "@/lib/finance/frequency";
import { formatDateDisplay } from "@/lib/finance/date-utils";
import {
  ACCRUAL_FREQUENCIES,
  SCENARIO_EVENT_TYPES,
  type HouseholdMember,
  type LivingProfile,
  type Property,
  type SeveranceGlobalEventOverride,
  type SeveranceGlobalPhaseOverride,
  type SeveranceGlobalPropertyEndOverride,
  type SeveranceGlobalSavingsRuleOverride,
  type SeveranceGlobalSettings,
  type SeveranceScenario,
  type SeveranceScenarioEvent,
  type SeveranceScenarioPhase,
  type SeveranceScenarioPropertyEnd,
  type SeveranceScenarioSavingsRule,
} from "@/lib/types";

export default async function GlobalRulesPage() {
  const supabase = await createClient();

  const [
    { data: eventRows },
    { data: savingsRuleRows },
    { data: propertyEndRows },
    { data: phaseRows },
    { data: memberRows },
    { data: scenarioRows },
    { data: properties },
    { data: livingProfiles },
    { data: staleEventOverrideRows },
    { data: staleSavingsRuleOverrideRows },
    { data: stalePropertyEndOverrideRows },
    { data: stalePhaseOverrideRows },
    { data: globalSettingsRow },
  ] = await Promise.all([
    supabase.from("severance_scenario_events").select("*").eq("scope", "global").order("date"),
    supabase
      .from("severance_scenario_savings_rules")
      .select("*")
      .eq("scope", "global")
      .order("created_at"),
    supabase
      .from("severance_scenario_property_ends")
      .select("*")
      .eq("scope", "global")
      .order("end_date"),
    supabase
      .from("severance_scenario_phases")
      .select("id, profile_id, start_date, label")
      .eq("scope", "global")
      .order("start_date"),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase.from("severance_scenarios").select("id, name"),
    supabase.from("properties").select("id, profile_id, name, address, notes, end_date").order("name"),
    supabase.from("living_profiles").select("id, name, description, is_baseline").order("name"),
    supabase.from("severance_global_event_overrides").select("*").not("stale_since", "is", null),
    supabase.from("severance_global_savings_rule_overrides").select("*").not("stale_since", "is", null),
    supabase.from("severance_global_property_end_overrides").select("*").not("stale_since", "is", null),
    supabase.from("severance_global_phase_overrides").select("*").not("stale_since", "is", null),
    supabase.from("severance_global_settings").select("pension_deposit_default").maybeSingle(),
  ]);

  const events = (eventRows ?? []) as SeveranceScenarioEvent[];
  const savingsRules = (savingsRuleRows ?? []) as SeveranceScenarioSavingsRule[];
  const propertyEnds = (propertyEndRows ?? []) as SeveranceScenarioPropertyEnd[];
  const phases = (phaseRows ?? []) as SeveranceScenarioPhase[];
  const members = (memberRows ?? []) as HouseholdMember[];
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const scenarioById = new Map(((scenarioRows ?? []) as Pick<SeveranceScenario, "id" | "name">[]).map((s) => [s.id, s.name]));
  const propertyRows = (properties ?? []) as Property[];
  const propertyById = new Map(propertyRows.map((p) => [p.id, p.name]));
  const profileRows = (livingProfiles ?? []) as LivingProfile[];
  const profileById = new Map(profileRows.map((p) => [p.id, p.name]));
  const staleEventOverrides = (staleEventOverrideRows ?? []) as SeveranceGlobalEventOverride[];
  const staleSavingsRuleOverrides = (staleSavingsRuleOverrideRows ?? []) as SeveranceGlobalSavingsRuleOverride[];
  const stalePropertyEndOverrides = (stalePropertyEndOverrideRows ?? []) as SeveranceGlobalPropertyEndOverride[];
  const stalePhaseOverrides = (stalePhaseOverrideRows ?? []) as SeveranceGlobalPhaseOverride[];
  const hasStaleOverrides =
    staleEventOverrides.length > 0 ||
    staleSavingsRuleOverrides.length > 0 ||
    stalePropertyEndOverrides.length > 0 ||
    stalePhaseOverrides.length > 0;
  const pensionDepositDefault =
    (globalSettingsRow as Pick<SeveranceGlobalSettings, "pension_deposit_default"> | null)
      ?.pension_deposit_default ?? SEVERANCE_PENSION_DEPOSIT_DEFAULT;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Global Events & Rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Events, property changes, and savings rules marked &quot;All scenarios&quot; live here,
          independent of any one scenario — edit once, and it propagates everywhere it applies.
        </p>
      </div>

      {hasStaleOverrides && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              <TitleIcon icon={AlertTriangle} accent="var(--status-warning)" />
              Needs review
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              These scenario overrides belonged to a global item that&apos;s since been deleted — nothing
              else references them anymore, so you can dismiss each once you&apos;ve seen it.
            </p>
            {staleEventOverrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{o.orphaned_item_name ?? "Deleted event"}</span>{" "}
                  <span className="text-muted-foreground">
                    — overridden in {scenarioById.get(o.scenario_id) ?? "a deleted scenario"}
                    {o.value != null ? ` at ${formatEUR(o.value)}` : ""}
                  </span>
                </span>
                <form action={dismissStaleEventOverride.bind(null, o.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Dismiss
                  </Button>
                </form>
              </div>
            ))}
            {staleSavingsRuleOverrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{o.orphaned_item_name ?? "Deleted savings rule"}</span>{" "}
                  <span className="text-muted-foreground">
                    — overridden in {scenarioById.get(o.scenario_id) ?? "a deleted scenario"}
                    {o.value != null ? ` at ${formatEUR(o.value)}` : ""}
                  </span>
                </span>
                <form action={dismissStaleSavingsRuleOverride.bind(null, o.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Dismiss
                  </Button>
                </form>
              </div>
            ))}
            {stalePropertyEndOverrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{o.orphaned_item_name ?? "Deleted property change"}</span>{" "}
                  <span className="text-muted-foreground">
                    — overridden in {scenarioById.get(o.scenario_id) ?? "a deleted scenario"}
                    {o.end_date != null ? ` at ${formatDateDisplay(o.end_date)}` : ""}
                  </span>
                </span>
                <form action={dismissStalePropertyEndOverride.bind(null, o.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Dismiss
                  </Button>
                </form>
              </div>
            ))}
            {stalePhaseOverrides.map((o) => (
              <div
                key={o.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{o.orphaned_item_name ?? "Deleted cost phase"}</span>{" "}
                  <span className="text-muted-foreground">
                    — overridden in {scenarioById.get(o.scenario_id) ?? "a deleted scenario"}
                    {o.profile_id != null ? ` → ${profileById.get(o.profile_id) ?? "a deleted profile"}` : ""}
                  </span>
                </span>
                <form action={dismissStalePhaseOverride.bind(null, o.id)}>
                  <Button type="submit" variant="outline" size="sm">
                    Dismiss
                  </Button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TitleIcon icon={Sparkles} accent="var(--series-4)" />
            Global events
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {events.length > 0 && (
            <Table aria-label="Global events">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col">Type</TableHead>
                  <TableHead scope="col">Date</TableHead>
                  <TableHead scope="col" className="text-right">
                    Amount
                  </TableHead>
                  <TableHead scope="col" className="w-20 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">{event.name}</TableCell>
                    <TableCell>
                      {SCENARIO_EVENT_TYPES.find((t) => t.value === event.event_type)?.label ??
                        event.event_type}
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDateDisplay(event.date)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {event.event_type === "recurring_income_start"
                        ? `${formatEUR(event.recurring_gross_amount ?? 0)}/${event.recurring_frequency}`
                        : formatEUR(event.amount ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={<Link href={`/global-rules/events/${event.id}/edit`} />}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteGlobalEvent.bind(null, event.id)}
                          confirmMessage={`Delete "${event.name}"? Any scenario overrides tied to it are kept for review, not deleted.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AddDisclosure label="Add global event" icon={Plus}>
            <EventForm action={addGlobalEvent} members={members} />
          </AddDisclosure>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TitleIcon icon={Home} accent="var(--series-2)" />
            Global property changes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {propertyEnds.length > 0 && (
            <Table aria-label="Global property changes">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Property</TableHead>
                  <TableHead scope="col">Ends from</TableHead>
                  <TableHead scope="col" className="w-20 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {propertyEnds.map((pe) => (
                  <TableRow key={pe.id}>
                    <TableCell className="font-medium">{propertyById.get(pe.property_id) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatDateDisplay(pe.end_date)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={<Link href={`/global-rules/property-ends/${pe.id}/edit`} />}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteGlobalPropertyEnd.bind(null, pe.id)}
                          confirmMessage={`Delete this global end date for "${propertyById.get(pe.property_id) ?? "this property"}"? Any scenario overrides tied to it are kept for review, not deleted.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {propertyRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No properties yet —{" "}
              <Link href="/properties" className="underline underline-offset-2">
                add one
              </Link>{" "}
              to end it globally.
            </p>
          ) : (
            <AddDisclosure label="Add global property change" icon={Plus}>
              <PropertyEndForm action={addGlobalPropertyEnd} properties={propertyRows} />
            </AddDisclosure>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TitleIcon icon={CalendarRange} accent="var(--series-1)" />
            Global cost phases
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Switches every scenario&apos;s Living Profile timeline to a given profile from a date, by
            default. A scenario can override which profile applies here — the trigger date always stays
            this one.
          </p>
          {phases.length > 0 && (
            <Table aria-label="Global cost phases">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Profile</TableHead>
                  <TableHead scope="col">From</TableHead>
                  <TableHead scope="col">Label</TableHead>
                  <TableHead scope="col" className="w-20 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {phases.map((phase) => (
                  <TableRow key={phase.id}>
                    <TableCell className="font-medium">{profileById.get(phase.profile_id) ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{formatDateDisplay(phase.start_date)}</TableCell>
                    <TableCell className="text-muted-foreground">{phase.label ?? "—"}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={<Link href={`/global-rules/phases/${phase.id}/edit`} />}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteGlobalPhase.bind(null, phase.id)}
                          confirmMessage={`Delete this global cost phase? Any scenario overrides tied to it are kept for review, not deleted.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AddDisclosure label="Add global cost phase" icon={Plus}>
            <PhaseForm action={addGlobalPhase} profiles={profileRows} />
          </AddDisclosure>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TitleIcon icon={PiggyBank} accent="var(--series-2)" />
            Global savings &amp; investment rules
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Resolves against whichever scenario it&apos;s viewed in — each scenario supplies its own
            severance figure for this person, so the same rule can produce a different pot size per
            scenario.
          </p>
          {savingsRules.length > 0 && (
            <Table aria-label="Global savings and investment rules">
              <TableHeader>
                <TableRow>
                  <TableHead scope="col">Person</TableHead>
                  <TableHead scope="col">Name</TableHead>
                  <TableHead scope="col" className="text-right">
                    Allocation
                  </TableHead>
                  <TableHead scope="col" className="text-right">
                    Return
                  </TableHead>
                  <TableHead scope="col">Accrued</TableHead>
                  <TableHead scope="col" className="w-20 text-right">
                    &nbsp;
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {savingsRules.map((rule) => (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">
                      {memberById.get(rule.household_member_id ?? "") ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{rule.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {rule.allocation_type === "percentage" ? `${rule.percentage}%` : formatEUR(rule.amount ?? 0)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{rule.annual_return_pct}%/yr</TableCell>
                    <TableCell className="text-muted-foreground">
                      {ACCRUAL_FREQUENCIES.find((f) => f.value === rule.accrual_frequency)?.label ??
                        rule.accrual_frequency}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit"
                          render={<Link href={`/global-rules/savings-rules/${rule.id}/edit`} />}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <DeleteButton
                          action={deleteGlobalSavingsRule.bind(null, rule.id)}
                          confirmMessage={`Delete "${rule.name}"? Any scenario overrides tied to it are kept for review, not deleted.`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <AddDisclosure label="Add global savings rule" icon={Plus}>
            <SavingsRuleForm action={addGlobalSavingsRule} packages={[]} householdMembers={members} fixedScope="global" />
          </AddDisclosure>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            <TitleIcon icon={Landmark} accent="var(--series-3)" />
            Pension deposit from severance
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Default amount diverted from each severance into a company pension instead of paid as cash —
            reduces the taxable severance base for the Fünftelregelung calculation. Applies to every
            severance package unless that package sets its own amount from its edit form.
          </p>
          <PensionDepositForm
            action={updateGlobalPensionDepositDefault}
            defaultValue={pensionDepositDefault}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          Open any scenario&apos;s Timeline or Savings &amp; Investment tab to see how these merge with its
          own scenario-specific items, or to override one just for that scenario.
        </CardContent>
      </Card>
    </div>
  );
}
