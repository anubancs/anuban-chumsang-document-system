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
  const files = form.getAll("file").filter((value): value is File => value instanceof File);

  if (!["incoming", "outgoing"].includes(documentType) || !documentId || !files.length) {
    return json({ error: "document_type, document_id and at least one file are required" }, 400);
  }

  const emptyFile = files.find((file) => file.size <= 0);
  if (emptyFile) return json({ error: "Empty file is not allowed: " + emptyFile.name }, 400);

  const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE);
  if (oversizedFile) {
    return json({ error: "File is too large (maximum 20 MB): " + oversizedFile.name }, 413);
  }

  const service = createClient(supabaseUrl, serviceRoleKey);

  const table = documentType === "incoming" ? "incoming_documents" : "outgoing_documents";
  const { data: document, error: documentError } = await service
    .from(table)
    .select("id,created_by")
    .eq("id", documentId)
    .single();

  if (documentError || !document) return json({ error: "Document not found" }, 404);

  // The UI permits attachment uploads for users who can update documents.
  // Resolve that permission from the canonical RBAC tables instead of trusting
  // client-side role checks. The document creator is also allowed for backwards
  // compatibility with records created before RBAC was hardened.
  let canUpdateDocuments = document.created_by === user.id;
  if (!canUpdateDocuments) {
    const { data: roleRows, error: roleError } = await service
      .from("user_roles")
      .select("role_id")
      .eq("user_id", user.id);

    if (roleError) {
      console.error("upload permission role lookup failed", roleError.message);
      return json({ error: "ตรวจสอบสิทธิ์ไม่สำเร็จ" }, 500);
    }

    const roleIds = (roleRows ?? []).map((row: { role_id: string }) => row.role_id);
    if (roleIds.length) {
      const { data: permissionRows, error: permissionError } = await service
        .from("role_permissions")
        .select("role_id,permissions!inner(code)")
        .in("role_id", roleIds);

      if (permissionError) {
        console.error("upload permission lookup failed", permissionError.message);
        return json({ error: "ตรวจสอบสิทธิ์ไม่สำเร็จ" }, 500);
      }

      canUpdateDocuments = (permissionRows ?? []).some(
        (row: any) => row.permissions?.code === "documents.update",
      );
    }
  }

  if (!canUpdateDocuments) return json({ error: "Forbidden" }, 403);

  const parentId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID");
  if (!parentId) return json({ error: "Google Drive folder is not configured" }, 500);

  try {
    const accessToken = await getGoogleAccessToken();
    const uploadedDriveFiles: any[] = [];

    try {
      for (const file of files) {
        const driveFile = await uploadToDrive(file, accessToken, parentId);
        uploadedDriveFiles.push(driveFile);
      }

      const rows = uploadedDriveFiles.map((driveFile, index) => {
        const file = files[index];
        return {
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
      });

      const { data: saved, error: saveError } = await service
        .from("document_files")
        .insert(rows)
        .select("id,file_name,mime_type,file_size,drive_file_id,drive_web_url,created_at");

      if (saveError) {
        throw new Error("Drive upload succeeded but metadata save failed: " + saveError.message);
      }

      return json({ ok: true, files: saved ?? [], count: saved?.length ?? 0 });
    } catch (error) {
      for (const driveFile of uploadedDriveFiles) {
        try {
          await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveFile.id)}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${accessToken}` },
          });
        } catch (cleanupError) {
          console.error("Drive orphan cleanup failed", cleanupError);
        }
      }

      console.error("drive-file batch upload failed", error);
      return json({
        error: error instanceof Error ? error.message : "Google Drive upload failed",
      }, 500);
    }
  } catch (error) {
    console.error("drive-file error", error);
    return json({
      error: error instanceof Error ? error.message : "Google Drive upload failed",
    }, 500);
  }
});
