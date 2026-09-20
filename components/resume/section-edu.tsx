interface SectionEduProps {
  /** Section heading text. */
  header: string;
  /** Education rows, three columns per row. */
  edu: string[][];
}

export function SectionEdu({ header, edu }: SectionEduProps) {
  return (
    <section className="rounded-2xl border bg-fd-card p-4 shadow-lg">
      <h2 className="text-sm font-semibold text-fd-foreground">{header}</h2>
      <div className="my-2 h-px bg-fd-border" />
      <ul className="mt-2 space-y-0.5 text-xs">
        {edu.map((row) => (
          <li key={row.join("|")} className="grid gap-1 md:grid-cols-3">
            <div className="text-fd-muted-foreground">{row[0]}</div>
            <div className="text-fd-muted-foreground">{row[1]}</div>
            <div className="text-fd-muted-foreground">{row[2]}</div>
          </li>
        ))}
      </ul>
    </section>
  );
}
