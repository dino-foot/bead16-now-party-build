import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "../storage/s3.js";
import pool from "../db/db.js";
import sharp from "sharp";
const UPLOAD_EXPIRY = 500;
const READ_EXPIRY = 7 * 24 * 60 * 60; // 7 days
export async function generateAvatarReadUrl(playfabId) {
    const key = `avatars/${playfabId}.png`;
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
    });
    return getSignedUrl(s3, command, { expiresIn: READ_EXPIRY });
}
export async function generateAvatarUploadUrl(playfabId, contentType) {
    const key = `avatars/${playfabId}.png`;
    const command = new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        ContentType: contentType,
    });
    const url = await getSignedUrl(s3, command, { expiresIn: UPLOAD_EXPIRY });
    return {
        url,
        avatarUrl: `/api/avatar/${playfabId}`,
    };
}
export async function confirmAvatar(playfabId) {
    const key = `avatars/${playfabId}.png`;
    // 1. Download the raw uploaded image from S3
    const getCommand = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
    const { Body } = await s3.send(getCommand);
    if (!Body)
        throw new Error("No image body found in S3");
    // Note: compression temporarily disabled for debugging
    const rawBuffer = await Body.transformToByteArray();
    const compressed = await sharp(rawBuffer)
        .resize(400, 400, { fit: "cover" })
        .jpeg({ quality: 80 })
        .toBuffer();
    await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET, Key: key,
        Body: compressed, ContentType: "image/jpeg",
    }));
    // 5. Update DB
    const avatarUrl = `/api/avatar/${playfabId}`;
    const result = await pool.query(`UPDATE players SET avatar_url = $1 WHERE playfab_id = $2 RETURNING avatar_url`, [avatarUrl, playfabId]);
    if (result.rowCount === 0) {
        throw new Error("Player not found");
    }
    return avatarUrl;
}
