/* eslint-disable react/prop-types */
import { useEffect, useRef } from "react";

// Numeric PIN field with dot indicators. Uses one real input so paste, autofill and
// mobile number pads all work.
const PinInput = ({ value, onChange, onComplete, length = 6, autoFocus = true, label = "PIN", error }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  // After a wrong PIN, put the cursor straight back so the user can just retype.
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);

  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        ref={ref}
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]*"
        maxLength={length}
        value={value}
        onChange={(event) => {
          const next = event.target.value.replace(/\D/g, "").slice(0, length);
          onChange(next);
          if (next.length === length) onComplete?.(next);
        }}
        className="sr-only"
        aria-invalid={Boolean(error)}
      />
      <span
        className={`flex cursor-text justify-center gap-2.5 ${error ? "animate-[ui-shake_300ms_ease]" : ""}`}
        onClick={() => ref.current?.focus()}
        aria-hidden="true"
      >
        {Array.from({ length }, (_, index) => (
          <span
            key={index}
            className={`h-3.5 w-3.5 rounded-full border-2 transition-colors ${index < value.length ? "border-primary bg-primary" : error ? "border-error" : "border-base-content/30"}`}
          />
        ))}
      </span>
      {error && <span className="mt-3 block text-center text-sm text-error">{error}</span>}
    </label>
  );
};

export default PinInput;
