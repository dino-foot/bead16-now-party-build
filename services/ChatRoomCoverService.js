import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3, S3_BUCKET } from "../storage/s3.js";
import sharp from "sharp";
// curl -X POST http://localhost:2567/api/chatrooms/INDIA/cover \
//   -u shohan:shohan4556 \
//   -H "Content-Type: image/jpeg" \
//   --data-binary @india_cover.jpg
// Responds with {"success":true,"room":{...,"coverImageUrl":"/api/chatrooms/INDIA/cover",...}}.
const COVER_WIDTH = 270;
const COVER_HEIGHT = 350;
const READ_EXPIRY = 7 * 24 * 60 * 60; // SigV4 hard cap - presigned URLs can't exceed 7 days
function coverKey(category) {
    return `chatroom-covers/${category}.jpg`;
}
// Stores the relative API path, not the raw S3 URL - the bucket isn't public, so the
// actual bytes are always served through generateChatRoomCoverReadUrl below (same
// pattern as AvatarService's /api/avatar/:playfabId redirect).
export async function uploadChatRoomCover(category, imageBuffer) {
    const key = coverKey(category);
    const compressed = await sharp(imageBuffer)
        .resize(COVER_WIDTH, COVER_HEIGHT, { fit: "cover" })
        .jpeg({ quality: 85 })
        .toBuffer();
    await s3.send(new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: compressed,
        ContentType: "image/jpeg",
    }));
    return `/api/chatrooms/${category}/cover`;
}
export async function generateChatRoomCoverReadUrl(category) {
    const command = new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: coverKey(category),
    });
    return getSignedUrl(s3, command, { expiresIn: READ_EXPIRY });
}
