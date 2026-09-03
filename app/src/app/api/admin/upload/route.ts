import { PutObjectCommand } from "@aws-sdk/client-s3";
import { adminSecretOk } from "@/lib/admin-auth";
import { handleAdminUpload } from "@/lib/admin-upload";
import { bucket, s3 } from "@/lib/s3";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("X-Admin-Secret");
  if (!adminSecretOk(header, process.env.ADMIN_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return handleAdminUpload(request, {
    newId: () => crypto.randomUUID(),
    endpoint: process.env.S3_ENDPOINT ?? "",
    bucket,
    put: async (key, body, contentType) => {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    },
  });
}
