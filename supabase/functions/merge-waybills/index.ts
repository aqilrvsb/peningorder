import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { waybillUrls } = await req.json();

    if (!waybillUrls || !Array.isArray(waybillUrls) || waybillUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No waybill URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Filter out empty/invalid URLs
    const validUrls = waybillUrls.filter((url: string) => url && url.trim().length > 0);

    if (validUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid waybill URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching waybills from URLs:', validUrls);
    console.log('Number of URLs:', validUrls.length);

    // For single URL, just fetch and return
    if (validUrls.length === 1) {
      const url = validUrls[0];
      console.log('Fetching single waybill from:', url);

      const response = await fetch(url);

      if (!response.ok) {
        console.error('Failed to fetch waybill:', response.status);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch waybill PDF', url }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const pdfBuffer = await response.arrayBuffer();
      console.log('PDF received, size:', pdfBuffer.byteLength, 'bytes');

      return new Response(pdfBuffer, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename="waybill.pdf"'
        }
      });
    }

    // For multiple URLs, fetch each PDF and merge them
    console.log('Fetching multiple waybills and merging...');

    const failedUrls: string[] = [];
    const successUrls: string[] = [];

    // Fetch in parallel chunks (keeps original order) so 100+ waybills don't
    // fetch one-by-one and blow the function wall-clock limit.
    const CONCURRENCY = 15;
    const fetched: (Uint8Array | null)[] = new Array(validUrls.length).fill(null);
    for (let i = 0; i < validUrls.length; i += CONCURRENCY) {
      const chunk = validUrls.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (url: string, j: number) => {
          try {
            const response = await fetch(url);
            if (response.ok) {
              const buffer = await response.arrayBuffer();
              if (buffer.byteLength > 0) {
                fetched[i + j] = new Uint8Array(buffer);
                successUrls.push(url);
              } else {
                failedUrls.push(url);
              }
            } else {
              failedUrls.push(url);
              console.log(`Failed to fetch waybill from ${url}: ${response.status}`);
            }
          } catch (e) {
            failedUrls.push(url);
            console.error(`Error fetching waybill from ${url}:`, e);
          }
        })
      );
    }
    const pdfBuffers: Uint8Array[] = fetched.filter((b): b is Uint8Array => b !== null);
    console.log(`Fetched ${pdfBuffers.length}/${validUrls.length} waybills`);

    if (pdfBuffers.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch any waybills.',
          failedUrls
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Merge all PDFs using pdf-lib
    console.log(`Merging ${pdfBuffers.length} PDFs...`);

    try {
      const mergedPdf = await PDFDocument.create();

      let mergedCount = 0;
      for (const pdfBytes of pdfBuffers) {
        try {
          const pdf = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
          const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
          copiedPages.forEach((page) => mergedPdf.addPage(page));
          mergedCount++;
        } catch (e) {
          // One corrupt/non-PDF response must not abort the whole batch.
          console.error("Skipping a PDF that failed to load:", e);
        }
      }
      console.log(`Merged ${mergedCount}/${pdfBuffers.length} PDFs`);

      const mergedPdfBytes = await mergedPdf.save();
      console.log(`Merged PDF created, size: ${mergedPdfBytes.byteLength} bytes`);

      if (failedUrls.length > 0) {
        console.log(`Warning: ${failedUrls.length} waybills failed to fetch`);
      }

      return new Response(mergedPdfBytes, {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="waybills_${successUrls.length}_orders.pdf"`,
          'X-Failed-Count': failedUrls.length.toString(),
          'X-Success-Count': successUrls.length.toString()
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
            'Content-Disposition': 'attachment; filename="waybill.pdf"',
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
    console.error('Error in merge-waybills function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
