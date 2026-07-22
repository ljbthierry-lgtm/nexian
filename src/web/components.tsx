/** Small shared pieces used across pages. */
import type { ReactNode } from "react";
import type { Availability, Consents, Stage } from "./api";

export function Banner({
  kind,
  children,
}: {
  kind: "error" | "ok" | "info" | "warn";
  children: ReactNode;
}) {
  return (
    <div className={`banner ${kind}`} role={kind === "error" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function Stat({
  value,
  label,
  tone,
}: {
  value: number | string;
  label: string;
  tone?: string;
}) {
  return (
    <div className="stat">
      <div className="v" style={tone ? { color: `var(--${tone})` } : undefined}>
        {value}
      </div>
      <div className="l">{label}</div>
    </div>
  );
}

/** Multi-select chip group — the picker used for skills, industries and languages. */
export function ChipPicker({
  options,
  selected,
  onChange,
  allowCustom,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
}) {
  const toggle = (label: string) =>
    onChange(selected.includes(label) ? selected.filter((s) => s !== label) : [...selected, label]);

  // Anything the freelancer typed that is not in the standard list still shows.
  const extras = selected.filter((s) => !options.includes(s));

  return (
    <div className="chips">
      {[...options, ...extras].map((label) => (
        <button
          key={label}
          type="button"
          className="chip"
          aria-pressed={selected.includes(label)}
          onClick={() => toggle(label)}
        >
          {label}
        </button>
      ))}
      {allowCustom && (
        <button
          type="button"
          className="chip"
          onClick={() => {
            const value = window.prompt("Add your own")?.trim();
            if (value && !selected.includes(value)) onChange([...selected, value]);
          }}
        >
          + add your own
        </button>
      )}
    </div>
  );
}

export const STAGE_LABEL: Record<Stage, string> = {
  prospect: "Prospect",
  contacted: "Contacted",
  registered: "Registered",
  vetted: "Vetted",
  on_mission: "On mission",
  closed: "Closed",
};

export function StagePill({ stage }: { stage: Stage }) {
  const tone =
    stage === "registered" || stage === "vetted"
      ? "accent"
      : stage === "on_mission"
        ? "info"
        : stage === "contacted"
          ? "warn"
          : "neutral";
  return <span className={`pill ${tone}`}>{STAGE_LABEL[stage]}</span>;
}

/**
 * Consent is the most important thing on a contact row, so it always reads as a
 * plain sentence rather than a set of icons a reader has to decode.
 */
export function ConsentPill({
  consents,
  suppressed,
}: {
  consents?: Consents;
  suppressed?: boolean;
}) {
  if (suppressed) return <span className="pill bad">Do not contact</span>;
  if (!consents?.data_processing) return <span className="pill neutral">Opted out (default)</span>;
  const extras = [consents.mission_alerts ? "alerts" : null, consents.news ? "news" : null].filter(
    Boolean,
  );
  return (
    <span className="pill good">
      Opted in{extras.length ? ` · ${extras.join(" + ")}` : " · profile only"}
    </span>
  );
}

export function AvailabilityPill({
  availability,
  from,
}: {
  availability: Availability;
  from?: string | null;
}) {
  if (availability === "now") return <span className="pill good">Available now</span>;
  if (availability === "not_available") return <span className="pill neutral">Not available</span>;
  if (availability === "from_date")
    return <span className="pill warn">{from ? formatDate(from) : "From a date"}</span>;
  return <span className="pill neutral">Unknown</span>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function relativeDays(value: string | null | undefined): string {
  if (!value) return "never";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return value;
  const days = Math.floor((Date.now() - then) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 31) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="modal-back"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal">
        <div className="card-head">
          <h2>{title}</h2>
          <div className="spacer" />
          <button type="button" className="btn plain sm" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
