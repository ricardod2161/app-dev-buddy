import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY)
      throw new Error("Supabase env not configured");

    const body = await req.json();
    const {
      messages,
      model = "google/gemini-3-flash-preview",
      workspace_id,
      include_context = false,
      deep_think = false,
    } = body;

    if (!messages || !Array.isArray(messages)) {
      throw new Error("messages array is required");
    }

    // Build system prompt
    const todayBR = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
    const nowBR = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    let systemContent = `## PERSONA — Buddy Financeiro Pessoal do Paulo 🤝

Você é o assistente pessoal de *Paulo Ricardo Dantas de Lima* — amigo de 15 anos, contador expert + dev sênior. Fale como irmão do RN: direto, leve, mistura nordestino com carioca. Use "mano", "salvo", "bora", "desculpa a confusão anterior" quando natural.

### DADOS DO PAULO
- **Nome:** Paulo | **Cidade:** Alexandria/RN
- **Meta diária de reserva:** R$ 40,00
- **Data atual:** ${todayBR} | **Hora:** ${nowBR}
- **Idioma:** 100% português brasileiro

---

## FORMATO OBRIGATÓRIO DE RESPOSTA (nunca altere o layout)

### Ao registrar reserva/gasto:
✅ Reserva registrada! R$ 40,00 adicionados à sua meta diária de hoje. Desculpa a confusão anterior, agora está salvo! (total: R$ 40,00).

Gastos — Hoje:

• Gasto com Reserva (${todayBR}) — R$ 40,00 (${todayBR})

Total: R$ 40,00

---

Sempre termine com: "Quer filtro só reservas? Só gastos? Gráfico? Total guardado? Só falar."

### Ao pedir relatório do mês:
Gastos — Este mês:

• [bullet por gasto, formato: Descrição (DD/MM) — R$ valor (DD/MM)]

Total: R$ valor

### Ao pedir "o que estou guardando":
Estou filtrando todas as suas notas de reserva...

1. Gasto com Reserva (DD/MM) (Financeiro)
   • Reserva Diária (Meta Anual): R$ 40,00...

2. [próxima reserva...]

---

## EXEMPLOS OBRIGATÓRIOS (reproduza 1:1)

- "E os 40?" → ✅ Reserva registrada! R$ 40,00 adicionados à sua meta diária de hoje. Desculpa a confusão anterior, agora está salvo! (total: R$ 40,00).\n\nGastos — Hoje:\n\n• Gasto com Reserva (${todayBR}) — R$ 40,00 (${todayBR})\n\nTotal: R$ 40,00
- "Mim der o relatório diário" → resposta com ✅ + Gastos — Hoje: + Total
- "Mim der o relatório completo" → lista completa Gastos — Este mês com todos os bullets
- "Eu quero o que estou guardando" → lista numerada 1. 2. com filtro só de reservas
- "Nenhum gasto registrado hoje." → confirme exatamente assim quando não houver

---

## REGRAS OBRIGATÓRIAS (nunca quebre nenhuma)

1. Toda mensagem com R$, "reserva", "gasto", "recebi", "Mim der", "relatório", "guardando", "gastei", "comprei", "paguei", "despesa" → processe automaticamente no formato acima
2. Datas SEMPRE no formato DD/MM (ex: 22/03, 19/03)
3. Confirmações SEMPRE com ✅ (sucesso) ou 🔴 (erro)
4. Use gírias leves: "mano", "salvo", "bora"
5. Meta diária R$40 é memória permanente — nunca esqueça
6. NUNCA mude o layout do formato acima

---

## AÇÕES AUTÔNOMAS — OBRIGATÓRIO

Ao registrar qualquer gasto/reserva, inclua ao FINAL da resposta:

[ACTION:create_note|title=Gasto com Reserva (${todayBR})|content=• Reserva Diária (Meta Anual): R$ 40,00|category=Financeiro]

Para outros gastos:
[ACTION:create_note|title=Gasto com [item] (${todayBR})|content=• [item]: R$ valor|category=Financeiro]
[ACTION:create_task|title=Título da tarefa|priority=medium|due=YYYY-MM-DD|project=Nome]
[ACTION:create_reminder|message=Texto do lembrete|title=Título|remind_at=YYYY-MM-DDTHH:mm|channel=whatsapp]

Regras para ações:
- priority: low, medium ou high
- remind_at no formato ISO 8601
- Campos opcionais podem ser omitidos
- NUNCA coloque [ACTION:...] no meio do texto — apenas no final
- Sempre confirme na resposta o que foi criado
- category financeira SEMPRE = "Financeiro" (nunca "Finanças")

---

## CAPACIDADES ZYNTRA (mantidas)

- Organizar tarefas, notas, lembretes e projetos
- Analisar código, arquitetura de software
- Gerar ideias, brainstorming, revisar textos
- Responder perguntas técnicas e gerais
- Em caso de ambiguidade: faça APENAS uma pergunta de esclarecimento`;

    if (deep_think) {
      systemContent = `${systemContent}

MODO DEEP THINK ATIVADO:
Você deve raciocinar passo a passo antes de responder. 
1. Analise o problema em profundidade
2. Considere múltiplas perspectivas e abordagens
3. Identifique possíveis armadilhas ou edge cases
4. Apresente sua conclusão de forma clara e estruturada
Use "**Raciocínio:**" para mostrar seu processo de pensamento antes da resposta final.`;
    }

    // Inject workspace context if requested
    if (include_context && workspace_id) {
      try {
        const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

        const [notesResult, tasksResult, wsResult] = await Promise.all([
          sb
            .from("notes")
            .select("title, content, category, created_at")
            .eq("workspace_id", workspace_id)
            .order("created_at", { ascending: false })
            .limit(5),
          sb
            .from("tasks")
            .select("title, status, priority, due_at, project")
            .eq("workspace_id", workspace_id)
            .in("status", ["todo", "doing"])
            .order("created_at", { ascending: false })
            .limit(5),
          sb
            .from("workspace_settings")
            .select("bot_name, bot_personality, timezone")
            .eq("workspace_id", workspace_id)
            .single(),
        ]);

        const notes = notesResult.data ?? [];
        const tasks = tasksResult.data ?? [];
        const ws = wsResult.data;

        if (ws?.bot_personality) {
          systemContent += `\n\nPersonalidade adicional: ${ws.bot_personality}`;
        }

        if (notes.length > 0) {
          systemContent += `\n\n## Notas recentes do usuário (${notes.length}):`;
          notes.forEach((n: Record<string, unknown>, i: number) => {
            systemContent += `\n${i + 1}. **${n.title || "Sem título"}** (${n.category || "sem categoria"}): ${String(n.content || "").substring(0, 200)}`;
          });
        }

        if (tasks.length > 0) {
          systemContent += `\n\n## Tarefas abertas do usuário (${tasks.length}):`;
          tasks.forEach((t: Record<string, unknown>, i: number) => {
            const due = t.due_at
              ? ` — prazo: ${new Date(t.due_at as string).toLocaleDateString("pt-BR")}`
              : "";
            systemContent += `\n${i + 1}. [${t.status}/${t.priority}] **${t.title}**${due}${t.project ? ` (projeto: ${t.project})` : ""}`;
          });
        }

        systemContent += `\n\nIMPORTANTE: Antes de criar uma nova tarefa ou nota, verifique se já existe alguma similar na lista acima para evitar duplicatas. Se já existir, ofereça atualizar a existente.`;
        systemContent += `\n\nUse esse contexto para dar respostas mais personalizadas e relevantes quando o usuário mencionar suas tarefas ou notas.`;
      } catch (contextErr) {
        console.warn("Failed to load context:", contextErr);
        // Continue without context
      }
    }

    const finalMessages = [
      { role: "system", content: systemContent },
      ...messages,
    ];

    const selectedModel = deep_think ? "google/gemini-2.5-pro" : model;

    const gatewayResponse = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: finalMessages,
          stream: true,
          temperature: 0.3,
          top_p: 0.85,
          max_tokens: 1200,
        }),
      }
    );

    if (!gatewayResponse.ok) {
      if (gatewayResponse.status === 429) {
        return new Response(
          JSON.stringify({
            error:
              "Rate limit atingido. Aguarde alguns instantes antes de tentar novamente.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      if (gatewayResponse.status === 402) {
        return new Response(
          JSON.stringify({
            error:
              "Créditos insuficientes. Adicione créditos ao seu workspace Lovable.",
          }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
      const errText = await gatewayResponse.text();
      console.error("Gateway error:", gatewayResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Erro no gateway de IA" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(gatewayResponse.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (err) {
    console.error("ai-chat error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
