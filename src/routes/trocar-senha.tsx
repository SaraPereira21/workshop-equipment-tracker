import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2, KeyRound } from "lucide-react";
import logoAsset from "@/assets/logo-engelog.png.asset.json";
import type { AppRole } from "@/hooks/use-auth";
import { landingRouteFor } from "@/lib/role-access";


export const Route = createFileRoute("/trocar-senha")({
  ssr: false,
  component: TrocarSenhaPage,
});

function TrocarSenhaPage() {
  const navigate = useNavigate();
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) navigate({ to: "/auth" });
      else setUserId(data.user.id);
    });
  }, [navigate]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nova.length < 8) return toast.error("Senha precisa ter no mínimo 8 caracteres");
    if (nova !== conf) return toast.error("A confirmação não confere");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: nova });
    if (error) {
      setLoading(false);
      const msg = (error.message || "").toLowerCase();
      const fraca = msg.includes("weak") || msg.includes("pwned") || msg.includes("leaked");
      toast.error("Falha ao trocar senha", {
        description: fraca
          ? "Essa senha é muito comum e já apareceu em vazamentos. Use uma senha diferente, com letras, números e um símbolo (ex.: Ofic!na2026)."
          : error.message,
      });
      return;
    }
    let destino = "/";
    if (userId) {
      await supabase.from("profiles").update({ must_change_password: false }).eq("id", userId);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      const roles = ((r ?? []) as { role: AppRole }[]).map((x) => x.role);
      destino = landingRouteFor(roles);
    }
    setLoading(false);
    toast.success("Senha atualizada");
    navigate({ to: destino });

  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src={logoAsset.url} alt="Engelog" className="h-14 w-auto" />
          <CardTitle className="mt-4 font-display text-lg">Definir nova senha</CardTitle>
          <CardDescription>Primeiro acesso — troque a senha temporária.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-3">
            <div>
              <Label>Nova senha</Label>
              <Input type="password" required minLength={8} value={nova} onChange={(e) => setNova(e.target.value)} />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Mínimo 8 caracteres. Evite senhas comuns (123456, senha@123) — use letras, números e um símbolo.
              </p>
            </div>
            <div>
              <Label>Confirmar nova senha</Label>
              <Input type="password" required minLength={8} value={conf} onChange={(e) => setConf(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
              Salvar senha
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
