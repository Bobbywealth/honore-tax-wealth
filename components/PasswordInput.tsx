"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

type Props = {
  id: string;
  name?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  placeholder?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
};

/**
 * Password field with a show/hide preview toggle (eye icon).
 * Unstyled wrapper — the input inherits the surrounding form's input styles;
 * the toggle button is positioned over the input's right edge.
 */
export default function PasswordInput({
  id,
  name,
  label,
  value,
  onChange,
  autoComplete = "current-password",
  placeholder,
  required,
  minLength,
  disabled,
}: Props) {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <span className="password-field">
        <input
          id={id}
          name={name ?? id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={minLength}
          disabled={disabled}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          tabIndex={-1}
          disabled={disabled}
        >
          {visible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </span>
    </>
  );
}
