import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formata horímetro: valores ausentes/invalidos ficam em branco (para preenchimento manual). */
export function horas(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && String(v ?? "").trim() !== "" ? `${n} h` : "";
}
