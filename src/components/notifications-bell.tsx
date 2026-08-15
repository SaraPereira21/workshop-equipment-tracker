import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/use-auth";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface MentionItem {
  key: string;
  assetId: string;
  prefixo: string;
  autor: string;
  texto: string;
  createdAt: string;
}

function readLastSeen(userId: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage.getItem(`mentions-last-seen:${userId}`);
  return raw ? Number(raw) || 0 : 0;
}
function writeLastSeen(userId: string, ts: number) {
  window.localStorage.setItem(`mentions-last-seen:${userId}`, String(ts));
}

export function NotificationsBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const assets = useAppStore((s) => s.assets);
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState<number>(0);

  useEffect(() => {
    if (user?.id) setLastSeen(readLastSeen(user.id));
  }, [user?.id]);

  const mentions = useMemo<MentionItem[]>(() => {
    if (!user?.id) return [];
    const out: MentionItem[] = [];
    for (const a of assets) {
      const msgs = a.chatMessages ?? [];
      for (const m of msgs) {
        if (m.mencionados?.includes(user.id)) {
          out.push({
            key: `${a.id}:${m.id}`,
            assetId: a.id,
            prefixo: a.prefixo,
            autor: m.autor,
            texto: m.texto,
            createdAt: m.createdAt,
          });
        }
      }
    }
    return out.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [assets, user?.id]);

  const unread = mentions.filter(
    (m) => new Date(m.createdAt).getTime() > lastSeen,
  ).length;

  const markAllRead = () => {
    if (!user?.id) return;
    const now = Date.now();
    writeLastSeen(user.id, now);
    setLastSeen(now);
  };

  const openMention = (m: MentionItem) => {
    markAllRead();
    setOpen(false);
    navigate({ to: "/planner/$prefixo", params: { prefixo: m.prefixo } });
  };

  if (!user) return null;

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) markAllRead();
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="tap-target relative"
          aria-label="Notificações"
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <Badge className="absolute -right-1 -top-1 h-4 min-w-4 justify-center px-1 text-[10px]">
              {unread > 9 ? "9+" : unread}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b p-3">
          <div className="text-sm font-semibold">Menções</div>
          <div className="text-[11px] text-muted-foreground">
            {mentions.length} total
          </div>
        </div>
        <ScrollArea className="max-h-80">
          {mentions.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground">
              Ninguém te mencionou ainda.
            </div>
          )}
          {mentions.slice(0, 30).map((m) => {
            const isNew = new Date(m.createdAt).getTime() > lastSeen;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => openMention(m)}
                className={
                  "flex w-full flex-col items-start gap-0.5 border-b p-3 text-left text-sm hover:bg-muted/60 " +
                  (isNew ? "bg-primary/5" : "")
                }
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="font-medium">{m.autor}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatDistanceToNow(new Date(m.createdAt), {
                      locale: ptBR,
                      addSuffix: true,
                    })}
                  </span>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {m.prefixo}
                </div>
                <div className="line-clamp-2 text-xs text-foreground/80">
                  {m.texto}
                </div>
              </button>
            );
          })}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
