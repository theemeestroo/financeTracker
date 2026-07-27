import { BookOpen, LifeBuoy, ShieldAlert, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsIndicator, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import {
  HELP_CATEGORIES,
  helpArticlesByCategory,
  type HelpArticle,
  type HelpBlock,
  type HelpCategory,
} from "@/components/help/help-content";

const CATEGORY_ICONS: Record<HelpCategory, LucideIcon> = {
  "Getting started": BookOpen,
  "Everyday finances": TrendingDown,
  "Severance & redundancy scenarios": LifeBuoy,
  "Concepts & disclaimers": ShieldAlert,
};

function HelpBlockView({ block }: { block: HelpBlock }) {
  if (block.type === "p") {
    return <p className="text-sm text-muted-foreground">{block.text}</p>;
  }
  if (block.type === "list") {
    return (
      <ul className="flex flex-col gap-1.5 pl-5 text-sm text-muted-foreground">
        {block.items.map((item, i) => (
          <li key={i} className="list-disc">
            {item}
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div
      className="rounded-lg border px-3 py-2 text-sm"
      style={{ borderColor: "var(--status-warning)", color: "var(--status-warning)" }}
    >
      {block.text}
    </div>
  );
}

function HelpArticleCard({ article }: { article: HelpArticle }) {
  return (
    <Card id={article.slug}>
      <CardHeader>
        <CardTitle className="text-lg">{article.title}</CardTitle>
        <CardDescription>{article.summary}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {article.blocks.map((block, i) => (
          <HelpBlockView key={i} block={block} />
        ))}
      </CardContent>
    </Card>
  );
}

export default function HelpPage() {
  const grouped = helpArticlesByCategory();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">Help Centre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          How to use Runaway, and what the German tax/benefit figures actually mean.
        </p>
      </div>

      <Tabs defaultValue={HELP_CATEGORIES[0]}>
        <div className="overflow-x-auto">
          <TabsList>
            <TabsIndicator />
            {HELP_CATEGORIES.map((category) => {
              const Icon = CATEGORY_ICONS[category];
              return (
                <TabsTab key={category} value={category}>
                  <Icon className="size-4" />
                  {category}
                </TabsTab>
              );
            })}
          </TabsList>
        </div>

        {grouped.map(({ category, articles }) => (
          <TabsPanel key={category} value={category}>
            {articles.map((article) => (
              <HelpArticleCard key={article.slug} article={article} />
            ))}
          </TabsPanel>
        ))}
      </Tabs>
    </div>
  );
}
