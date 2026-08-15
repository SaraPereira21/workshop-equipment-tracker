import { useEffect, useState } from "react";
import { CloudOff, RefreshCw, Cloud } from "lucide-react";
import { flushOutbox, getOfflineState, subscribeOffline } from "@/lib/offline-sync";
import { cn } from "@/lib/utils";

/** Indicador de conexão + pendências aguardando sincronização. */
export function OfflineIndicator({ className }: { className?: string }) {
  const [state, setState] = useState({ online: true, pending: 0 });

  useEffect(() => {
    const update = () => setState(getOfflineState());
    update();
    const unsub = subscribeOffline(update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    const t = window.setInterval(update, 5000);
    return () => {
      unsub();
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.clearInterval(t);
    };
  }, []);

  const offline = !state.online;
  const sincronizando = !offline && state.pending > 0;

  return (
    <button
      type="button"
      onClick={() => void flushOutbox()}
      title={
        offline
          ? "Sem conexão — suas alterações ficam salvas no aparelho e sobem sozinhas"
          : sincronizando
            ? "Enviar pendências agora"
            : "Online — tudo sincronizado"
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        offline
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : sincronizando
            ? "border-amber-500/30 bg-amber-500/10 text-amber-600"
            : "border-border bg-muted/50 text-muted-foreground",
        className,
      )}
    >
      {offline ? (
        <CloudOff className="h-3.5 w-3.5" />
      ) : sincronizando ? (
        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Cloud className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">
        {offline ? "Offline" : sincronizando ? "Sincronizando" : "Online"}
      </span>
      {state.pending > 0 && <span>{state.pending}</span>}
    </button>
  );
}
