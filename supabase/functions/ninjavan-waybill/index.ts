import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface WaybillData {
  trackingNumbers: string[];
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

    const { trackingNumbers, profileId }: WaybillData = await req.json();

    if (!trackingNumbers || !Array.isArray(trackingNumbers) || trackingNumbers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No tracking numbers provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out empty/invalid tracking numbers
    const validTrackingNumbers = trackingNumbers.filter((tn: string) => tn && tn.trim().length > 0);

    if (validTrackingNumbers.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid tracking numbers provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching waybills for tracking numbers:', validTrackingNumbers);
    console.log('Number of tracking numbers:', validTrackingNumbers.length);

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

    // Get fresh token from NinjaVan OAuth
    console.log('Requesting fresh token from NinjaVan');

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
        JSON.stringify({ error: 'Failed to authenticate with NinjaVan API', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const authData = await authResponse.json();
    const accessToken = authData.access_token;
    console.log('Token obtained successfully');

    // For single tracking number, fetch directly
    if (validTrackingNumbers.length === 1) {
      const tid = validTrackingNumbers[0];
      const waybillUrl = `https://api.ninjavan.co/my/2.0/reports/waybill?tids=${encodeURIComponent(tid)}&h=0`;
      console.log('Fetching single waybill from:', waybillUrl);

      const waybillResponse = await fetch(waybillUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/pdf',
          'Authorization': `Bearer ${accessToken}`
        }
      });

      if (!waybillResponse.ok) {
        const errorText = await waybillResponse.text();
        console.error('Waybill fetch failed:', errorText);
        return new Response(
          JSON.stringify({
            error: 'Failed to fetch waybill from NinjaVan.',
            details: errorText,
            trackingNumber: tid
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await waybillResponse.arrayBuffer();
      console.log('PDF received, size:', pdfBuffer.byteLength, 'bytes');

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="waybill_${tid}.pdf"`
        }
      });
    }

    // For multiple tracking numbers, fetch each PDF and merge them
    console.log('Fetching multiple waybills and merging...');

    const pdfBuffers: Uint8Array[] = [];
    const failedTids: string[] = [];
    const successTids: string[] = [];

    for (const tid of validTrackingNumbers) {
      try {
        const waybillUrl = `https://api.ninjavan.co/my/2.0/reports/waybill?tids=${encodeURIComponent(tid)}&h=0`;
        console.log(`Fetching waybill for ${tid}...`);

        const waybillResponse = await fetch(waybillUrl, {
          method: 'GET',
          headers: {
            'Accept': 'application/pdf',
            'Authorization': `Bearer ${accessToken}`
          }
        });

        if (waybillResponse.ok) {
          const buffer = await waybillResponse.arrayBuffer();
          if (buffer.byteLength > 0) {
            pdfBuffers.push(new Uint8Array(buffer));
            successTids.push(tid);
            console.log(`Successfully fetched waybill for ${tid}, size: ${buffer.byteLength} bytes`);
          } else {
            failedTids.push(tid);
            console.log(`Empty PDF for ${tid}`);
          }
        } else {
          failedTids.push(tid);
          console.log(`Failed to fetch waybill for ${tid}: ${waybillResponse.status}`);
        }
      } catch (e) {
        failedTids.push(tid);
        console.error(`Error fetching waybill for ${tid}:`, e);
      }
    }

    if (pdfBuffers.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch any waybills from NinjaVan.',
          failedTids: failedTids
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Merge all PDFs using pdf-lib
    console.log(`Merging ${pdfBuffers.length} PDFs...`);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const pdfBytes of pdfBuffers) {
        const pdf = await PDFDocument.load(pdfBytes);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach((page) => mergedPdf.addPage(page));
      }

      const mergedPdfBytes = await mergedPdf.save();
      console.log(`Merged PDF created, size: ${mergedPdfBytes.byteLength} bytes`);

      // Return warning if some failed
      if (failedTids.length > 0) {
        console.log(`Warning: ${failedTids.length} tracking numbers failed: ${failedTids.join(', ')}`);
      }

      return new Response(mergedPdfBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="waybill_${successTids.length}_orders.pdf"`,
          'X-Failed-Tids': failedTids.join(','),
          'X-Success-Count': successTids.length.toString(),
          'X-Failed-Count': failedTids.length.toString()
        }
      });
    } catch (mergeError) {
      console.error('Error merging PDFs:', mergeError);

      // If merge fails, return the first PDF
      if (pdfBuffers.length > 0) {
        return new Response(pdfBuffers[0], {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="waybill_${successTids[0]}.pdf"`,
            'X-Warning': 'Could not merge PDFs, returning first waybill only'
          }
        });
      }

      return new Response(
        JSON.stringify({
          error: 'Failed to merge PDF waybills.',
          details: mergeError instanceof Error ? mergeError.message : 'Unknown error'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('Error in ninjavan-waybill function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
