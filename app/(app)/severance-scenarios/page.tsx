import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SeveranceScenariosPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Severance Scenarios</h1>
        <p className="text-sm text-muted-foreground">
          The severance package calculator and runway projection land here in Phase 4.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Not built yet
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          See DESIGN-financial-runway-app.md §6–§7 for what&apos;s planned here.
        </CardContent>
      </Card>
    </div>
  );
}
