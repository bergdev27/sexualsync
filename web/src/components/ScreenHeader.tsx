/**
 * The one screen header. Three screen types, one component (DESIGN.md
 * "Header pattern"):
 *
 *  - Top-level tab screens (no `back`, no `done`): serif title, no back
 *    control.
 *  - Drill-down screens (`back`): a 44px circular chevron plus the parent's
 *    name ("‹ Space"), linking to the parent route (not history.back()).
 *  - Modal-style flows (`done`): a 44px "Done" pill at the top right, and no
 *    chevron.
 *
 * `compact` keeps the top-level serif headline but at the smaller display
 * size with tighter padding, for a screen whose content owns the height
 * (Sext's thread and composer).
 *
 * `variant="bar"` is the compact one-row form used by sheet routes (game
 * runners, kink detail, Shelf): back / title / done on one line, with the
 * header owning the notch inset (see .app-shell-main:has(> .sheet-header)).
 * Every variant renders the page title as the screen's one <h1>.
 */
import type { ReactNode } from "react";
import Link from "next/link";
import BrandWordmark from "./BrandWordmark";

export type HeaderBack = { href: string; label: string };
export type HeaderDone = { href: string; label?: string; ariaLabel?: string };

export function BackControl({ href, label }: HeaderBack) {
  return (
    <Link href={href} className="screen-back-link pressable" aria-label={`Back to ${label}`} data-testid="screen-back">
      <span className="screen-back-circle" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
          <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="screen-back-label" aria-hidden="true">{label}</span>
    </Link>
  );
}

export function DonePill({ href, label = "Done", ariaLabel }: HeaderDone) {
  return (
    <Link href={href} className="done-pill pressable" aria-label={ariaLabel} data-testid="screen-done">
      {label}
    </Link>
  );
}

export default function ScreenHeader({
  eyebrow,
  showBrand = true,
  title,
  titleHidden = false,
  subtitle,
  trailing,
  back,
  done,
  variant = "page",
  leading,
  barClassName = "sheet-header",
  compact = false,
}: {
  eyebrow?: ReactNode;
  showBrand?: boolean;
  title?: ReactNode;
  // Keep the <h1> for assistive tech but don't paint it.
  titleHidden?: boolean;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  back?: HeaderBack;
  done?: HeaderDone;
  variant?: "page" | "bar";
  // Bar variant only: a mark drawn before the title (e.g. the Shelf ribbon).
  leading?: ReactNode;
  // Bar variant only: the self-insetting header class (.sheet-header or
  // .shelf-header) that owns the Dynamic Island inset on sheet routes.
  barClassName?: string;
  // Page variant only: the smaller serif headline and tighter padding.
  compact?: boolean;
}) {
  const trailingNode = done ? <DonePill {...done} /> : trailing;

  if (variant === "bar") {
    return (
      <header className={`${barClassName} screen-header-bar${back ? " has-back" : ""}`}>
        <div className="screen-header-bar-start">
          {back ? <BackControl {...back} /> : leading}
        </div>
        {title && (
          <h1 className={`sheet-title screen-header-bar-title${titleHidden ? " sr-only" : ""}`}>
            {title}
          </h1>
        )}
        <div className="screen-header-bar-end">
          {trailingNode || <span className="sheet-header-spacer" aria-hidden="true" />}
        </div>
      </header>
    );
  }

  // No notch inset here — AppShell's .app-shell-main already insets for the
  // safe area. pt-6 is design spacing only; adding `safe-top` double-counts
  // the status bar and buries the title (see the sheet-header note in globals).
  return (
    <header className={`screen-header px-5 ${compact ? "screen-header-compact pb-2 pt-4" : `pb-4 ${back ? "pt-3" : "pt-6"}`}`}>
      {back && (
        <div className="screen-header-back-row">
          <BackControl {...back} />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showBrand && <BrandWordmark className="mb-4" />}
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          {title && (
            <h1 className={titleHidden ? "sr-only" : `font-display italic ${compact ? "text-display-md" : "text-display-lg"} leading-tight text-ink`}>
              {title}
            </h1>
          )}
          {subtitle && (
            <p className="mt-1 text-sm text-ink-2">{subtitle}</p>
          )}
        </div>
        {trailingNode && <div className="screen-header-trailing">{trailingNode}</div>}
      </div>
    </header>
  );
}
