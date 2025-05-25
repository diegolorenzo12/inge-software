import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Detect if running under serverless-offline
const isOffline = Boolean(process.env.IS_OFFLINE);
const REGION = process.env.REGION!;
const S3_PORT = process.env.S3_PORT ?? '4566';
const BUCKET = isOffline
    ? 'local-bucket'
    : process.env.BUCKET_NAME!;

/**
 * Singleton S3 client for both local and AWS environments.
 */
const s3Client = new S3Client({
    region: REGION,
    ...(isOffline && {
        endpoint: `http://localhost:${S3_PORT}`,
        forcePathStyle: true,
        credentials: {
            accessKeyId: 'S3RVER',
            secretAccessKey: 'S3RVER',
        },
    }),
});

/**
 * Uploads a Base64-encoded file to S3 and returns its accessible URL.
 * @param originalName - The original filename (e.g., "photo.png").
 * @param base64Data - Base64 string, optionally prefixed with "data:[mime];base64,".
 * @returns The full URL where the uploaded object can be accessed.
 */
export async function uploadBase64ToS3(
    originalName: string,
    base64Data: string
): Promise<string> {
    // Parse out the MIME type and raw Base64 string
    let contentType = 'image/jpeg';
    let rawData = base64Data;
    const match = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (match) {
        contentType = match[1];
        rawData = match[2];
    }

    // Convert Base64 to buffer
    const buffer = Buffer.from(rawData, 'base64');

    // Construct a unique object key
    const key = `images/${Date.now()}-${originalName}`;

    // Upload to S3
    await s3Client.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentEncoding: 'base64',
            ContentType: contentType,
            // ACL: 'public-read', // Uncomment if you need public access
        })
    );

    // Return the object URL based on environment
    return isOffline
        ? `http://localhost:${S3_PORT}/${BUCKET}/${key}`
        : `https://${BUCKET}.s3.${REGION}.amazonaws.com/${key}`;
}
