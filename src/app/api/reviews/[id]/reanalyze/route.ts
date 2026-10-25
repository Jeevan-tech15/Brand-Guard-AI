import { NextRequest, NextResponse } from 'next/server';
import { reanalyzeCorrectedImage } from '@/lib/db';

export async function POST(
  req: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await segmentData.params;
    const body = await req.json();

    const hasImage = typeof body.corrected_image_url === 'string' && body.corrected_image_url.trim().length > 0;
    const hasCaption = typeof body.updated_caption_text === 'string' && body.updated_caption_text.trim().length > 0;
    const hasReplacement = typeof body.correction_metadata?.replaced_text === 'string' && body.correction_metadata?.replaced_text.trim().length > 0;

    if (!hasImage && !hasCaption && !hasReplacement) {
      return NextResponse.json(
        { error: 'A valid updated caption, corrected image, or replacement target is required to perform reanalysis.' },
        { status: 400 }
      );
    }

    const result = await reanalyzeCorrectedImage(id, {
      correctedImageUrl: hasImage ? body.corrected_image_url.trim() : undefined,
      updatedCaptionText: hasCaption ? body.updated_caption_text.trim() : undefined,
      correctionMetadata: {
        replaced_text: body.correction_metadata?.replaced_text,
        new_text: body.correction_metadata?.new_text,
        target_scope: body.correction_metadata?.target_scope,
        caption_before: body.correction_metadata?.caption_before,
        caption_after: body.correction_metadata?.caption_after,
        replaced_asset_id: body.correction_metadata?.replaced_asset_id,
        edit_applied_to_pixels: Boolean(body.correction_metadata?.edit_applied_to_pixels && hasImage),
        correction_notes: body.correction_metadata?.correction_notes,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Creative re-analyzed successfully. ${result.resolvedFindings.length} issue(s) resolved, ${result.remainingFindings.length} remaining.`,
      review: result.review,
      resolvedFindings: result.resolvedFindings,
      remainingFindings: result.remainingFindings,
      unverifiedFindings: result.unverifiedFindings,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Reanalysis failed.' },
      { status: 500 }
    );
  }
}
