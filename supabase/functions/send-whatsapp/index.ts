import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    const body = await req.json().catch(() => ({}))
    const { workspace_id, phone, text } = body

    if (!workspace_id || !phone || !text) {
      return new Response(JSON.stringify({ error: 'workspace_id, phone e text são obrigatórios' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Buscar integração ativa
    const { data: integration } = await supabase
      .from('integrations')
      .select('*')
      .eq('workspace_id', workspace_id)
      .eq('is_active', true)
      .limit(1)
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Nenhuma integração ativa encontrada' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let success = false
    let messageId = null

    if (integration.provider === 'EVOLUTION') {
      const res = await fetch(`${integration.api_url}/message/sendText/${integration.instance_id}`, {
        method: 'POST',
        headers: { 'apikey': integration.api_key_encrypted ?? '', 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone, text }),
      })
      const data = await res.json()
      success = res.ok
      messageId = data?.key?.id
    } else if (integration.provider === 'CLOUD') {
      const res = await fetch(`https://graph.facebook.com/v19.0/${integration.phone_number}/messages`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${integration.api_key_encrypted}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messaging_product: 'whatsapp', to: phone, type: 'text', text: { body: text } }),
      })
      const data = await res.json()
      success = res.ok
      messageId = data?.messages?.[0]?.id
    } else if (integration.provider === 'TELEGRAM') {
      const res = await fetch(`https://api.telegram.org/bot${integration.telegram_bot_token_encrypted}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: phone, text }),
      })
      const data = await res.json()
      success = data?.ok === true
      messageId = data?.result?.message_id?.toString()
    }

    if (success) {
      // Salvar mensagem OUT
      const { data: conv } = await supabase
        .from('conversations')
        .select('id')
        .eq('workspace_id', workspace_id)
        .eq('contact_phone', phone)
        .single()

      if (conv) {
        await supabase.from('messages').insert({
          workspace_id,
          conversation_id: conv.id,
          direction: 'OUT',
          type: 'text',
          body_text: text,
          provider_message_id: messageId,
          timestamp: new Date().toISOString(),
        })
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', conv.id)
      }

      return new Response(JSON.stringify({ success: true, message_id: messageId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    } else {
      throw new Error('Falha ao enviar mensagem via provider')
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
