# Apply repo migration files to SCAGO when db push fails (idempotent SQL).
# Usage: powershell -File scripts/apply-scago-migrations.ps1

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

npx --yes supabase link --project-ref iigbgbgakevcgilucvbs --yes | Out-Host

$files = @(
  '20260518230000_add_donated_seat_claim_flag.sql',
  '20260526180000_add_bogo_columns.sql',
  '20260527010000_drop_recursive_bogo_policy.sql',
  '20260526190000_add_bogo_email_template_columns.sql',
  '20260526200000_add_applied_promo_code.sql',
  '20260527120000_enable_bogo_gansid_congress.sql'
)

foreach ($f in $files) {
  $path = "supabase/migrations/$f"
  $ver = $f.Substring(0, 14)
  Write-Host "`n=== $f ===" -ForegroundColor Cyan
  npx --yes supabase db query --linked -f $path | Out-Host
  npx --yes supabase migration repair --status applied $ver | Out-Host
}

Write-Host "`nDone. Run: npm run smoke:db && npm run check:migrations" -ForegroundColor Green
