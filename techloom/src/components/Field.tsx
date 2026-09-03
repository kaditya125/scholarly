import type { ChangeEvent } from 'react';

/**
 * One labelled form field, with the accessibility wiring done once.
 *
 * The label is always rendered and always bound — no placeholder-as-label,
 * which disappears the moment someone starts typing and leaves screen-reader
 * users with an unnamed box. Hint and error are joined into `aria-describedby`
 * so both are announced, and `aria-invalid` marks the field itself rather than
 * relying on the red text being noticed.
 *
 * Shared by the contact form and the project discovery flow. Two copies of this
 * wiring would mean two chances to get it subtly wrong, and the broken one is
 * always the form nobody opened with a screen reader.
 */
export default function Field({
  name,
  label,
  value,
  error,
  onChange,
  type = 'text',
  required = false,
  multiline = false,
  rows = 5,
  hint,
  autoComplete,
}: {
  name: string;
  label: string;
  value: string;
  error?: string;
  onChange: (field: string, value: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  rows?: number;
  hint?: string;
  autoComplete?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const shared = {
    id: name,
    name,
    value,
    required,
    autoComplete,
    'aria-invalid': error ? (true as const) : undefined,
    'aria-describedby': describedBy,
    onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(name, event.target.value),
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <label htmlFor={name} className="label">
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
          {required ? <span className="sr-only"> (required)</span> : null}
        </label>
        {hint ? (
          <span id={hintId} className="text-[0.75rem] text-ink-3">
            {hint}
          </span>
        ) : null}
      </div>

      {multiline ? (
        <textarea {...shared} rows={rows} className="field-input mt-2" />
      ) : (
        <input {...shared} type={type} className="field-input mt-2" />
      )}

      {error ? (
        <p id={errorId} className="mt-2 text-[0.8125rem] text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
