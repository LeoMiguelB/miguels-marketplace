import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { s3, privateBucket } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, role, instagram, x, trackId } = body;

    if (!email || typeof trackId === "undefined") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const roleValue = role === "" ? null : role;

    // Upsert contact
    const [contact] = await sql`
      INSERT INTO contacts (email, name, role, instagram, x_handle)
      VALUES (
        ${email},
        ${name || null},
        ${roleValue},
        ${instagram || null},
        ${x || null}
      )
      ON CONFLICT (email) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        instagram = EXCLUDED.instagram,
        x_handle = EXCLUDED.x_handle,
        updated_at = now()
      RETURNING id
    `;

    // Upsert install
    await sql`
      INSERT INTO installs (contact_id, playable_audio_id, count)
      VALUES (${contact.id}, ${trackId}, 1)
      ON CONFLICT (contact_id, playable_audio_id) DO UPDATE SET
        count = installs.count + 1,
        updated_at = now()
    `;

    // Fetch title and download_blob_url
    const [audio] = await sql`
      SELECT title, download_blob_url FROM playable_audio WHERE id = ${trackId}
    `;

    if (!audio || !audio.download_blob_url) {
      return NextResponse.json(
        { status: "DOWNLOAD_UNAVAILABLE", error: "Track not found or download missing" },
        { status: 404 }
      );
    }

    // Extract clean filename: sanitize track title
    const cleanTitle = (audio.title || "sample").trim().replace(/[^a-zA-Z0-9_-]/g, "_") || "sample";
    const match = audio.download_blob_url.match(/\.([a-zA-Z0-9]+)$/);
    const ext = match ? `.${match[1]}` : ".wav";
    const filename = `${cleanTitle}${ext}`;

    // URL format is /<bucket>/download/<id> if path style, or /download/<id> if virtual host.
    // Safest way is to split by /download/
    const key = "download/" + audio.download_blob_url.split("/download/")[1];

    const command = new GetObjectCommand({
      Bucket: privateBucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    });

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    return NextResponse.json({ status: "DOWNLOAD_SUCCESS", url });
  } catch (error) {
    console.error("Install route error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
