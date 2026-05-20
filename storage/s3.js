import { S3Client } from "@aws-sdk/client-s3";
export const s3 = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "ap-southeast-1",
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || "",
        secretAccessKey: process.env.S3_SECRET_KEY || "",
    },
    forcePathStyle: true,
});
export const S3_BUCKET = process.env.S3_BUCKET || "bead16-bucket-d3fufdh1bw";
export const S3_PUBLIC_URL = `${process.env.S3_ENDPOINT}/${S3_BUCKET}`;
