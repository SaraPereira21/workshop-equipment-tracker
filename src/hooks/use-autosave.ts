import { useEffect, useRef, useState } from "react";

/**
 * Salva automaticamente o que está na tela.
 *
 * - Aguarda `delay` ms sem novas alterações (debounce) antes de gravar.
 * - Ignora a primeira renderização (não regrava o que acabou de carregar).
 * - Grava também ao sair da tela / fechar o app (pagehide) e ao trocar de aba.
 */
export function useAutosave(
  valor: unknown,
  salvar: () => void,
  { delay = 1500, enabled = true }: { delay?: number; enabled?: boolean } = {},
) {
  const [salvoEm, setSalvoEm] = useState<Date | null>(null);
  const [pendente, setPendente] = useState(false);
  const salvarRef = useRef(salvar);
  salvarRef.current = salvar;

  const serial = (() => {
    try {
      return JSON.stringify(valor);
    } catch {
      return String(valor);
    }
  })();

  const anterior = useRef<string | null>(null);
  const sujoRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    if (anterior.current === null) {
      anterior.current = serial;
      return;
    }
    if (anterior.current === serial) return;
    anterior.current = serial;
    sujoRef.current = true;
    setPendente(true);

    const t = setTimeout(() => {
      try {
        salvarRef.current();
        sujoRef.current = false;
        setSalvoEm(new Date());
      } catch (e) {
        console.warn("autosave", e);
      } finally {
        setPendente(false);
      }
    }, delay);

    return () => clearTimeout(t);
  }, [serial, delay, enabled]);

  // Garante a gravação ao fechar/minimizar o app ou sair da tela.
  useEffect(() => {
    if (!enabled) return;
    const flush = () => {
      if (!sujoRef.current) return;
      try {
        salvarRef.current();
        sujoRef.current = false;
      } catch (e) {
        console.warn("autosave flush", e);
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      flush();
    };
  }, [enabled]);

  return { salvoEm, pendente };
}

/** Texto curto de status para exibir perto dos botões de salvar. */
export function textoAutosave(salvoEm: Date | null, pendente: boolean) {
  if (pendente) return "Salvando…";
  if (salvoEm)
    return `Salvo automaticamente às ${salvoEm.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  return "Salvamento automático ativo";
}
