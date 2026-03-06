import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-telegram-bot-api-secret-token',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  let logId: string | null = null

  try {
    const rawBody = await req.text()
    let payload: Record<string, unknown>

    try {
      payload = JSON.parse(rawBody)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Find all active Telegram integrations
    const { data: integrations } = await supabase
      .from('integrations')
      .select('workspace_id, webhook_secret, telegram_bot_token_encrypted, telegram_chat_id')
      .eq('provider', 'TELEGRAM')
      .eq('is_active', true)
      .limit(10)

    if (!integrations?.length) {
      return new Response(JSON.stringify({ error: 'No active Telegram integration' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate secret token from header
    const secretToken = req.headers.get('x-telegram-bot-api-secret-token')
    const integration = integrations.find(i =>
      !i.webhook_secret || i.webhook_secret === secretToken
    )

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Invalid secret token' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const workspaceId = integration.workspace_id

    // Log the webhook
    const { data: logRow } = await supabase.from('webhook_logs').insert({
      provider: 'TELEGRAM',
      event_type: 'message',
      payload_json: payload,
      workspace_id: workspaceId,
      status: 'processing',
    }).select('id').single()
    logId = logRow?.id ?? null

    // Extract message data
    const message = payload.message as Record<string, unknown>
    if (!message) {
      await supabase.from('webhook_logs').update({ status: 'ignored' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const from = message.from as Record<string, unknown>
    const chat = message.chat as Record<string, unknown>
    const messageId = String(message.message_id)
    const chatId = String(chat?.id ?? '')
    const senderName = [from?.first_name, from?.last_name].filter(Boolean).join(' ') || 'Telegram User'
    const messageText = (message.text as string) ?? null

    if (!chatId || !messageId) {
      await supabase.from('webhook_logs').update({ status: 'ignored', error: 'No chat or message id' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('processed_webhook_events')
      .select('id')
      .eq('provider_message_id', `tg_${messageId}`)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (existing) {
      await supabase.from('webhook_logs').update({ status: 'duplicate' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert conversation (use chatId as phone identifier for Telegram)
    const telegramIdentifier = `tg:${chatId}`
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('contact_phone', telegramIdentifier)
      .maybeSingle()

    let conversationId: string
    if (existingConv) {
      conversationId = existingConv.id
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        contact_name: senderName,
      }).eq('id', conversationId)
    } else {
      const { data: newConv } = await supabase.from('conversations').insert({
        workspace_id: workspaceId,
        contact_phone: telegramIdentifier,
        contact_name: senderName,
        provider: 'TELEGRAM',
        last_message_at: new Date().toISOString(),
      }).select('id').single()
      conversationId = newConv!.id
    }

    // Insert message
    await supabase.from('messages').insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: 'IN',
      type: 'text',
      body_text: messageText,
      provider_message_id: `tg_${messageId}`,
      timestamp: new Date().toISOString(),
    })

    // Mark as processed
    await supabase.from('processed_webhook_events').insert({
      provider_message_id: `tg_${messageId}`,
      workspace_id: workspaceId,
    })

    // Update log
    await supabase.from('webhook_logs').update({ status: 'ok' }).eq('id', logId!)

    // Fire-and-forget: AI processing
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    fetch(`${supabaseUrl}/functions/v1/process-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workspace_id: workspaceId,
        conversation_id: conversationId,
        message_text: messageText,
        sender_phone: telegramIdentifier,
        provider: 'TELEGRAM',
      }),
    }).catch((e) => console.error('process-message fire-and-forget error:', e))

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('webhook-telegram error:', err)
    if (logId) {
      const supabase2 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
      await supabase2.from('webhook_logs').update({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      }).eq('id', logId)
    }
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
