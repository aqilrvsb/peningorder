import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// A5 in PDF points (148mm x 210mm). ParcelDaily connotes come as A4 with the
// label not filling the sheet, so clients printing on A5 label paper get a small
// / half-empty label. We re-lay every page onto a full A5 page (scaled to fit,
// orientation matched to the source) so the label fills A5.
const MM = 2.834645669;
const A5_W = 148 * MM; // ~419.5pt
const A5_H = 210 * MM; // ~595.3pt

// Append every page of `srcBytes` into `out` as full A5 pages. Returns how many
// pages were added (0 if the source could not be parsed).
async function appendAsA5(out: PDFDocument, srcBytes: Uint8Array): Promise<number> {
  const src = await PDFDocument.load(srcBytes, { ignoreEncryption: true });
  const pages = src.getPages();
  const embedded = await out.embedPages(pages);
  let added = 0;
  for (let i = 0; i < embedded.length; i++) {
    const { width: sw, height: sh } = pages[i].getSize();
    if (!sw || !sh) continue;
    const portrait = sh >= sw;
    const pw = portrait ? A5_W : A5_H;
    const ph = portrait ? A5_H : A5_W;
    const page = out.addPage([pw, ph]);
    const scale = Math.min(pw / sw, ph / sh); // fit, preserve aspect (no distortion)
    const dw = sw * scale;
    const dh = sh * scale;
    page.drawPage(embedded[i], { x: (pw - dw) / 2, y: (ph - dh) / 2, width: dw, height: dh });
    added++;
  }
  return added;
}

serve(async (req) => {
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

    const validUrls = waybillUrls.filter((url: string) => url && url.trim().length > 0);
    if (validUrls.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid waybill URLs provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching waybills:', validUrls.length);

    // Fetch all PDFs in parallel chunks (keeps original order) so 100+ waybills
    // don't fetch one-by-one and blow the function wall-clock limit.
    const failedUrls: string[] = [];
    const successUrls: string[] = [];
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
        JSON.stringify({ error: 'Failed to fetch any waybills.', failedUrls }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build ONE A5 PDF from every fetched waybill. A bad/non-PDF response is
    // skipped rather than aborting the whole batch.
    const out = await PDFDocument.create();
    let mergedCount = 0;
    for (const bytes of pdfBuffers) {
      try {
        mergedCount += await appendAsA5(out, bytes);
      } catch (e) {
        console.error('Skipping a PDF that failed to load:', e);
      }
    }

    if (mergedCount === 0) {
      return new Response(
        JSON.stringify({ error: 'Failed to render any waybills to A5.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const outBytes = await out.save();
    console.log(`A5 waybill PDF created: ${mergedCount} page(s), ${outBytes.byteLength} bytes`);

    const filename = validUrls.length === 1 ? 'waybill.pdf' : `waybills_${successUrls.length}_orders.pdf`;
    return new Response(outBytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'X-Failed-Count': failedUrls.length.toString(),
        'X-Success-Count': successUrls.length.toString(),
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Internal server error';
    console.error('Error in merge-waybills function:', err);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
