import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import logoAsset from "@/assets/logo-engelog.png.asset.json";
import { Loader2, Check, Circle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cpfToSyntheticEmail, isValidCpf, maskCpf, onlyDigits } from "@/lib/cpf";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

const DOMINIOS_PERMITIDOS = ["fornecedoraengelog.com.br", "Ativo.com.br"];

const REGRAS_SENHA = [
  { label: "Mínimo de 8 caracteres", test: (s: string) => s.length >= 8 },
  { label: "Pelo menos 1 letra maiúscula", test: (s: string) => /[A-Z]/.test(s) },
  { label: "Pelo menos 1 letra minúscula", test: (s: string) => /[a-z]/.test(s) },
  { label: "Pelo menos 1 número", test: (s: string) => /\d/.test(s) },
  { label: "Pelo menos 1 caractere especial (!@#$%...)", test: (s: string) => /[^A-Za-z0-9]/.test(s) },
];

function AuthPage() {
  const navigate = useNavigate();
  const [aba, setAba] = useState<"login" | "cadastro">("login");
  const [cpf, setCpf] = useState("");
  const [modoEmail, setModoEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Cadastro corporativo (somente visualização)
  const [cNome, setCNome] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cSenha, setCSenha] = useState("");
  const [cSenha2, setCSenha2] = useState("");
  const [cLoading, setCLoading] = useState(false);
  const [enviado, setEnviado] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/" });
    });
  }, [navigate]);

  async function handleRecuperar() {
    const raw = cpf.trim();
    if (!raw.includes("@")) {
      toast.error("Informe seu e-mail corporativo para receber o link");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(raw.toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error("Não foi possível enviar", { description: error.message });
    else toast.success("Enviamos um link de redefinição para " + raw);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const raw = cpf.trim();
    // Accept email fallback for legacy admin accounts (created before CPF login).
    const looksLikeEmail = raw.includes("@");
    const email = looksLikeEmail ? raw.toLowerCase() : cpfToSyntheticEmail(raw);
    if (!looksLikeEmail && !isValidCpf(raw)) {
      toast.error("Informe um CPF válido ou e-mail corporativo");
      return;
    }
    if (!password) {
      toast.error("Informe a senha");
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      const msg = (error.message || "").toLowerCase();
      if (msg.includes("not confirmed")) {
        toast.error("E-mail ainda não confirmado", {
          description: "Confirme o link enviado para o seu e-mail antes de entrar.",
        });
      } else {
        toast.error("Falha no login", {
          description: looksLikeEmail
            ? "E-mail ou senha incorretos. Use 'Esqueci minha senha' para redefinir."
            : "CPF ou senha incorretos",
        });
      }
      return;
    }

    // Check must_change_password flag
    const { data: profile } = await supabase
      .from("profiles")
      .select("must_change_password")
      .eq("id", data.user.id)
      .maybeSingle();
    setLoading(false);
    toast.success("Bem-vindo!");
    if (profile?.must_change_password) {
      navigate({ to: "/trocar-senha" });
    } else {
      navigate({ to: "/" });
    }
  }

  async function handleCadastro(e: React.FormEvent) {
    e.preventDefault();
    const email = cEmail.trim().toLowerCase();
    const dominio = email.split("@")[1];
    if (!dominio || !DOMINIOS_PERMITIDOS.includes(dominio)) {
      toast.error("E-mail não permitido", {
        description: "Use seu e-mail @fornecedoraengelog.com.br ou @Ativo.com.br",
      });
      return;
    }
    if (cNome.trim().length < 3) {
      toast.error("Informe seu nome completo");
      return;
    }
    if (REGRAS_SENHA.some((r) => !r.test(cSenha))) {
      toast.error("Senha fora do padrão exigido");
      return;
    }
    if (cSenha !== cSenha2) {
      toast.error("As senhas não conferem");
      return;
    }
    setCLoading(true);
    const { error } = await supabase.auth.signUp({
      email,
      password: cSenha,
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { nome: cNome.trim() },
      },
    });
    setCLoading(false);
    if (error) {
      toast.error("Não foi possível criar o cadastro", { description: error.message });
      return;
    }
    setEnviado(true);
    toast.success("Cadastro criado! Confirme o e-mail para acessar.");
  }

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-primary/10 via-background to-accent/10 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="items-center text-center">
          <img src="/logo.png" alt="Engelog" className="h-14 w-auto" />
          <CardTitle className="mt-4 font-display text-lg">PLANNER MATRIZ</CardTitle>
          <CardDescription>Fluxo de Máquinas — acesso restrito</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={aba} onValueChange={(v) => setAba(v as "login" | "cadastro")}>
            <TabsList className="mb-4 grid w-full grid-cols-2">
              <TabsTrigger value="login">Entrar</TabsTrigger>
              <TabsTrigger value="cadastro">Criar cadastro</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label>{modoEmail ? "E-mail" : "CPF"}</Label>
                    <button
                      type="button"
                      className="text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                      onClick={() => {
                        setModoEmail((m) => !m);
                        setCpf("");
                      }}
                    >
                      {modoEmail ? "Usar CPF" : "Usar e-mail"}
                    </button>
                  </div>
                  <Input
                    autoComplete="username"
                    required
                    type="text"
                    placeholder={modoEmail ? "seu@email.com" : "000.000.000-00"}
                    value={cpf}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (modoEmail) setCpf(v);
                      else if (v.includes("@") || /[a-zA-Z]/.test(v)) {
                        setModoEmail(true);
                        setCpf(v);
                      } else setCpf(maskCpf(v));
                    }}
                    inputMode={modoEmail ? "email" : "numeric"}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    maxLength={modoEmail ? 120 : 14}
                  />
                </div>
                <div>
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Entrar
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  Acesso operacional somente por cadastro do <b>Administrador</b>.
                </p>
                <button
                  type="button"
                  onClick={handleRecuperar}
                  className="w-full text-center text-[11px] font-medium text-primary underline-offset-2 hover:underline"
                >
                  Esqueci minha senha (login por e-mail)
                </button>

              </form>
            </TabsContent>

            <TabsContent value="cadastro">
              {enviado ? (
                <div className="space-y-3 text-center">
                  <p className="text-sm font-medium">Enviamos um link de confirmação para {cEmail}.</p>
                  <p className="text-xs text-muted-foreground">
                    Confirme o e-mail e volte para entrar. Seu acesso é de <b>visualização</b> do Planner e dos indicadores.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => setAba("login")}>
                    Voltar para o login
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleCadastro} className="space-y-3">
                  <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                    Cadastro liberado apenas para e-mails corporativos
                    <b> @fornecedoraengelog.com.br</b> e <b>@Ativo.com.br</b>. O acesso criado é de
                    <b> somente visualização</b> (Planner e Indicadores).
                  </div>
                  <div>
                    <Label>Nome completo</Label>
                    <Input value={cNome} onChange={(e) => setCNome(e.target.value)} required maxLength={120} />
                  </div>
                  <div>
                    <Label>E-mail corporativo</Label>
                    <Input
                      type="email"
                      required
                      autoComplete="email"
                      placeholder="nome@fornecedoraengelog.com.br"
                      value={cEmail}
                      onChange={(e) => setCEmail(e.target.value)}
                      autoCapitalize="none"
                      spellCheck={false}
                      maxLength={150}
                    />
                  </div>
                  <div>
                    <Label>Criar senha</Label>
                    <Input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={cSenha}
                      onChange={(e) => setCSenha(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Confirmar senha</Label>
                    <Input
                      type="password"
                      required
                      autoComplete="new-password"
                      value={cSenha2}
                      onChange={(e) => setCSenha2(e.target.value)}
                    />
                  </div>
                  <div className="rounded-md border bg-muted/40 p-3">
                    <div className="mb-1.5 text-xs font-semibold">A senha deve conter:</div>
                    <ul className="space-y-1">
                      {REGRAS_SENHA.map((r) => {
                        const ok = r.test(cSenha);
                        return (
                          <li
                            key={r.label}
                            className={
                              "flex items-center gap-2 text-[11px] " +
                              (ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")
                            }
                          >
                            {ok ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
                            {r.label}
                          </li>
                        );
                      })}
                    </ul>
                    <p className="mt-2 text-[10px] text-muted-foreground">
                      Evite datas de nascimento, sequências (12345678) ou o próprio nome.
                    </p>
                  </div>
                  <Button type="submit" className="w-full" disabled={cLoading}>
                    {cLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Criar cadastro
                  </Button>
                </form>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

// Silence unused-import warnings if TS complains
void onlyDigits;
