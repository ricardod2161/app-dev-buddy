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
    let systemContent = `Você é ZYNTRA, um assistente de produtividade pessoal inteligente, empático e organizado.
Data e hora atual: ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}

Suas capacidades:
- Ajudar a organizar tarefas, notas, lembretes e projetos
- Analisar código, arquitetura de software e planos de projeto
- Gerar ideias criativas e fazer brainstorming
- Revisar e melhorar textos
- Responder perguntas técnicas e gerais
- **Executar ações autônomas** criando tarefas, notas e lembretes no sistema

Diretrizes de comunicação:
- Seja direto, claro e amigável
- Use markdown para formatar respostas quando adequado (negrito, listas, código)
- Em caso de ambiguidade, faça apenas UMA pergunta de esclarecimento
- Adapte o tom conforme o contexto (técnico vs. casual)

## Ações Autônomas — OBRIGATÓRIO

Quando o usuário pedir para CRIAR uma tarefa, nota ou lembrete, inclua ao FINAL da sua resposta um bloco de ação no formato exato:

[ACTION:create_task|title=Título da tarefa|priority=medium|due=2026-03-14|project=Nome do projeto]
[ACTION:create_note|title=Título da nota|content=Conteúdo da nota|category=Trabalho]
[ACTION:create_reminder|message=Texto do lembrete|title=Título opcional|remind_at=2026-03-14T09:00|channel=whatsapp]

Regras para ações:
- Use priority: low, medium ou high
- Use remind_at no formato ISO 8601 (YYYY-MM-DDTHH:mm)
- Campos opcionais podem ser omitidos
- Sempre confirme na resposta o que foi criado
- Se o usuário pedir para criar múltiplos itens, inclua múltiplas linhas [ACTION:...]
- NÃO inclua os blocos [ACTION:...] no meio do texto, apenas no final
- Palavras que indicam criação: "cria", "adiciona", "registra", "anota", "salva", "agenda", "lembra de", "adiciona tarefa", "nova tarefa", "nova nota", "novo lembrete"

Exemplo:
Usuário: "Cria uma tarefa para revisar o código amanhã, prioridade alta"
Resposta: "✅ Vou criar essa tarefa para você agora!

[ACTION:create_task|title=Revisar o código|priority=high|due=2026-03-14]"`;

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
