import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, Share, PlusSquare, MoreVertical, CheckCircle2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import {
  detectPlatform,
  getInstallPrompt,
  isStandalone,
  startInstallCapture,
  subscribeInstall,
  triggerInstall,
} from "@/lib/install-prompt";
import logoAsset from "@/assets/logo-engelog.png.asset.json";

export const Route = createFileRoute("/instalar")({
  head: () => ({
    meta: [
      { title: "Instalar o Planner Matriz no celular" },
      {
        name: "description",
        content:
          "Instale o app Planner Matriz no celular ou tablet para usar inspeções, OS e kanban da oficina em tela cheia e offline.",
      },
      { property: "og:title", content: "Instalar o Planner Matriz no celular" },
      {
        property: "og:description",
        content: "Passo a passo para adicionar o Planner Matriz à tela de início do Android ou iPhone.",
      },
    ],
  }),
  component: InstalarPage,
});

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-relaxed">{children}</span>
    </li>
  );
}

function InstalarPage() {
  const [canInstall, setCanInstall] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");

  useEffect(() => {
    startInstallCapture();
    setPlatform(detectPlatform());
    setInstalled(isStandalone());
    const update = () => setCanInstall(!!getInstallPrompt());
    update();
    return subscribeInstall(update);
  }, []);

  const handleInstall = async () => {
    const res = await triggerInstall();
    if (res === "accepted") toast.success("App instalado!");
    else if (res === "unavailable")
      toast.info("Use o menu do navegador para adicionar à tela de início.");
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 p-4">
      <header className="flex flex-col items-center gap-2 py-4 text-center">
        <img src={logoAsset.url} alt="Engelog" className="h-16 w-auto rounded bg-white p-2" />
        <h1 className="font-display text-xl font-bold">Instalar o PLANNER MATRIZ</h1>
        <p className="text-sm text-muted-foreground">
          Adicione o app à tela de início para abrir em tela cheia e trabalhar offline.
        </p>
      </header>

      {installed ? (
        <Card>
          <CardContent className="flex items-center gap-3 py-6">
            <CheckCircle2 className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium">O app já está instalado neste aparelho.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {canInstall && (
            <Button size="lg" className="tap-target w-full gap-2" onClick={handleInstall}>
              <Download className="h-5 w-5" /> Instalar agora
            </Button>
          )}

          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="py-4 text-sm leading-relaxed">
              <strong>Importante:</strong> a instalação <strong>não baixa nenhum arquivo</strong>. Não
              procure em “Downloads” ou “Arquivos” — o ícone <strong>PLANNER MATRIZ</strong> aparece na
              tela de início / gaveta de aplicativos do celular. Abra sempre por esse ícone.
            </CardContent>
          </Card>



          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Smartphone className="h-4 w-4" /> Android (Chrome)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>
                  Abra <strong>https://plannermatriz.lovable.app</strong> no <strong>Chrome</strong> (não
                  dentro do WhatsApp, Teams ou Instagram).
                </Step>
                <Step n={2}>
                  Toque no menu <MoreVertical className="inline h-4 w-4 align-text-bottom" /> (três
                  pontinhos) no canto superior direito.
                </Step>
                <Step n={3}>
                  Escolha <strong>“Instalar app”</strong> ou <strong>“Adicionar à tela inicial”</strong> e
                  confirme.
                </Step>
              </ol>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Share className="h-4 w-4" /> iPhone / iPad (Safari)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-3">
                <Step n={1}>
                  Abra o link no <strong>Safari</strong> (no iPhone só o Safari instala apps).
                </Step>
                <Step n={2}>
                  Toque em <strong>Compartilhar</strong>{" "}
                  <Share className="inline h-4 w-4 align-text-bottom" /> na barra inferior.
                </Step>
                <Step n={3}>
                  Escolha <strong>“Adicionar à Tela de Início”</strong>{" "}
                  <PlusSquare className="inline h-4 w-4 align-text-bottom" /> e toque em{" "}
                  <strong>Adicionar</strong>.
                </Step>
              </ol>
            </CardContent>
          </Card>

          <p className="px-2 text-center text-xs text-muted-foreground">
            {platform === "desktop"
              ? "Você está no computador — abra este mesmo endereço no celular para instalar lá."
              : "Se a opção não aparecer, atualize a página uma vez e tente de novo."}{" "}
            A instalação não funciona no preview do editor, apenas no link publicado.
          </p>
        </>
      )}
    </main>
  );
}
