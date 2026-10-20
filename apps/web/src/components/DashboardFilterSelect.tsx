import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./DashboardFilterSelect.css";

type FilterOption = { value: string; label: string; detail?: string };

export function DashboardFilterSelect({
  label,
  placeholder,
  options,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: FilterOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const selected = options.find((option) => option.value === value);
  const term = query.trim().toLocaleLowerCase();
  const visible = [{ value: "", label: placeholder }, ...options].filter(
    (option) =>
      `${option.label} ${option.detail ?? ""}`
        .toLocaleLowerCase()
        .includes(term),
  );
  const activeIndex = Math.max(
    0,
    visible.findIndex((option) => option.value === activeValue),
  );

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  useEffect(() => {
    if (open)
      document
        .getElementById(`${id}-option-${activeIndex}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, activeIndex, id]);

  function show() {
    setQuery("");
    setActiveValue(value);
    setOpen(true);
  }

  function choose(next: string) {
    onChange(next);
    setOpen(false);
    trigger.current?.focus();
  }

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      const index = (activeIndex + step + visible.length) % visible.length;
      setActiveValue(visible[index]?.value ?? null);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (visible[activeIndex]) choose(visible[activeIndex].value);
    }
  }

  return (
    <div
      ref={root}
      className={`dashboard-select${value ? " has-selection" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <label id={`${id}-label`} htmlFor={`${id}-trigger`}>
        {label}
      </label>
      <button
        ref={trigger}
        id={`${id}-trigger`}
        type="button"
        className="dashboard-select-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-popup` : undefined}
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => {
          if (open) setOpen(false);
          else show();
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            show();
          }
        }}
      >
        <span
          id={`${id}-value`}
          title={
            selected
              ? `${selected.label}${selected.detail ? ` · ${selected.detail}` : ""}`
              : placeholder
          }
        >
          {selected?.label ?? placeholder}
        </span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <div
          id={`${id}-popup`}
          className="dashboard-select-popup"
          role="dialog"
          aria-label={`Wybierz: ${label}`}
        >
          <div className="dashboard-select-search">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <circle cx="8.5" cy="8.5" r="5" />
              <path d="m12.5 12.5 4 4" />
            </svg>
            <input
              ref={search}
              type="text"
              role="combobox"
              aria-label={`Szukaj: ${label}`}
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={`${id}-list`}
              aria-activedescendant={
                visible.length ? `${id}-option-${activeIndex}` : undefined
              }
              placeholder="Szukaj po nazwie lub kodzie…"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActiveValue(null);
              }}
              onKeyDown={navigate}
            />
          </div>
          <ul
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="dashboard-select-options"
          >
            {visible.map((option, index) => (
              <li
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={value === option.value}
                className={index === activeIndex ? "is-active" : undefined}
                onPointerMove={() => setActiveValue(option.value)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option.value)}
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.detail && <small>{option.detail}</small>}
                </span>
                {value === option.value && (
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m4 10 4 4 8-8" />
                  </svg>
                )}
              </li>
            ))}
          </ul>
          {!visible.length && (
            <p className="dashboard-select-empty" role="status">
              Brak pasujących opcji. Spróbuj innej nazwy lub kodu.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
