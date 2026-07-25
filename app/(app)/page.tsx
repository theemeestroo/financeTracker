import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Monthly surplus/deficit and category breakdown land here in Phase 2.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Get started
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" render={<Link href="/commitments" />}>
            Add commitments
          </Button>
          <Button variant="outline" render={<Link href="/income" />}>
            Add income
          </Button>
          <Button variant="outline" render={<Link href="/household" />}>
            Manage household
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
