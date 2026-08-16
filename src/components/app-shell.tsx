import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard,
  ClipboardCheck,
  KanbanSquare,
  Users,
  Truck,
  Menu,
  
  HardHat,
  ClipboardList,
  ShieldCheck,
  LogOut,
  BarChart3,
  User as UserIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  BookOpen,
  ShoppingCart,
  Smartphone,
  FileSpreadsheet,
  Tag,

} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";


import { cn } from "@/lib/utils";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { canAccess, landingRouteFor } from "@/lib/role-access";
import logoAsset from "@/assets/logo-engelog.png.asset.json";
import { toast } from "sonner";
import { NotificationsBell } from "@/components/notifications-bell";
import { OfflineIndicator } from "@/components/offline-indicator";
import { useAppSync } from "@/hooks/use-app-sync";
import { useMaterialWatch } from "@/hooks/use-material-watch";
import { startInstallCapture } from "@/lib/install-prompt";
import { COMPRAS_URL_PUBLIC } from "@/integrations/compras/client";


const NAV = [
  { to: "/", label: "Início", icon: LayoutDashboard },
  { to: "/dashboard", label: "Indicadores", icon: BarChart3 },
  { to: "/planner", label: "Planner", icon: KanbanSquare },
  { to: "/inspetor", label: "Inspeção", icon: ClipboardCheck },
  { to: "/pcm", label: "PCM", icon: ClipboardList },
  { to: "/supervisor", label: "Supervisor", icon: Users },
  { to: "/mecanico", label: "Mecânico", icon: HardHat },
  { to: "/frota", label: "Frota", icon: Truck },
  { to: "/pmp", label: "Catálogo PMP", icon: BookOpen },
  { to: "/relatorios", label: "Relatórios", icon: FileSpreadsheet },
  { to: "/seminovos", label: "Seminovos", icon: Tag },

] as const;

function useVisibleNav(roles: AppRole[]) {
  return NAV.filter((n) => canAccess(roles, n.to));
}


function UserMenu() {
  const { profile, user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const isAdmin = roles.includes("admin");
  const name = profile?.nome || user?.email || "Usuário";
  const primaryRole = roles[0] ?? "sem função";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="tap-target gap-2">
          <UserIcon className="h-4 w-4" />
          <span className="hidden max-w-[140px] truncate sm:inline">{name}</span>
          <Badge variant="secondary" className="font-medium capitalize">{primaryRole}</Badge>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="space-y-0.5">
          <div className="truncate">{name}</div>
          <div className="truncate text-[11px] font-normal text-muted-foreground">{user?.email}</div>
          <div className="mt-1 flex flex-wrap gap-1">
            {roles.length === 0 ? (
              <Badge variant="outline" className="text-[10px]">Sem função</Badge>
            ) : roles.map((r) => <Badge key={r} variant="secondary" className="text-[10px]">{r}</Badge>)}
          </div>
        </DropdownMenuLabel>
        {isAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate({ to: "/admin" })}>
              <ShieldCheck className="mr-2 h-4 w-4" /> Administração
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            try {
              const payload: Record<string, unknown> = {
                exportedAt: new Date().toISOString(),
                user: { nome: profile?.nome, email: user?.email, roles },
              };
              for (let i = 0; i < window.localStorage.length; i++) {
                const k = window.localStorage.key(i);
                if (!k) continue;
                if (k.startsWith("planner-") || k.startsWith("oficina-") || k.startsWith("sidebar:")) {
                  const raw = window.localStorage.getItem(k);
                  try { payload[k] = raw ? JSON.parse(raw) : raw; } catch { payload[k] = raw; }
                }
              }
              const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              const stamp = new Date().toISOString().replace(/[:.]/g, "-");
              const safeName = (profile?.nome || user?.email || "usuario").replace(/[^a-z0-9-_]+/gi, "_");
              a.href = url;
              a.download = `plannermatriz-backup-${safeName}-${stamp}.json`;
              a.click();
              URL.revokeObjectURL(url);
              toast.success("Backup dos seus dados baixado");
            } catch (e) {
              toast.error("Falha ao exportar dados");
            }
          }}
        >
          <Download className="mr-2 h-4 w-4" /> Exportar meus dados
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/instalar" })}>
          <Smartphone className="mr-2 h-4 w-4" /> Instalar app no celular
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            toast.success("Sessão encerrada");
            navigate({ to: "/auth" });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


function SidebarNav({ onNavigate, collapsed = false }: { onNavigate?: () => void; collapsed?: boolean }) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { roles } = useAuth();
  const items = useVisibleNav(roles);
  return (
    <nav translate="no" className="flex flex-col gap-1 p-3" style={{ fontFamily: "inherit" }}>
      <div className="mb-4 px-2 pt-2">
        <div className="flex flex-col items-center gap-2 text-center">
          <img src="/logo.png" alt="Engelog" className={cn("w-auto rounded bg-white p-1.5", collapsed ? "h-9" : "h-14")} />
          {!collapsed && (
            <div translate="no">
              <div className="font-display text-sm font-bold leading-tight text-sidebar-foreground" translate="no">PLANNER MATRIZ</div>
              <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60" translate="no">Fluxo de Máquinas</div>
            </div>
          )}
        </div>
      </div>
      {items.map((n) => {
        const active =
          n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            title={collapsed ? n.label : undefined}
            className={cn(
              "tap-target flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              collapsed && "justify-center",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="truncate" translate="no">{n.label}</span>}
          </Link>
        );
      })}
      <a
        href={COMPRAS_URL_PUBLIC}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNavigate}
        title={collapsed ? "Portal de Compras" : undefined}
        className={cn(
          "tap-target mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          collapsed && "justify-center",
        )}
      >
        <ShoppingCart className="h-5 w-5 shrink-0" />
        {!collapsed && <span className="truncate" translate="no">Portal de Compras</span>}
      </a>
    </nav>
  );
}

function BottomNav() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { roles } = useAuth();
  const items = useVisibleNav(roles);
  if (items.length === 0) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((n) => {
          const active =
            n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
              title={n.label}
              aria-label={n.label}
              className={cn(
                "flex items-center justify-center py-3",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "text-primary")} />
            </Link>
          );
        })}
        <a
          href={COMPRAS_URL_PUBLIC}
          target="_blank"
          rel="noopener noreferrer"
          title="Compras"
          aria-label="Compras"
          className="flex items-center justify-center py-3 text-muted-foreground"
        >
          <ShoppingCart className="h-5 w-5 shrink-0" />
        </a>
      </div>
    </nav>
  );
}

function RouteGuard({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const { profile, roles, loading } = useAuth();
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  useEffect(() => {
    if (loading) return;
    // Perfil ainda não hidratado (logo após login/troca de senha): aguarda.
    if (!profile) return;
    // Force password change on first access
    if (profile.must_change_password && pathname !== "/trocar-senha") {
      navigate({ to: "/trocar-senha" });
      return;
    }
    // Role-based access
    if (!canAccess(roles, pathname)) {
      const landing = landingRouteFor(roles);
      if (landing !== pathname) {
        // Redirecionamento silencioso a partir da raiz (pós-login/troca de senha).
        if (pathname !== "/") toast.error("Acesso não autorizado para o seu perfil");
        navigate({ to: landing });
      }
    }
  }, [loading, profile, roles, pathname, navigate]);


  return <>{children}</>;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar:collapsed") === "1";
  });
  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem("sidebar:collapsed", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const sidebarWidth = collapsed ? "w-16" : "w-60";
  const contentPad = collapsed ? "md:pl-16" : "md:pl-60";
  useAppSync();
  useMaterialWatch();
  useEffect(() => {
    startInstallCapture();
    void import("@/lib/pwa").then((m) => m.registerPwa());
  }, []);


  return (
    <div className="min-h-screen w-full">
      {/* Desktop sidebar */}
      <aside className={cn("fixed inset-y-0 left-0 z-30 hidden border-r border-sidebar-border bg-sidebar md:block transition-[width] duration-200", sidebarWidth)}>
        <div className="relative h-full overflow-y-auto">
          <SidebarNav collapsed={collapsed} />
          <Button
            variant="outline"
            size="icon"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="absolute -right-3 top-16 h-6 w-6 rounded-full border-sidebar-border bg-background shadow"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </aside>

      <div className={cn("flex min-h-screen flex-col", contentPad)}>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/95 px-3 backdrop-blur md:px-6">
          {/* Mobile menu */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="tap-target md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
              <SidebarNav />
            </SheetContent>
          </Sheet>

          <div className="flex flex-col items-center gap-0.5 md:hidden" translate="no">
            <img src="/logo.png" alt="Engelog" className="h-9 w-auto rounded bg-white p-1" />
            <div className="font-display text-[10px] font-bold leading-none" translate="no">PLANNER MATRIZ</div>
            <div className="text-[8px] uppercase tracking-wider text-muted-foreground" translate="no">Fluxo de Máquinas</div>
          </div>

          <div className="ml-auto flex items-center gap-2">
            
            <OfflineIndicator />
            <NotificationsBell />
            <UserMenu />
          </div>
        </header>

        <main className="flex-1 pb-20 md:pb-8">
          <RouteGuard>{children}</RouteGuard>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}

