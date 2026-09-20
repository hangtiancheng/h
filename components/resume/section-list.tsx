import type { TitledItem } from "@/lib/resume/schema";

interface SectionListProps {
  /** Section heading text. Named `heading` because `title` is a global
   * HTML attribute and would trigger a native tooltip. */
  heading: string;
  /** List rows: plain strings or `{ title, content }` pairs. */
  items: (string | TitledItem)[];
}

export function SectionList({ heading, items }: SectionListProps) {
  return (
    <section className="rounded-2xl border bg-fd-card p-4 shadow-lg">
      <h2 className="text-sm font-semibold text-fd-foreground">{heading}</h2>
      <div className="my-2 h-px bg-fd-border" />
      <ul className="mt-2 ml-4 list-disc space-y-0.5 text-xs text-fd-muted-foreground">
        {/* Index keys: the list is static per locale and titles can repeat
            (e.g. two ByteDance internships). */}
        {items.map((item, index) => (
          <li key={index}>
            {typeof item === "string" ? (
              item
            ) : (
              <>
                <b className="font-semibold text-fd-foreground">{item.title}</b>
                : {item.content}
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
