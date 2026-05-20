import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { s3, S3_BUCKET, S3_PUBLIC_URL } from "../storage/s3.js";
import pool from "../db/db.js";
const UPLOAD_EXPIRY = 300;
export async function generateAvatarUploadUrl(playfabId, contentType) {
    const key = `avatars/${playfabId}.png`;
    const { url, fields } = await createPresignedPost(s3, {
        Bucket: S3_BUCKET,
        Key: key,
        Expires: UPLOAD_EXPIRY,
        Conditions: [
            { bucket: S3_BUCKET },
            ["eq", "$key", key],
            ["starts-with", "$Content-Type", "image/"],
            ["content-length-range", 500, 5_000_000],
        ],
    });
    return {
        url,
        fields,
        avatarUrl: `${S3_PUBLIC_URL}/${key}`,
    };
}
export async function confirmAvatar(playfabId) {
    const avatarUrl = `${S3_PUBLIC_URL}/avatars/${playfabId}.png`;
    const result = await pool.query(`UPDATE players SET avatar_url = $1 WHERE playfab_id = $2 RETURNING avatar_url`, [avatarUrl, playfabId]);
    if (result.rowCount === 0) {
        throw new Error("Player not found");
    }
    return result.rows[0].avatar_url;
}
