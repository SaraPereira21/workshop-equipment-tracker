import { PointerEvent as ReactPointerEvent, ClipboardEvent as ReactClipboardEvent, ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Eraser, Save, CheckCircle2, Trash2, Upload, PenLine, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useAppStore } from "@/lib/store";
import type { SavedSignature } from "@/lib/types";

interface Props {
  storageKey: string; // ex: `mecanico:${id}` | `supervisor:global`
  label: string;
  /** Chamado quando o usuário aplica a assinatura. */
  onApply?: (sig: SavedSignature) => void;
  applyLabel?: string;
  compact?: boolean;
}

/**
 * Componente para (1) exibir a assinatura padrão salva do usuário,
 * (2) cadastrar/editar a assinatura (nome, cargo, canvas) e
 * (3) aplicar a assinatura em um documento.
 */
export function SignaturePad({ storageKey, label, onApply, applyLabel = "Aplicar assinatura", compact }: Props) {
  const saved = useAppStore((s) => s.signatures[storageKey]);
  const saveSignature = useAppStore((s) => s.saveSignature);
  const deleteSignature = useAppStore((s) => s.deleteSignature);

  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState(saved?.nome ?? "");
  const [cargo, setCargo] = useState(saved?.cargo ?? "");
  const [mode, setMode] = useState<"draw" | "upload">("upload");
  const [uploadedDataUrl, setUploadedDataUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pasteTargetRef = useRef<HTMLDivElement>(null);
  const sigRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStroke, setHasStroke] = useState(false);

  const configureContext = useCallback(() => {
    const canvas = sigRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "hsl(220 60% 20%)";
    ctx.lineWidth = 2.2;
    return ctx;
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = sigRef.current;
    const wrap = canvasWrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const ctx = configureContext();
    ctx?.clearRect(0, 0, rect.width, rect.height);
    drawingRef.current = false;
    lastPointRef.current = null;
    setHasStroke(false);
  }, [configureContext]);

  // Tablet/cell friendly signature surface: we draw directly from PointerEvent
  // client coordinates mapped to the canvas' real on-screen rectangle. This
  // avoids the offset caused by dialog transforms, zoom, DPR and page scroll.
  useEffect(() => {
    if (!open || mode !== "draw") return;
    const resize = () => {
      const wrap = canvasWrapRef.current;
      const canvas = sigRef.current;
      if (!wrap || !canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      const rect = wrap.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * ratio);
      canvas.height = Math.round(rect.height * ratio);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      configureContext();
      setHasStroke(false);
    };
    const t = setTimeout(resize, 120);
    window.addEventListener("resize", resize);
    window.addEventListener("orientationchange", resize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", resize);
      window.removeEventListener("orientationchange", resize);
    };
  }, [configureContext, open, mode]);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Envie um arquivo de imagem (JPG/PNG).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setUploadedDataUrl(String(reader.result));
    reader.readAsDataURL(file);
  };

  const applyImageFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return false;
    const reader = new FileReader();
    reader.onload = () => setUploadedDataUrl(String(reader.result));
    reader.readAsDataURL(file);
    toast.success("Imagem colada.");
    return true;
  }, []);

  const readPastedSignature = useCallback((clipboardData?: DataTransfer | null) => {
    const items = clipboardData?.items;
    if (items) {
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file && applyImageFile(file)) return true;
        }
      }
    }

    const text = clipboardData?.getData("text/plain")?.trim();
    if (text?.startsWith("data:image/")) {
      setUploadedDataUrl(text);
      toast.success("Assinatura colada.");
      return true;
    }
    return false;
  }, [applyImageFile]);

  // Aceita colar imagem (Ctrl+V / print / clipboard) enquanto o diálogo estiver aberto no modo upload
  useEffect(() => {
    if (!open || mode !== "upload") return;
    const onPaste = (ev: ClipboardEvent) => {
      if (readPastedSignature(ev.clipboardData)) {
        ev.preventDefault();
      }
    };
    const t = window.setTimeout(() => pasteTargetRef.current?.focus(), 150);
    window.addEventListener("paste", onPaste);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("paste", onPaste);
    };
  }, [open, mode, readPastedSignature]);

  const handlePasteTarget = (ev: ReactClipboardEvent<HTMLDivElement>) => {
    if (readPastedSignature(ev.clipboardData)) {
      ev.preventDefault();
      ev.currentTarget.textContent = "";
    }
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = sigRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;

    const native = event.nativeEvent;
    // Em tablets Android/Chrome, clientY pode vir no viewport "layout" enquanto
    // getBoundingClientRect() vem no viewport visual; isso desloca a assinatura.
    // offsetX/Y é relativo ao próprio canvas e fica alinhado com caneta/toque.
    if (Number.isFinite(native.offsetX) && Number.isFinite(native.offsetY)) {
      return {
        x: Math.min(Math.max(native.offsetX, 0), rect.width),
        y: Math.min(Math.max(native.offsetY, 0), rect.height),
      };
    }

    const viewport = window.visualViewport;
    const offsetLeft = viewport?.offsetLeft ?? 0;
    const offsetTop = viewport?.offsetTop ?? 0;
    return {
      x: Math.min(Math.max(event.clientX - rect.left - offsetLeft, 0), rect.width),
      y: Math.min(Math.max(event.clientY - rect.top - offsetTop, 0), rect.height),
    };
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const point = getCanvasPoint(event);
    const ctx = configureContext();
    if (!point || !ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = point;
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.stroke();
    setHasStroke(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    event.preventDefault();
    const point = getCanvasPoint(event);
    const previous = lastPointRef.current;
    const ctx = configureContext();
    if (!point || !previous || !ctx) return;
    const pressure = event.pressure && event.pressure > 0 ? event.pressure : 0.5;
    ctx.lineWidth = 1.4 + pressure * 2;
    ctx.beginPath();
    ctx.moveTo(previous.x, previous.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPointRef.current = point;
    setHasStroke(true);
  };

  const stopDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    if (!nome.trim() || !cargo.trim()) {
      toast.error("Informe nome e cargo.");
      return;
    }
    let dataUrl: string | null = null;
    if (mode === "upload") {
      if (!uploadedDataUrl) {
        toast.error("Envie uma foto da assinatura.");
        return;
      }
      dataUrl = uploadedDataUrl;
    } else {
      if (!sigRef.current || !hasStroke) {
        toast.error("Desenhe sua assinatura no quadro.");
        return;
      }
      dataUrl = sigRef.current.toDataURL("image/png");
    }
    setSaving(true);
    try {
      const { uploadDataUrl } = await import("@/lib/storage");
      const url = await uploadDataUrl("assinaturas", dataUrl, "assinatura.png");
      saveSignature(storageKey, { nome: nome.trim(), cargo: cargo.trim(), dataUrl: url });
      toast.success("Assinatura padrão salva.");
      setUploadedDataUrl(null);
      setOpen(false);
    } catch (err) {
      console.error(err);
      toast.error("Falha ao salvar assinatura. Tente novamente.");
    } finally {
      setSaving(false);
    }
  };

  const remover = () => {
    deleteSignature(storageKey);
    toast.success("Assinatura removida.");
    setOpen(false);
  };

  const aplicar = () => {
    if (!saved) {
      toast.error("Cadastre sua assinatura padrão primeiro.");
      setOpen(true);
      return;
    }
    onApply?.(saved);
    toast.success(`${label} aplicada.`);
  };

  return (
    <div className={compact ? "grid gap-2" : "grid gap-2 rounded-md border bg-card p-3"}>
      {!compact && <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>}

      {saved ? (
        <div className="grid gap-1">
          <div className="rounded-md border bg-muted/30 p-2">
            <img src={saved.dataUrl} alt={`Assinatura ${saved.nome}`} className="mx-auto h-16 object-contain" />
            <div className="mt-1 border-t pt-1 text-center">
              <div className="text-sm font-semibold leading-none">{saved.nome}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{saved.cargo}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {onApply && (
              <Button size="sm" onClick={aplicar} className="tap-target gap-1">
                <CheckCircle2 className="h-4 w-4" /> {applyLabel}
              </Button>
            )}
            <Button size="sm" variant="outline" className="tap-target gap-1" onClick={() => setOpen(true)}>
              Editar
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="tap-target gap-1" onClick={() => setOpen(true)}>
          Cadastrar assinatura padrão
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assinatura padrão · {label}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label>Nome completo</Label>
              <Input className="h-11" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: João da Silva" />
            </div>
            <div>
              <Label>Cargo</Label>
              <Input className="h-11" value={cargo} onChange={(e) => setCargo(e.target.value)} placeholder="Ex.: Mecânico II" />
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Label className="mr-auto">Assinatura</Label>
                <Button size="sm" type="button" variant={mode === "upload" ? "default" : "outline"} className="gap-1 text-xs" onClick={() => setMode("upload")}>
                  <Upload className="h-3.5 w-3.5" /> Foto da assinatura
                </Button>
                <Button size="sm" type="button" variant={mode === "draw" ? "default" : "outline"} className="gap-1 text-xs" onClick={() => setMode("draw")}>
                  <PenLine className="h-3.5 w-3.5" /> Desenhar
                </Button>
              </div>

              {mode === "upload" ? (
                <div className="grid gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="block w-full rounded-md border bg-background p-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground"
                    onChange={handleFileChange}
                  />
                  <div
                    className="flex h-48 cursor-pointer items-center justify-center rounded-md border-2 border-dashed bg-muted/30 sm:h-56"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadedDataUrl ? (
                      <img src={uploadedDataUrl} alt="Prévia" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="text-center text-xs text-muted-foreground">
                        <Upload className="mx-auto mb-1 h-6 w-6" />
                        Toque para escolher a foto da assinatura<br />
                        (arquivo da galeria ou câmera)
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" type="button" onClick={() => fileInputRef.current?.click()} className="gap-1">
                      <Upload className="h-3.5 w-3.5" /> {uploadedDataUrl ? "Trocar arquivo" : "Escolher arquivo"}
                    </Button>
                    {uploadedDataUrl && (
                      <Button size="sm" variant="ghost" type="button" onClick={() => setUploadedDataUrl(null)} className="gap-1 text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /> Remover
                      </Button>
                    )}
                  </div>
                </div>

              ) : (
                <>
                  <div className="mb-1 flex justify-end">
                    <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={clearCanvas}>
                      <Eraser className="h-3.5 w-3.5" /> Limpar
                    </Button>
                  </div>
                  <div ref={canvasWrapRef} className="h-48 touch-none select-none rounded-md border-2 border-dashed bg-muted/30 sm:h-56">
                    <canvas
                      ref={sigRef}
                      className="h-full w-full touch-none rounded-md"
                      style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none" }}
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={stopDrawing}
                      onPointerCancel={stopDrawing}
                      onPointerLeave={(event) => {
                        if (drawingRef.current) stopDrawing(event);
                      }}
                    />
                  </div>
                </>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">Fica salva neste dispositivo — aplicada automaticamente quando você assinar uma OS.</p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            {saved && (
              <Button variant="ghost" size="sm" className="gap-1 text-destructive" onClick={remover}>
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            )}
            <Button onClick={salvar} className="gap-1" disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Salvando..." : "Salvar assinatura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Renderiza uma assinatura já aplicada em documento com nome/cargo. */
export function SignedBlock({ sig, dataUrl, nome, cargo, em, placeholder }: {
  sig?: SavedSignature | null;
  dataUrl?: string;
  nome?: string;
  cargo?: string;
  em?: string;
  placeholder?: string;
}) {
  const img = sig?.dataUrl ?? dataUrl;
  const n = sig?.nome ?? nome;
  const c = sig?.cargo ?? cargo;
  if (!img) return <div className="rounded-md border-2 border-dashed p-4 text-center text-xs text-muted-foreground">{placeholder ?? "Aguardando assinatura"}</div>;
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <img src={img} alt={`Assinatura ${n}`} className="mx-auto h-20 object-contain" />
      <div className="mt-1 border-t pt-1 text-center">
        <div className="text-sm font-semibold leading-none">{n}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{c}</div>
        {em && <div className="mt-0.5 text-[10px] text-muted-foreground">Assinado em {new Date(em).toLocaleString("pt-BR")}</div>}
      </div>
    </div>
  );
}
