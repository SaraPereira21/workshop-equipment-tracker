import type { AppRole } from "@/hooks/use-auth";

// Which top-level sections each role can navigate to.
// Admin always sees everything.
export const ROLE_ROUTES: Record<AppRole, string[]> = {
  admin: ["/", "/planner", "/inspetor", "/pcm", "/supervisor", "/mecanico", "/frota", "/pmp", "/os", "/admin", "/dashboard", "/relatorios", "/seminovos"],
  // PCM e Supervisor circulam por todas as telas (exceto /admin),
  // assim não precisam receber outras funções (e nunca são alocados como mecânicos).
  pcm: ["/", "/planner", "/inspetor", "/pcm", "/supervisor", "/mecanico", "/frota", "/pmp", "/os", "/dashboard", "/relatorios", "/seminovos"],
  supervisor: ["/", "/planner", "/inspetor", "/pcm", "/supervisor", "/mecanico", "/frota", "/pmp", "/os", "/dashboard", "/relatorios", "/seminovos"],
  inspetor: ["/", "/planner", "/inspetor", "/os"],
  frota: ["/", "/planner", "/frota", "/os", "/dashboard", "/relatorios", "/seminovos"],
  // Mecânico abre a OS e o card do equipamento (somente leitura no card).
  mecanico: ["/mecanico", "/os", "/planner"],
  // Visitante corporativo: somente visualização do planner e indicadores.
  visitante: ["/", "/planner", "/dashboard", "/relatorios", "/seminovos"],
};

// Rotas liberadas para qualquer usuário autenticado (independem de perfil).
const PUBLIC_ROUTES = ["/instalar", "/trocar-senha"];

export function canAccess(roles: AppRole[], path: string): boolean {
  if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(p + "/"))) return true;
  if (roles.includes("admin")) return true;
  if (roles.length === 0) return path === "/"; // no role: only dashboard shell
  const allowed = new Set<string>();
  for (const r of roles) ROLE_ROUTES[r]?.forEach((p) => allowed.add(p));
  // exact match or nested path (e.g. /planner/xyz)
  return [...allowed].some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
}

export function landingRouteFor(roles: AppRole[]): string {
  if (roles.includes("admin")) return "/";
  if (roles.includes("mecanico") && roles.length === 1) return "/mecanico";
  if (roles.includes("inspetor")) return "/inspetor";
  if (roles.includes("pcm")) return "/pcm";
  if (roles.includes("supervisor")) return "/supervisor";
  if (roles.includes("frota")) return "/frota";
  return "/";
}
