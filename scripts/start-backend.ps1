Write-Host "This repository no longer bundles the video agent backend." -ForegroundColor Yellow
Write-Host "Run the external video agent service separately, then set AGENT_URL / NEXT_PUBLIC_AGENT_URL to that service." -ForegroundColor Yellow
Write-Host "See INTEGRATION.md for the updated integration flow." -ForegroundColor Cyan
exit 1
