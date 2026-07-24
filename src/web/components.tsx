/** Small shared pieces used across pages. */
import { type ReactNode, useEffect, useRef, useState } from "react";
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

/**
 * A searchable multi-select for long option lists (skills, industries,
 * certifications). Selected values show as removable tags; typing filters a
 * dropdown of the rest. `allowCustom` decides whether a value not in the list
 * can be added — off for a closed vocabulary like industries, on where a
 * freelancer may legitimately hold something niche.
 */
export function SearchSelect({
  options,
  selected,
  onChange,
  allowCustom,
  placeholder,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
  allowCustom?: boolean;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Close when focus leaves the whole control.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = options
    .filter((o) => !selected.includes(o) && (!q || o.toLowerCase().includes(q)))
    .slice(0, 50);
  const exact =
    options.some((o) => o.toLowerCase() === q) || selected.some((s) => s.toLowerCase() === q);
  const canAddCustom = Boolean(allowCustom) && q.length > 0 && !exact;

  const add = (label: string) => {
    const v = label.trim();
    if (v && !selected.includes(v)) onChange([...selected, v]);
    setQuery("");
    setOpen(true);
  };
  const remove = (label: string) => onChange(selected.filter((s) => s !== label));

  return (
    <div className="search-select" ref={boxRef}>
      {selected.length > 0 && (
        <div className="chips" style={{ marginBottom: 6 }}>
          {selected.map((label) => (
            <span key={label} className="chip on">
              {label}
              <button
                type="button"
                className="chip-x"
                aria-label={`Remove ${label}`}
                onClick={() => remove(label)}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        value={query}
        placeholder={placeholder ?? "Search…"}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches[0]) add(matches[0]);
            else if (canAddCustom) add(query);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && (matches.length > 0 || canAddCustom) && (
        <div className="ss-menu" role="listbox">
          {matches.map((o) => (
            <button key={o} type="button" className="ss-option" onClick={() => add(o)}>
              {o}
            </button>
          ))}
          {canAddCustom && (
            <button type="button" className="ss-option ss-add" onClick={() => add(query)}>
              Add “{query.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The "where can you work?" picker: mobility areas as toggle chips, grouped by
 * region so the province list stays scannable, with "Fully remote" as its own
 * group because it is a mobility answer as much as a place.
 */
export function MobilityPicker({
  areas,
  groups,
  selected,
  onChange,
}: {
  areas: readonly { code: string; label: string; group: string }[];
  groups: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const toggle = (code: string) =>
    onChange(selected.includes(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  return (
    <div>
      {groups.map((group) => (
        <div key={group} className="region-group">
          <p className="region-head">{group}</p>
          <div className="chips">
            {areas
              .filter((a) => a.group === group)
              .map((a) => (
                <button
                  key={a.code}
                  type="button"
                  className={`chip ${selected.includes(a.code) ? "on" : ""}`}
                  aria-pressed={selected.includes(a.code)}
                  onClick={() => toggle(a.code)}
                >
                  {a.label}
                </button>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

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

/**
 * Turn a stored enum token into something a person reads: `self_signup` →
 * `self signup`. For values without a curated label (contact source, consent
 * source), so the underscore form never reaches the screen.
 */
export function humanizeToken(value: string): string {
  return value.replace(/_/g, " ");
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
  verified,
}: {
  consents?: Consents;
  suppressed?: boolean;
  /** Undefined for contacts, which have no profile to verify. */
  verified?: boolean;
}) {
  if (suppressed) return <span className="pill bad">Do not contact</span>;
  if (!consents?.data_processing) return <span className="pill neutral">Opted out (default)</span>;
  // Consent without a proven address is not something we act on: anyone can type
  // an address into the public form, so campaigns wait for the link to be opened.
  if (verified === false) {
    return (
      <span className="pill warn" title="Waiting for this person to open the link we emailed them">
        Unverified — not mailed
      </span>
    );
  }
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
