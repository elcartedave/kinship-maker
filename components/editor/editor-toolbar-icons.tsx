import type { MouseEventHandler, ReactNode } from "react";

export function IconToolbarButton({
  title,
  children,
  onClick,
  disabled,
  pressed,
  className = "",
}: {
  title: string;
  children: ReactNode;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  disabled?: boolean;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={`tool-chip inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition disabled:opacity-45 ${pressed ? "!border-accent-strong bg-[rgba(255,237,212,0.65)]" : ""} ${className}`}
    >
      <span className="pointer-events-none text-ink [&_svg]:block [&_svg]:h-[18px] [&_svg]:w-[18px]">
        {children}
      </span>
    </button>
  );
}
