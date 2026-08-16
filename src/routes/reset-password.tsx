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

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Redefinir senha — Planner Matriz" },
      { name: "description", content: "Defina uma nova senha de acesso ao Planner Matriz da Oficina Matriz." },
      { property: "og:title", content: "Redefinir senha — Planner Matriz" },
      { property: "og:description", content: "Defina uma nova senha de acesso ao Planner Matriz." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [pronto, setPronto] = useState(false);
  const [nova, setNova] = useState("");
  const [conf, setConf] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setPronto(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) setPronto(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (nova.length < 8) return toast.error("Senha precisa ter no mínimo 8 caracteres");
    if (nova !== conf) return toast.error("A confirmação não confere");
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.auth.updateUser({ password: nova });
    setLoading(false);
    if (error) {
      toast.error("Falha ao redefinir senha", { description: error.message });
      return;
    }
    if (u.user) await supabase.from("profiles").update({ must_change_password: false }).eq("id", u.user.id);
    toast.success("Senha redefinida! Você já pode usar o app.");
    navigate({ to: "/" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src="/logo.png" alt="Engelog" className="h-14 w-auto" />
          <CardTitle className="mt-4 font-display text-lg">Redefinir senha</CardTitle>
          <CardDescription>
            {pronto ? "Escolha uma nova senha de acesso." : "Abra esta página pelo link enviado no seu e-mail."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pronto ? (
            <form onSubmit={save} className="space-y-3">
              <div>
                <Label>Nova senha</Label>
                <Input type="password" required minLength={8} value={nova} onChange={(e) => setNova(e.target.value)} />
              </div>
              <div>
                <Label>Confirmar nova senha</Label>
                <Input type="password" required minLength={8} value={conf} onChange={(e) => setConf(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <KeyRound className="mr-2 h-4 w-4" />}
                Salvar nova senha
              </Button>
            </form>
          ) : (
            <Button variant="outline" className="w-full" onClick={() => navigate({ to: "/auth" })}>
              Voltar para o login
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
