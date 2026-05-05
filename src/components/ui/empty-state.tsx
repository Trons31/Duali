export function EmptyState({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="shell-card flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-brand-100 text-2xl">◎</div>
      <h3 className="text-lg font-bold text-ink-950">{title}</h3>
      <p className="mt-2 max-w-md text-sm text-ink-500">{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
