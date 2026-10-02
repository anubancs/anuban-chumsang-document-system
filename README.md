# Anuban Chumsang Document System

ระบบสารบรรณอิเล็กทรอนิกส์สำหรับสถานศึกษา

## Architecture
- Frontend: Vite + TypeScript + Cloudflare Workers/Static Assets
- Database/Auth: Supabase
- Actual document files: Google Drive
- Supabase Storage: **not used**
- PostgreSQL stores document metadata, workflow, permissions and audit data
- RLS + RBAC protect all exposed public tables
- CI/CD: GitHub Actions → Cloudflare Workers

## Production
- Cloudflare Worker: `anuban-chumsang-document-system`
- Production URL: `https://anuban-chumsang-document-system.60010106nkw1.workers.dev`
- Supabase project: `uwebbofczidcfnjbvsqu`

## Environment variables
Browser builds use only public Supabase configuration:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

Never commit Supabase service-role keys, Google OAuth secrets, refresh tokens, Cloudflare API tokens, or other server-side secrets.

## Deployment
Every push to `main` triggers `.github/workflows/deploy.yml`.

Configure these GitHub Actions Secrets before the first automated deployment:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

The Cloudflare API token should be scoped only to the account/Worker deployment resources required by this project.

## Supabase
The production database uses migrations, RLS and RBAC. Google Drive uploads are handled by the Supabase Edge Function `drive-file`; its Google credentials remain in Supabase secrets.

## Development
```bash
npm ci
npm run dev
```

Build:
```bash
npm run build
```

Deploy locally:
```bash
npm run deploy
```