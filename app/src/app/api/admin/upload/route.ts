import { adminSecretOk } from "@/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const header = request.headers.get("X-Admin-Secret");
  if (!adminSecretOk(header, process.env.ADMIN_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json({ error: "not implemented" }, { status: 501 });
}
