# Anuban Chumsang Document System

ระบบสารบรรณอิเล็กทรอนิกส์สำหรับสถานศึกษา

## Architecture
- Frontend: Vite + TypeScript, deploy to GitHub Pages
- Database/Auth: Supabase
- Actual document files: Google Drive
- Supabase Storage: **not used**
- PostgreSQL stores document metadata, workflow, permissions and audit data
- RLS + RBAC protect all exposed public tables

## Supabase
Project ref: `uwebbofczidcfnjbvsqu`

Never commit service-role or secret keys. Browser code must use only the publishable key.

## Next
1. Configure Supabase Auth.
2. Add GitHub Pages deployment.
3. Add Google Drive Edge Functions with secrets stored only in Supabase.
4. Build document registration, routing, approval and audit UI.
