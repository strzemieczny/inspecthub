import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import "./CompactSelect.css";

export function CompactSelect({
  label,
  value,
  options,
  onChange,
  placement = "bottom",
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  placement?: "top" | "bottom";
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  function choose(index: number) {
    if (options[index]) onChange(options[index].value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      setOpen(true);
      const current = open ? activeIndex : Math.max(0, selectedIndex);
      setActiveIndex(
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (current +
                (event.key === "ArrowDown" ? 1 : -1) +
                options.length) %
              options.length,
      );
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (open) choose(activeIndex);
      else {
        setActiveIndex(Math.max(0, selectedIndex));
        setOpen(true);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (
      event.key.length === 1 &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey
    ) {
      const index = options.findIndex((option) =>
        option.label
          .toLocaleLowerCase()
          .startsWith(event.key.toLocaleLowerCase()),
      );
      if (index !== -1) {
        event.preventDefault();
        setActiveIndex(index);
        setOpen(true);
      }
    }
  }

  return (
    <div
      ref={root}
      className={`compact-select compact-select-${placement}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        aria-activedescendant={open ? `${id}-option-${activeIndex}` : undefined}
        className="compact-select-trigger"
        onKeyDown={onKeyDown}
        onClick={() => {
          setActiveIndex(Math.max(0, selectedIndex));
          setOpen(!open);
        }}
      >
        <span>{options[selectedIndex]?.label ?? value}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m6 8 4 4 4-4" />
        </svg>
      </button>
      {open && (
        <ul
          id={`${id}-list`}
          className="compact-select-options"
          role="listbox"
          aria-label={label}
        >
          {options.map((option, index) => (
            <li
              key={option.value}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={option.value === value}
              className={index === activeIndex ? "is-active" : undefined}
              onPointerMove={() => setActiveIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && (
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="m4 10 4 4 8-8" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
