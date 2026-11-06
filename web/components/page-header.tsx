export function PageHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 pb-7">
      <div className="min-w-0">
        <h1 className="text-[30px] leading-[1.05] font-extrabold tracking-tight md:text-[38px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  );
}
