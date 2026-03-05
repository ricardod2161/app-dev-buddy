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
    const now = new Date().toISOString()
    const { data: reminders } = await supabase
      .from('reminders')
      .select('*')
      .eq('status', 'scheduled')
      .lte('remind_at', now)

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    let processed = 0
    for (const reminder of reminders) {
      try {
        if (reminder.target_phone && reminder.workspace_id) {
          const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-whatsapp`
          const res = await fetch(fnUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` },
            body: JSON.stringify({ workspace_id: reminder.workspace_id, phone: reminder.target_phone, text: `⏰ Lembrete: ${reminder.message}` }),
          })
          if (res.ok) {
            await supabase.from('reminders').update({ status: 'sent' }).eq('id', reminder.id)
          } else {
            await supabase.from('reminders').update({ status: 'error', error_message: 'Falha ao enviar' }).eq('id', reminder.id)
          }
        } else {
          await supabase.from('reminders').update({ status: 'sent' }).eq('id', reminder.id)
        }
        processed++
      } catch (e) {
        await supabase.from('reminders').update({ status: 'error', error_message: e.message }).eq('id', reminder.id)
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
