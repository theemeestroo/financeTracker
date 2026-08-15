import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Pencil,
  PiggyBank,
  Plus,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { addGlobalEvent, deleteGlobalEvent } from "./event-actions";
import { addGlobalSavingsRule, deleteGlobalSavingsRule } from "./savings-rule-actions";
import { dismissStaleEventOverride } from "../severance-scenarios/event-actions";
import { dismissStaleSavingsRuleOverride } from "../severance-scenarios/savings-rule-actions";
import { EventForm } from "../severance-scenarios/event-form";
import { SavingsRuleForm } from "../severance-scenarios/savings-rule-form";
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
  type SeveranceGlobalEventOverride,
  type SeveranceGlobalSavingsRuleOverride,
  type SeveranceScenario,
  type SeveranceScenarioEvent,
  type SeveranceScenarioSavingsRule,
} from "@/lib/types";

export default async function GlobalRulesPage() {
  const supabase = await createClient();

  const [
    { data: eventRows },
    { data: savingsRuleRows },
    { data: memberRows },
    { data: scenarioRows },
    { data: staleEventOverrideRows },
    { data: staleSavingsRuleOverrideRows },
  ] = await Promise.all([
    supabase.from("severance_scenario_events").select("*").eq("scope", "global").order("date"),
    supabase
      .from("severance_scenario_savings_rules")
      .select("*")
      .eq("scope", "global")
      .order("created_at"),
    supabase.from("household_members").select("id, name, created_at").order("name"),
    supabase.from("severance_scenarios").select("id, name"),
    supabase.from("severance_global_event_overrides").select("*").not("stale_since", "is", null),
    supabase.from("severance_global_savings_rule_overrides").select("*").not("stale_since", "is", null),
  ]);

  const events = (eventRows ?? []) as SeveranceScenarioEvent[];
  const savingsRules = (savingsRuleRows ?? []) as SeveranceScenarioSavingsRule[];
  const members = (memberRows ?? []) as HouseholdMember[];
  const memberById = new Map(members.map((m) => [m.id, m.name]));
  const scenarioById = new Map(((scenarioRows ?? []) as Pick<SeveranceScenario, "id" | "name">[]).map((s) => [s.id, s.name]));
  const staleEventOverrides = (staleEventOverrideRows ?? []) as SeveranceGlobalEventOverride[];
  const staleSavingsRuleOverrides = (staleSavingsRuleOverrideRows ?? []) as SeveranceGlobalSavingsRuleOverride[];
  const hasStaleOverrides = staleEventOverrides.length > 0 || staleSavingsRuleOverrides.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Global Events & Rules</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Events and savings rules marked &quot;All scenarios&quot; live here, independent of any one
          scenario — edit once, and it propagates everywhere it applies.
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
            <EventForm action={addGlobalEvent} />
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
        <CardContent className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <CalendarClock className="size-4 shrink-0" />
          Open any scenario&apos;s Timeline or Savings &amp; Investment tab to see how these merge with its
          own scenario-specific items, or to override one just for that scenario.
        </CardContent>
      </Card>
    </div>
  );
}
