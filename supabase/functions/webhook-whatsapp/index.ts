import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-hub-signature-256, x-evolution-signature',
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
  let workspaceId: string | null = null
  let provider = 'EVOLUTION'

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

    // Detect provider from payload shape
    // Meta Cloud API sends object.entry structure
    // Evolution API sends event + data structure
    const isMeta = !!(payload.object && payload.entry)
    provider = isMeta ? 'CLOUD' : 'EVOLUTION'

    // Extract phone number to find workspace via integration
    let senderPhone: string | null = null
    let messageText: string | null = null
    let providerMessageId: string | null = null
    let eventType = 'unknown'

    if (isMeta) {
      // Meta Cloud API format
      eventType = 'messages.upsert'
      const entry = (payload.entry as Record<string, unknown>[])?.[0]
      const changes = (entry?.changes as Record<string, unknown>[])?.[0]
      const value = changes?.value as Record<string, unknown>
      const messages = value?.messages as Record<string, unknown>[]
      if (messages?.length) {
        const msg = messages[0]
        senderPhone = msg.from as string
        messageText = (msg.text as Record<string, string>)?.body ?? null
        providerMessageId = msg.id as string
      }
    } else {
      // Evolution API format
      eventType = (payload.event as string) ?? 'unknown'
      const data = payload.data as Record<string, unknown>
      const key = data?.key as Record<string, unknown>
      senderPhone = (key?.remoteJid as string)?.replace('@s.whatsapp.net', '').replace('@g.us', '') ?? null
      const message = data?.message as Record<string, unknown>
      messageText = (message?.conversation as string) ?? (message?.extendedTextMessage as Record<string, string>)?.text ?? null
      providerMessageId = key?.id as string
    }

    // Find workspace by matching the integration's instance
    // For Evolution: use the instance from payload
    // We look for any active integration of the right provider
    const instanceName = isMeta ? null : ((payload.data as Record<string, unknown>)?.instance as string) ?? null

    let integrationQuery = supabase
      .from('integrations')
      .select('workspace_id, webhook_secret, api_key_encrypted, api_url, instance_id, phone_number')
      .eq('provider', provider)
      .eq('is_active', true)

    if (instanceName) {
      integrationQuery = integrationQuery.eq('instance_id', instanceName)
    }

    const { data: integrations } = await integrationQuery.limit(10)

    if (!integrations?.length) {
      return new Response(JSON.stringify({ error: 'No active integration found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // HMAC-SHA256 signature validation
    const integration = integrations[0]
    workspaceId = integration.workspace_id

    if (integration.webhook_secret) {
      const sigHeader = req.headers.get('x-hub-signature-256') ?? req.headers.get('x-evolution-signature')
      if (sigHeader) {
        const key = await crypto.subtle.importKey(
          'raw',
          new TextEncoder().encode(integration.webhook_secret),
          { name: 'HMAC', hash: 'SHA-256' },
          false,
          ['verify']
        )
        const sigBytes = sigHeader.startsWith('sha256=')
          ? hexToBytes(sigHeader.slice(7))
          : hexToBytes(sigHeader)
        const bodyBytes = new TextEncoder().encode(rawBody)
        const valid = await crypto.subtle.verify('HMAC', key, sigBytes, bodyBytes)
        if (!valid) {
          return new Response(JSON.stringify({ error: 'Invalid signature' }), {
            status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // Log the webhook
    const { data: logRow } = await supabase.from('webhook_logs').insert({
      provider,
      event_type: eventType,
      payload_json: payload,
      workspace_id: workspaceId,
      status: 'processing',
    }).select('id').single()
    logId = logRow?.id ?? null

    // Only process message events
    if (!eventType.includes('messages') && !eventType.includes('message')) {
      await supabase.from('webhook_logs').update({ status: 'ignored' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!senderPhone || !providerMessageId) {
      await supabase.from('webhook_logs').update({ status: 'ignored', error: 'No sender or message id' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Idempotency check
    const { data: existing } = await supabase
      .from('processed_webhook_events')
      .select('id')
      .eq('provider_message_id', providerMessageId)
      .eq('workspace_id', workspaceId)
      .maybeSingle()

    if (existing) {
      await supabase.from('webhook_logs').update({ status: 'duplicate' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true, duplicate: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Whitelist check
    const phoneE164 = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`
    const { data: whitelist } = await supabase
      .from('whitelist_numbers')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('phone_e164', phoneE164)
      .eq('is_active', true)
      .maybeSingle()

    if (!whitelist) {
      await supabase.from('webhook_logs').update({ status: 'blocked', error: 'Phone not in whitelist' }).eq('id', logId!)
      return new Response(JSON.stringify({ ok: true, blocked: true }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Upsert conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('contact_phone', phoneE164)
      .maybeSingle()

    let conversationId: string
    if (existingConv) {
      conversationId = existingConv.id
      await supabase.from('conversations').update({
        last_message_at: new Date().toISOString(),
        provider,
      }).eq('id', conversationId)
    } else {
      const { data: newConv } = await supabase.from('conversations').insert({
        workspace_id: workspaceId,
        contact_phone: phoneE164,
        provider,
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
      provider_message_id: providerMessageId,
      timestamp: new Date().toISOString(),
    })

    // Mark as processed
    await supabase.from('processed_webhook_events').insert({
      provider_message_id: providerMessageId,
      workspace_id: workspaceId,
    })

    // Update log
    await supabase.from('webhook_logs').update({ status: 'ok' }).eq('id', logId!)

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('webhook-whatsapp error:', err)
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

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}
