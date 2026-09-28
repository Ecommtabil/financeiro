import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Fluxo Escritório & Casa" },
      { name: "description", content: "Acesse seu controle financeiro do escritório e da casa." },
      { property: "og:title", content: "Entrar · Fluxo Escritório & Casa" },
      { property: "og:description", content: "Acesse seu controle financeiro do escritório e da casa." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [modo, setModo] = useState<"entrar" | "criar">("entrar");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => data.user && navigate({ to: "/" }));
  }, [navigate]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null); setMsg(null); setCarregando(true);
    if (modo === "entrar") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
      if (error) setErro("E-mail ou senha incorretos.");
      else navigate({ to: "/" });
    } else {
      const { error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: window.location.origin } });
      if (error) setErro(error.message);
      else setMsg("Conta criada. Confira seu e-mail para confirmar o cadastro.");
    }
    setCarregando(false);
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4">
      <form onSubmit={enviar} className="surface-card w-full max-w-sm space-y-4 p-6">
        <div>
          <p className="label-eyebrow">Fluxo Escritório & Casa</p>
          <h1 className="mt-1 text-xl font-semibold">{modo === "entrar" ? "Entrar" : "Criar conta"}</h1>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="senha">Senha</Label>
          <Input id="senha" type="password" required minLength={6} value={senha} onChange={(e) => setSenha(e.target.value)} />
        </div>
        {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
        {msg ? <p className="text-sm text-muted-foreground">{msg}</p> : null}
        <Button type="submit" className="w-full" disabled={carregando}>
          {carregando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
        </Button>
        <button type="button" className="w-full text-sm text-muted-foreground hover:text-foreground" onClick={() => setModo(modo === "entrar" ? "criar" : "entrar")}>
          {modo === "entrar" ? "Não tem conta? Criar agora" : "Já tem conta? Entrar"}
        </button>
      </form>
    </div>
  );
}
