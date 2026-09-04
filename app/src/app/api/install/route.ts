import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { s3, privateBucket } from "@/lib/s3";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, role, instagram, x, trackId } = body;

    const trimmedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
    const idNum = Number(trackId);

    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail) || trimmedEmail.length > 255) {
      return NextResponse.json({ error: "Invalid or missing email" }, { status: 400 });
    }

    if (typeof trackId === "undefined" || !Number.isInteger(idNum) || idNum <= 0) {
      return NextResponse.json({ error: "Invalid track ID" }, { status: 400 });
    }

    const rawRole = typeof role === "string" ? role.trim().toLowerCase() : "";
    let roleValue: string | null = null;
    if (rawRole) {
      if (rawRole === "producer" || rawRole === "artist" || rawRole === "other") {
        roleValue = rawRole;
      } else {
        return NextResponse.json({ error: "Invalid role specified" }, { status: 400 });
      }
    }

    const safeName = typeof name === "string" && name.trim() ? name.trim().slice(0, 100) : null;
    const safeInstagram = typeof instagram === "string" && instagram.trim() ? instagram.trim().slice(0, 50) : null;
    const safeX = typeof x === "string" && x.trim() ? x.trim().slice(0, 50) : null;

    // Upsert contact
    const [contact] = await sql`
      INSERT INTO contacts (email, name, role, instagram, x_handle)
      VALUES (
        ${trimmedEmail},
        ${safeName},
        ${roleValue},
        ${safeInstagram},
        ${safeX}
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
      VALUES (${contact.id}, ${idNum}, 1)
      ON CONFLICT (contact_id, playable_audio_id) DO UPDATE SET
        count = installs.count + 1,
        updated_at = now()
    `;

    // Fetch title and download_blob_url (published tracks only)
    const [audio] = await sql`
      SELECT title, download_blob_url FROM playable_audio WHERE id = ${idNum} AND published = true
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
