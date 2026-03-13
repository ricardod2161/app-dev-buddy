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
          mediaUrl = (msg.audio as Record<string, string>)?.id ?? null
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

      // Skip messages from self (fromMe = true)
      if (key?.fromMe === true) {
        return new Response(JSON.stringify({ ok: true, ignored: 'fromMe' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

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
        return new Response(JSON.stringify({ ok: true, ignored: 'reaction' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      } else if (!message || Object.keys(message).length === 0) {
        // Empty or unknown message type - ignore
        return new Response(JSON.stringify({ ok: true, ignored: 'empty_message' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // ── Find workspace via integration ───────────────────────────────────────
    // Strategy: try to match by instance_id first, then fall back to any active integration
    const instanceName = isMeta ? null : ((payload.data as Record<string, unknown>)?.instance as string) ?? null

    console.log(`[webhook] provider=${provider} event=${eventType} instance=${instanceName} sender=${senderPhone} msgType=${messageType}`)

    let integration: Record<string, unknown> | null = null

    // Try exact instance_id match first
    if (instanceName) {
      const { data: exactMatch } = await supabase
        .from('integrations')
        .select('workspace_id, webhook_secret, api_key_encrypted, api_url, instance_id, phone_number')
        .eq('provider', provider)
        .eq('is_active', true)
        .eq('instance_id', instanceName)
        .limit(1)
        .maybeSingle()
      integration = exactMatch
    }

    // Fallback: any active integration for provider (handles renamed instances)
    if (!integration) {
      const { data: fallbackMatch } = await supabase
        .from('integrations')
        .select('workspace_id, webhook_secret, api_key_encrypted, api_url, instance_id, phone_number')
        .eq('provider', provider)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle()
      integration = fallbackMatch
      if (integration) {
        console.log(`[webhook] Using fallback integration (instance mismatch: got "${instanceName}", have "${integration.instance_id}")`)
      }
    }

    if (!integration) {
      console.error('[webhook] No active integration found for provider:', provider, 'instance:', instanceName)
      return new Response(JSON.stringify({ error: 'No active integration found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    workspaceId = integration.workspace_id as string

    // HMAC-SHA256 signature validation (only if header is present AND secret is set)
    if (integration.webhook_secret) {
      const sigHeader = req.headers.get('x-hub-signature-256') ?? req.headers.get('x-evolution-signature')
      if (sigHeader) {
        try {
          const key = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(integration.webhook_secret as string),
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
            console.warn('[webhook] Invalid signature — rejecting request')
            return new Response(JSON.stringify({ error: 'Invalid signature' }), {
              status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            })
          }
        } catch (sigErr) {
          console.warn('[webhook] Signature validation error (continuing):', sigErr)
          // Don't block on signature errors — log and continue
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
    const isMessageEvent = eventType.toLowerCase().includes('message') || eventType === 'unknown'
    if (!isMessageEvent) {
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

    // ── Phone normalization: cobre formato 8 dígitos (antigo) e 9 dígitos (novo) ──
    const phoneE164 = senderPhone.startsWith('+') ? senderPhone : `+${senderPhone}`
    const phoneVariants = getNormalizedVariants(phoneE164)
    // Usa a variante canônica (preferência pelo formato com 9º dígito para BR)
    const canonicalPhone = phoneVariants.find(v => /^\+55\d{2}9\d{8}$/.test(v)) ?? phoneE164
    console.log(`[webhook] phoneE164=${phoneE164} variants=${phoneVariants.join(',')} canonical=${canonicalPhone}`)

    // Whitelist check
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
        .in('phone_e164', phoneVariants)
        .eq('is_active', true)
        .maybeSingle()

      if (!whitelistMatch) {
        console.warn(`[webhook] Whitelist block: variants=${phoneVariants.join(',')} not found`)
        await supabase.from('webhook_logs').update({ status: 'whitelist_blocked', error: `Phone ${canonicalPhone} not in whitelist` }).eq('id', logId!)
        return new Response(JSON.stringify({ ok: true, blocked: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
    }

    // Upsert conversation — busca por qualquer variante do número
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('id, contact_phone')
      .eq('workspace_id', workspaceId)
      .in('contact_phone', phoneVariants)
      .maybeSingle()

    const { data: contactRow } = await supabase
      .from('contacts')
      .select('name')
      .eq('workspace_id', workspaceId)
      .in('phone_e164', phoneVariants)
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
        contact_phone: canonicalPhone,
        contact_name: contactName,
        provider,
        last_message_at: new Date().toISOString(),
      }).select('id').single()

      if (convErr || !newConv) {
        const { data: retryConv } = await supabase
          .from('conversations')
          .select('id')
          .eq('workspace_id', workspaceId)
          .in('contact_phone', phoneVariants)
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

    // ── Fetch base64 from Evolution API for encrypted media ──────────────────
    if (provider === 'EVOLUTION' && ['audio', 'image', 'document', 'video'].includes(messageType) && !mediaBase64 && integration.api_url && integration.api_key_encrypted && integration.instance_id) {
      try {
        console.log(`[webhook] Fetching base64 for ${messageType} ${providerMessageId}`)
        const b64Res = await fetch(
          `${integration.api_url}/chat/getBase64FromMediaMessage/${integration.instance_id}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': integration.api_key_encrypted as string,
            },
            body: JSON.stringify({
              message: {
                key: {
                  id: providerMessageId,
                  remoteJid: senderPhone + '@s.whatsapp.net',
                  fromMe: false,
                },
              },
              convertToMp4: false,
            }),
          }
        )
        if (b64Res.ok) {
          const b64Data = await b64Res.json()
          const fetchedBase64 = b64Data.base64 ?? b64Data.data ?? null
          const fetchedMime = b64Data.mediaType ?? b64Data.mimetype ?? b64Data.mime ?? mediaMime
          if (fetchedBase64) {
            mediaBase64 = fetchedBase64
            mediaMime = fetchedMime
            console.log(`[webhook] Base64 fetched: mime=${fetchedMime}, size=${fetchedBase64.length}`)
          } else {
            console.warn('[webhook] Evolution getBase64 returned no base64:', JSON.stringify(b64Data).slice(0, 200))
          }
        } else {
          console.warn(`[webhook] Evolution getBase64 failed (${b64Res.status}):`, await b64Res.text().then(t => t.slice(0, 200)))
        }
      } catch (e) {
        console.error('[webhook] Failed to fetch media base64:', e)
      }
    }

    // Fire-and-forget: AI processing
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!

    console.log(`[webhook] Dispatching process-message for conv=${conversationId} type=${messageType}`)

    fetch(`${supabaseUrl}/functions/v1/process-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
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
        provider_message_id: providerMessageId,
        log_id: logId,
      }),
    }).catch((e) => console.error('[webhook] process-message dispatch error:', e))

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err) {
    console.error('[webhook] Fatal error:', err)
    if (logId) {
      try {
        const supabase2 = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
        await supabase2.from('webhook_logs').update({
          status: 'error',
          error: err instanceof Error ? err.message : String(err),
        }).eq('id', logId)
      } catch (_) { /* ignore */ }
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

/**
 * Normaliza números brasileiros para cobrir o formato antigo (8 dígitos)
 * e o novo (9 dígitos). O Evolution às vezes envia sem o nono dígito,
 * enquanto o banco armazena com. Retorna ambas as variantes.
 */
function getNormalizedVariants(phone: string): string[] {
  const withPlus = phone.startsWith('+') ? phone : `+${phone}`
  const stripped = withPlus.slice(1) // sem o '+'
  const variants = new Set<string>([withPlus])

  // Número brasileiro sem o 9º dígito: 55 + DDD(2) + 8 dígitos = 12 dígitos totais
  if (/^55\d{2}\d{8}$/.test(stripped)) {
    const ddd = stripped.slice(2, 4)
    const num = stripped.slice(4)
    variants.add(`+55${ddd}9${num}`) // adiciona variante com 9
  }

  // Número brasileiro com o 9º dígito: 55 + DDD(2) + 9 + 8 dígitos = 13 dígitos totais
  if (/^55\d{2}9\d{8}$/.test(stripped)) {
    const ddd = stripped.slice(2, 4)
    const num = stripped.slice(5) // pula o '9'
    variants.add(`+55${ddd}${num}`) // adiciona variante sem 9
  }

  return [...variants]
}
