import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { extractImageDimensions, classifyAspectRatio } from '@/lib/image-utils';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const assetCategory = (formData.get('category') as string) || 'creatives'; // 'creatives' or 'brand_assets'

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided in upload request.' },
        { status: 400 }
      );
    }

    // 1. Validate File MIME Type
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      return NextResponse.json(
        {
          error: `Invalid file format "${file.type}". BrandGuard AI supports PNG, JPG, JPEG, WebP, and SVG marketing creatives.`,
        },
        { status: 400 }
      );
    }

    // 2. Validate File Size
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: `File size exceeds the 10MB limit (File size: ${(file.size / (1024 * 1024)).toFixed(2)} MB). Please compress or resize the creative.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 3. Extract Dimensions and Aspect Ratio
    const dimensions = extractImageDimensions(buffer, file.type);
    const width = dimensions?.width || 1080;
    const height = dimensions?.height || 1080;
    const aspectRatio = classifyAspectRatio(width, height);

    // 4. Generate Safe Filename
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const safeName = `${crypto.randomUUID()}.${ext}`;

    // 5. Always persist to local disk FIRST immediately (guaranteed instant, zero network dependency)
    const uploadSubdir = assetCategory === 'brand_assets' ? 'assets' : 'creatives';
    const targetDir = path.join(process.cwd(), 'public', 'uploads', uploadSubdir);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const filePath = path.join(targetDir, safeName);
    fs.writeFileSync(filePath, buffer);

    let publicUrl = `/uploads/${uploadSubdir}/${safeName}`;
    let uploadedToCloud = false;

    // 6. Supabase Storage: Race with 2.5s timeout so cloud latency never blocks or aborts uploads
    const supabase = getSupabaseServerClient();
    if (supabase) {
      try {
        const bucketName = assetCategory === 'brand_assets' ? 'brand-assets' : 'brandguard-creatives';
        const uploadPromise = supabase.storage
          .from(bucketName)
          .upload(safeName, buffer, {
            contentType: file.type,
            upsert: true,
          });

        const timeoutPromise = new Promise<{ data: null; error: Error }>((resolve) =>
          setTimeout(() => resolve({ data: null, error: new Error('Supabase storage upload timeout') }), 2500)
        );

        const uploadResult = await Promise.race([uploadPromise, timeoutPromise]);
        if (!uploadResult.error) {
          const { data } = supabase.storage.from(bucketName).getPublicUrl(safeName);
          if (data?.publicUrl) {
            publicUrl = data.publicUrl;
            uploadedToCloud = true;
          }
        } else {
          // Let the upload proceed in the background without blocking the client response
          uploadPromise.catch((err) =>
            console.warn('Background Supabase storage upload notice:', err)
          );
        }
      } catch (err) {
        console.warn('Supabase storage upload skipped or failed, using local persistent URL:', err);
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileName: file.name,
      width,
      height,
      aspect_ratio: aspectRatio.label,
      aspect_ratio_ratio: aspectRatio.ratio,
      sizeBytes: file.size,
      mimeType: file.type,
      storage_location: uploadedToCloud ? 'supabase_storage' : 'local_persistent_storage',
    });
  } catch (err: unknown) {
    console.error('Image upload failed:', err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : 'An unexpected error occurred during image upload.',
      },
      { status: 500 }
    );
  }
}
