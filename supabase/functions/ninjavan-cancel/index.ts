import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CancelData {
  trackingNumber: string;
  profileId: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { trackingNumber, profileId }: CancelData = await req.json();
    console.log('Cancelling NinjaVan order with tracking:', trackingNumber);

    if (!trackingNumber) {
      return new Response(
        JSON.stringify({ error: 'Tracking number is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get NinjaVan config for this profile
    const { data: config, error: configError } = await supabase
      .from('ninjavan_config')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    if (configError || !config) {
      console.error('Config not found:', configError);
      return new Response(
        JSON.stringify({ error: 'NinjaVan configuration not found. Please configure in Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for valid token or get new one
    let accessToken: string;
    const now = new Date();

    const { data: tokenData, error: tokenError } = await supabase
      .from('ninjavan_tokens')
      .select('*')
      .eq('profile_id', profileId)
      .gt('expires_at', now.toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError) {
      console.log('Token query error:', tokenError);
    }

    if (tokenData && tokenData.access_token) {
      accessToken = tokenData.access_token;
      console.log('Using existing valid token');
    } else {
      console.log('No valid token found, requesting new token');

      const authResponse = await fetch('https://api.ninjavan.co/my/2.0/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: config.client_id,
          client_secret: config.client_secret,
          grant_type: 'client_credentials'
        })
      });

      if (!authResponse.ok) {
        const errorText = await authResponse.text();
        console.error('NinjaVan Auth failed:', errorText);
        return new Response(
          JSON.stringify({ error: 'Failed to authenticate with NinjaVan API' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const authData = await authResponse.json();
      accessToken = authData.access_token;
      const expiresIn = authData.expires_in || 3600;
      const expiresAt = new Date(now.getTime() + ((expiresIn - 300) * 1000));

      await supabase.from('ninjavan_tokens').insert({
        profile_id: profileId,
        access_token: accessToken,
        expires_at: expiresAt.toISOString()
      });
    }

    // Cancel order via NinjaVan API
    // DELETE /{countryCode}/2.2/orders/{trackingNo}
    const cancelResponse = await fetch(`https://api.ninjavan.co/my/2.2/orders/${trackingNumber}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const cancelResult = await cancelResponse.json();
    console.log('NinjaVan cancel response:', cancelResult);

    if (!cancelResponse.ok) {
      // Treat "ORDER_ALREADY_CANCELLED" as success - order is already cancelled, which is what we want
      if (cancelResult.description === 'ORDER_ALREADY_CANCELLED' ||
          cancelResult.data?.message === 'Order is already cancelled') {
        console.log('Order already cancelled - treating as success');
        return new Response(
          JSON.stringify({
            success: true,
            alreadyCancelled: true,
            message: 'Order was already cancelled'
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          error: cancelResult.message || 'Failed to cancel NinjaVan order',
          details: cancelResult
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        trackingId: cancelResult.trackingId,
        status: cancelResult.status,
        message: 'Order cancelled successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('Error in ninjavan-cancel function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
