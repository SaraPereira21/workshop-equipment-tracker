import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";

/**
 * Campo numérico que aceita ficar VAZIO enquanto a pessoa digita.
 * Inputs controlados por Number() travavam em "0" e não deixavam apagar.
 */
export function NumField({
  id,
  value,
  onCommit,
  className,
  placeholder = "—",
  disabled,
}: {
  id?: string;
  value?: number;
  onCommit: (v: number | undefined) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const external = value === undefined || value === null || value === 0 ? "" : String(value);
  const [text, setText] = useState(external);

  useEffect(() => {
    setText(external);
  }, [external]);

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder={placeholder}
      value={text}
      disabled={disabled}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d]/g, "");
        setText(raw);
      }}
      onBlur={() => onCommit(text === "" ? undefined : Number(text))}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className={className}
    />
  );
}
