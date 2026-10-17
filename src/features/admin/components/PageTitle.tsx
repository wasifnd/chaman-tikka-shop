/** Heading plus a one-line explanation, at the top of every admin screen. */
export function PageTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-5 flex flex-col gap-1">
      <h2 className="text-xl font-semibold">{title}</h2>
      {hint ? <p className="text-sm text-stone-400">{hint}</p> : null}
    </div>
  );
}
