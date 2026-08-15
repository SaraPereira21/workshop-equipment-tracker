import { Link, useCanGoBack, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Botão "Voltar" que retorna para a tela anterior do histórico.
 * Se não houver histórico (link aberto direto), cai no destino `fallbackTo`.
 */
export function BackButton({
  fallbackTo,
  label = "Voltar",
  className,
}: {
  fallbackTo: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  if (!canGoBack) {
    return (
      <Button variant="ghost" size="sm" asChild className={cn("gap-2", className)}>
        <Link to={fallbackTo}>
          <ArrowLeft className="h-4 w-4" /> {label}
        </Link>
      </Button>
    );
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("gap-2", className)}
      onClick={() => router.history.back()}
    >
      <ArrowLeft className="h-4 w-4" /> {label}
    </Button>
  );
}
