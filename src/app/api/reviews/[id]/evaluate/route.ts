import { NextRequest, NextResponse } from 'next/server';
import {
  getContentReviewById,
  getAugmentedActiveGuidelinesAndAssets,
  saveReviewEvaluation,
} from '@/lib/db';
import { runComplianceReview } from '@/lib/engine';

export async function POST(
  req: NextRequest,
  segmentData: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await segmentData.params;
    const review = await getContentReviewById(id);

    if (!review) {
      return NextResponse.json({ error: 'Review not found.' }, { status: 404 });
    }

    // Load active guidelines, approved facts, authorized visual assets, and brand profile
    const { guidelines, facts, assets, brandName } = await getAugmentedActiveGuidelinesAndAssets();

    // Parse options (e.g. skipAI, ocrReferenceText)
    let body: { skipAI?: boolean; ocrReferenceText?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Body optional
    }

    const result = await runComplianceReview(
      review.content_text,
      review.content_type,
      guidelines,
      facts,
      {
        skipAI: body.skipAI,
        imageUrl: review.image_url || undefined,
        assets,
        brandName,
        ocrReferenceText: body.ocrReferenceText || undefined,
      }
    );

    const updatedReview = await saveReviewEvaluation(id, result);

    return NextResponse.json({
      success: true,
      review: updatedReview,
      evaluation: result,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Evaluation failed' },
      { status: 500 }
    );
  }
}
