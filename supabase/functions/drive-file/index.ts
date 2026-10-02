import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const MAX_FILE_SIZE = 20 * 1024 * 1024;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

async function getGoogleAccessToken() {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google Drive secrets are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error("Google OAuth token refresh failed");
  }

  return data.access_token as string;
}

async function uploadToDrive(file: File, accessToken: string, parentId: string) {
  const boundary = "-------anuban-chumsang-" + crypto.randomUUID();
  const metadata = JSON.stringify({
    name: file.name,
    parents: [parentId],
  });

  const encoder = new TextEncoder();
  const before = encoder.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${file.type || "application/octet-stream"}\r\n\r\n`
  );
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  const after = encoder.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(before.length + fileBytes.length + after.length);
  body.set(before, 0);
  body.set(fileBytes, before.length);
  body.set(after, before.length + fileBytes.length);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink,parents",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );

  const data = await response.json();
  if (!response.ok || !data.id) {
    throw new Error(data?.error?.message || "Google Drive upload failed");
  }

  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await userClient.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const form = await req.formData().catch(() => null);
  if (!form) return json({ error: "Expected multipart/form-data" }, 400);

  const documentType = String(form.get("document_type") || "");
  const documentId = String(form.get("document_id") || "");
  const file = form.get("file");

  if (!["incoming", "outgoing"].includes(documentType) || !documentId || !(file instanceof File)) {
    return json({ error: "document_type, document_id and file are required" }, 400);
  }

  if (file.size <= 0) return json({ error: "Empty file is not allowed" }, 400);
  if (file.size > MAX_FILE_SIZE) {
    return json({ error: "File is too large. Maximum size is 20 MB." }, 413);
  }

  const service = createClient(supabaseUrl, serviceRoleKey);

  const table = documentType === "incoming" ? "incoming_documents" : "outgoing_documents";
  const { data: document, error: documentError } = await service
    .from(table)
    .select("id,created_by")
    .eq("id", documentId)
    .single();

  if (documentError || !document) return json({ error: "Document not found" }, 404);
  if (document.created_by !== user.id) return json({ error: "Forbidden" }, 403);

  const parentId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
  if (!parentId) return json({ error: "Google Drive folder is not configured" }, 500);

  try {
    const accessToken = await getGoogleAccessToken();
    const driveFile = await uploadToDrive(file, accessToken, parentId);

    const row = {
      incoming_document_id: documentType === "incoming" ? documentId : null,
      outgoing_document_id: documentType === "outgoing" ? documentId : null,
      file_name: file.name,
      mime_type: file.type || driveFile.mimeType || "application/octet-stream",
      file_size: file.size,
      drive_file_id: driveFile.id,
      drive_web_url: driveFile.webViewLink || `https://drive.google.com/file/d/${driveFile.id}/view`,
      drive_parent_id: parentId,
      uploaded_by: user.id,
    };

    const { data: saved, error: saveError } = await service
      .from("document_files")
      .insert(row)
      .select("id,file_name,mime_type,file_size,drive_file_id,drive_web_url,created_at")
      .single();

    if (saveError) {
      return json({
        error: "Drive upload succeeded but metadata save failed",
        drive_file_id: driveFile.id,
      }, 500);
    }

    return json({ ok: true, file: saved });
  } catch (error) {
    console.error("drive-file error", error);
    return json({
      error: error instanceof Error ? error.message : "Google Drive upload failed",
    }, 500);
  }
});
