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
    const isMeta = !!(payload.object && payload.entry)
    provider = isMeta ? 'CLOUD' : 'EVOLUTION'

    let senderPhone: string | null = null
    let messageText: string | null = null
    let providerMessageId: string | null = null
    let eventType = 'unknown'
    let messageType = 'text'
    let mediaUrl: string | null = null
    let mediaBase64: string | null = null
    let mediaMime: string | null = null

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
        providerMessageId = msg.id as string
        const msgType = msg.type as string

        if (msgType === 'text') {
          messageType = 'text'
          messageText = (msg.text as Record<string, string>)?.body ?? null
        } else if (msgType === 'audio') {
          messageType = 'audio'
          mediaUrl = (msg.audio as Record<string, string>)?.id ?? null // Meta uses media ID
          mediaMime = 'audio/ogg'
        } else if (msgType === 'image') {
          messageType = 'image'
          const imgCaption = (msg.image as Record<string, string>)?.caption ?? null
          messageText = imgCaption
          mediaUrl = (msg.image as Record<string, string>)?.id ?? null
          mediaMime = 'image/jpeg'
        } else if (msgType === 'document') {
          messageType = 'document'
          mediaUrl = (msg.document as Record<string, string>)?.id ?? null
          mediaMime = (msg.document as Record<string, string>)?.mime_type ?? 'application/octet-stream'
        } else if (msgType === 'video') {
          messageType = 'video'
          mediaUrl = (msg.video as Record<string, string>)?.id ?? null
          mediaMime = 'video/mp4'
        } else if (msgType === 'sticker') {
          messageType = 'sticker'
        }
      }
    } else {
      // Evolution API format
      eventType = (payload.event as string) ?? 'unknown'
      const data = payload.data as Record<string, unknown>
      const key = data?.key as Record<string, unknown>
      senderPhone = (key?.remoteJid as string)?.replace('@s.whatsapp.net', '').replace('@g.us', '') ?? null
      providerMessageId = key?.id as string
      const message = data?.message as Record<string, unknown>

      // Extract base64 if provided by Evolution
      mediaBase64 = (data?.base64 as string) ?? null

      if (message?.conversation || message?.extendedTextMessage) {
        messageType = 'text'
        messageText = (message?.conversation as string) ?? (message?.extendedTextMessage as Record<string, string>)?.text ?? null
      } else if (message?.audioMessage) {
        messageType = 'audio'
        const audioMsg = message.audioMessage as Record<string, unknown>
        mediaUrl = audioMsg?.url as string ?? null
        mediaMime = (audioMsg?.mimetype as string) ?? 'audio/ogg'
        // For PTT (push-to-talk voice notes)
        if (audioMsg?.ptt) messageType = 'audio'
      } else if (message?.imageMessage) {
        messageType = 'image'
        const imgMsg = message.imageMessage as Record<string, unknown>
        mediaUrl = imgMsg?.url as string ?? null
        mediaMime = (imgMsg?.mimetype as string) ?? 'image/jpeg'
        messageText = (imgMsg?.caption as string) ?? null
      } else if (message?.documentMessage) {
        messageType = 'document'
        const docMsg = message.documentMessage as Record<string, unknown>
        mediaUrl = docMsg?.url as string ?? null
        mediaMime = (docMsg?.mimetype as string) ?? 'application/octet-stream'
        messageText = (docMsg?.fileName as string) ?? null
      } else if (message?.videoMessage) {
        messageType = 'video'
        const vidMsg = message.videoMessage as Record<string, unknown>
        mediaUrl = vidMsg?.url as string ?? null
        mediaMime = (vidMsg?.mimetype as string) ?? 'video/mp4'
        messageText = (vidMsg?.caption as string) ?? null
      } else if (message?.stickerMessage) {
        messageType = 'sticker'
        mediaUrl = (message.stickerMessage as Record<string, unknown>)?.url as string ?? null
      } else if (message?.reactionMessage) {
        // Ignore reactions
        return new Response(JSON.stringify({ ok: true, ignored: 'reaction' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Find workspace by matching the integration's instance
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

    const integration = integrations[0]
    workspaceId = integration.workspace_id

    // HMAC-SHA256 signature validation
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
    const { count: whitelistCount } = await supabase
      .from('whitelist_numbers')
      .select('id', { count: 'exact' })
      .eq('workspace_id', workspaceId)
      .eq('is_active', true)

    if (whitelistCount && whitelistCount > 0) {
      const { data: whitelistMatch } = await supabase
        .from('whitelist_numbers')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('phone_e164', phoneE164)
        .eq('is_active', true)
        .maybeSingle()

      if (!whitelistMatch) {
        await supabase.from('webhook_logs').update({ status: 'whitelist_blocked', error: `Phone ${phoneE164} not in whitelist` }).eq('id', logId!)
        return new Response(JSON.stringify({ ok: true, blocked: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Upsert conversation
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('contact_phone', phoneE164)
      .maybeSingle()

    // Look up contact name from contacts table
    const { data: contactRow } = await supabase
      .from('contacts')
      .select('name')
      .eq('workspace_id', workspaceId)
      .eq('phone_e164', phoneE164)
      .maybeSingle()
    const contactName = contactRow?.name ?? null

    let conversationId: string
    if (existingConv) {
      conversationId = existingConv.id
      const updatePayload: Record<string, unknown> = { last_message_at: new Date().toISOString(), provider }
      if (contactName) updatePayload.contact_name = contactName
      await supabase.from('conversations').update(updatePayload).eq('id', conversationId)
    } else {
      const { data: newConv, error: convErr } = await supabase.from('conversations').insert({
        workspace_id: workspaceId,
        contact_phone: phoneE164,
        contact_name: contactName,
        provider,
        last_message_at: new Date().toISOString(),
      }).select('id').single()

      if (convErr || !newConv) {
        // Race condition: retry fetch
        const { data: retryConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('workspace_id', workspaceId)
          .eq('contact_phone', phoneE164)
          .maybeSingle()
        if (!retryConv) throw new Error(`Failed to create/find conversation: ${convErr?.message ?? 'unknown'}`)
        conversationId = retryConv.id
        const retryUpdate: Record<string, unknown> = { last_message_at: new Date().toISOString(), provider }
        if (contactName) retryUpdate.contact_name = contactName
        await supabase.from('conversations').update(retryUpdate).eq('id', conversationId)
      } else {
        conversationId = newConv.id
      }
    }

    // Insert message
    await supabase.from('messages').insert({
      workspace_id: workspaceId,
      conversation_id: conversationId,
      direction: 'IN',
      type: messageType,
      body_text: messageText,
      provider_message_id: providerMessageId,
      media_url: mediaUrl,
      timestamp: new Date().toISOString(),
    })

    // Mark as processed
    await supabase.from('processed_webhook_events').insert({
      provider_message_id: providerMessageId,
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
        sender_phone: phoneE164,
        provider,
        message_type: messageType,
        media_url: mediaUrl,
        media_base64: mediaBase64,
        media_mime: mediaMime,
      }),
    }).catch((e) => console.error('process-message fire-and-forget error:', e))

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
