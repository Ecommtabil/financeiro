import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { GRUPOS_DRE, type GrupoDRE } from "./calc";

const RUN_HEADER = "X-Lovable-AIG-Run-ID";

function runIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has(RUN_HEADER)) headers.set(RUN_HEADER, runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get(RUN_HEADER)?.trim() || undefined;
    return res;
  };
}

export type SugestaoDRE = { grupo: GrupoDRE; motivo: string };

export async function sugerirLinhaDRE(apiKey: string, categoria: string, descricao: string): Promise<SugestaoDRE> {
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch(),
  });
  const opcoes = GRUPOS_DRE.map((g) => `${g.id} = ${g.rotulo}`).join("\n");
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system:
      "Você é contador de um escritório de contabilidade brasileiro. Classifique uma categoria de despesa do escritório numa linha da DRE. " +
      `Opções (use o código):\n${opcoes}\n` +
      'Responda APENAS com JSON: {"grupo":"CODIGO","motivo":"uma frase curta em português, até 200 caracteres"}.',
    prompt: `Categoria: ${categoria || "(sem nome)"}\nDescrição do gestor: ${descricao}`,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "low",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });
  const texto = await result.text;
  const m = texto.match(/\{[\s\S]*\}/);
  let obj: { grupo?: string; motivo?: string } = {};
  try { obj = m ? JSON.parse(m[0]) : {}; } catch { /* resposta inválida */ }
  const grupo = GRUPOS_DRE.find((g) => g.id === String(obj.grupo ?? "").toUpperCase().trim())?.id;
  if (!grupo) throw new Error("A IA não retornou uma linha válida. Tente descrever a despesa de outro jeito.");
  return { grupo, motivo: String(obj.motivo ?? "").slice(0, 240) };
}
