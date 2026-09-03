export function PageHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header>
      <h1 className="font-display text-[30px] leading-tight text-ink-900 sm:text-[34px]">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-500">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
