import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const DAILY_API_KEY = Deno.env.get("DAILY_API_KEY");
    if (!DAILY_API_KEY) {
      return new Response(JSON.stringify({ error: "Daily API key not configured" }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { consultation_id } = await req.json();
    if (!consultation_id) {
      return new Response(JSON.stringify({ error: "consultation_id required" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Only the patient or the assigned doctor of an active consultation may join.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const authHeader = req.headers.get("Authorization") ?? "";
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { data: consultation } = await supabase
      .from("consultations")
      .select("patient_id, status, doctors(user_id)")
      .eq("id", consultation_id)
      .maybeSingle();
    const doctorUserId = (consultation as any)?.doctors?.user_id;
    const isParticipant = !!consultation && (consultation.patient_id === user.id || doctorUserId === user.id);
    if (!isParticipant) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (consultation.status !== "active") {
      return new Response(JSON.stringify({ error: "Konsultatsiya faol emas" }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const roomName = `consultation-${consultation_id}`;

    // Try to get existing room first
    const getRes = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      headers: { Authorization: `Bearer ${DAILY_API_KEY}` },
    });

    let roomUrl: string;

    if (getRes.ok) {
      const room = await getRes.json();
      roomUrl = room.url;
    } else {
      // Create new room
      const createRes = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: roomName,
          privacy: "private", // top-level field: a meeting token is required to join
          properties: {
            exp: Math.floor(Date.now() / 1000) + 3600 * 48, // 48 hours
            enable_chat: false,
            enable_knocking: false,
            max_participants: 2,
          },
        }),
      });

      if (!createRes.ok) {
        const err = await createRes.text();
        console.error("daily create room failed", { lookup: getRes.status, create: createRes.status, err });
        return new Response(JSON.stringify({ error: "Failed to create room", details: err }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const room = await createRes.json();
      roomUrl = room.url;
    }

    // Create meeting token
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DAILY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: user.id,
          exp: Math.floor(Date.now() / 1000) + 3600 * 2,
        },
      }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      console.error("daily meeting token failed", { status: tokenRes.status, err });
      return new Response(JSON.stringify({ error: "Failed to create token", details: err }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const tokenData = await tokenRes.json();

    return new Response(JSON.stringify({ url: roomUrl, token: tokenData.token }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
