# PowerShell version of send_card_challenge_to_users.sh
# Script to send card challenge emails to all users in the 'users' collection
# Usage:
#   $env:MAILGUN_API="your_api_key"; .\scripts\send_card_challenge_to_users.ps1

param(
    [string]$FromEmail = "Zapull Support <support@mg.zapull.fun>",
    [string]$Subject = "🎮 Free Card Challenge on Zapull - 50K Points to Start!",
    [int]$BatchSize = 50,
    [int]$SleepMs = 250,
    [int]$MaxRetries = 3
)

# Configuration
$MAILGUN_DOMAIN = "mg.zapull.fun"
$HTML_PATH = "scripts/email_card_challenge.html"
$API_BASE = "https://api.mailgun.net/v3/$MAILGUN_DOMAIN/messages"

# Check required environment variable
if (-not $env:MAILGUN_API) {
    Write-Error "ERROR: MAILGUN_API must be set in the environment."
    exit 1
}

# Check if HTML file exists
if (-not (Test-Path $HTML_PATH)) {
    Write-Error "ERROR: HTML file not found at $HTML_PATH"
    exit 1
}

function Send-OneEmail {
    param(
        [string]$Recipient,
        [string]$DisplayName
    )
    
    $tempFile = [System.IO.Path]::GetTempFileName()
    
    try {
        # Create multipart form data
        $boundary = [System.Guid]::NewGuid().ToString()
        $LF = "`r`n"
        
        $bodyLines = @()
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"from`""
        $bodyLines += ""
        $bodyLines += $FromEmail
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"to`""
        $bodyLines += ""
        $bodyLines += $Recipient
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"subject`""
        $bodyLines += ""
        $bodyLines += $Subject
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"text`""
        $bodyLines += ""
        $bodyLines += "Plain-text fallback"
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"html`""
        $bodyLines += "Content-Type: text/html; charset=utf-8"
        $bodyLines += ""
        $htmlContent = Get-Content $HTML_PATH -Raw -Encoding UTF8
        $bodyLines += $htmlContent
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"h:Reply-To`""
        $bodyLines += ""
        $bodyLines += "support@zapull.fun"
        $bodyLines += "--$boundary"
        $bodyLines += "Content-Disposition: form-data; name=`"h:X-Campaign`""
        $bodyLines += ""
        $bodyLines += "card-challenge-2025"
        $bodyLines += "--$boundary--"
        
        $body = $bodyLines -join $LF
        
        $response = Invoke-WebRequest -Uri $API_BASE -Method Post -Headers @{
            "Authorization" = "Basic $([Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("api:$env:MAILGUN_API")))"
            "Content-Type" = "multipart/form-data; boundary=$boundary"
        } -Body $body -OutFile $tempFile
        
        Write-Host "Response for $Recipient ($DisplayName) ($($response.StatusCode)):"
        Get-Content $tempFile | Write-Host
        
        if ($response.StatusCode -eq 200) {
            Write-Host "OK: $Recipient ($DisplayName)"
            return $true
        } else {
            Write-Host "FAIL: $Recipient ($DisplayName) - HTTP $($response.StatusCode)"
            return $false
        }
    }
    catch {
        Write-Host "FAIL: $Recipient ($DisplayName) - $($_.Exception.Message)"
        return $false
    }
    finally {
        if (Test-Path $tempFile) {
            Remove-Item $tempFile -Force
        }
    }
}

Write-Host "Fetching user emails from Firestore collection 'users'..."

try {
    $userData = python scripts/fetch_users.py
}
catch {
    Write-Error "Failed to fetch users from Firestore: $($_.Exception.Message)"
    exit 1
}

if (-not $userData) {
    Write-Host "No users found in Firestore 'users' collection."
    exit 0
}

$total = 0
$ok = 0
$fail = 0
$secs = $SleepMs / 1000.0

# Send emails one by one
$userLines = $userData -split "`n" | Where-Object { $_.Trim() -ne "" }

foreach ($userLine in $userLines) {
    $parts = $userLine -split "\|"
    $email = $parts[0]
    $displayName = $parts[1]
    
    $total++
    Write-Host "Sending email $total to: $email ($displayName)"
    
    if (Send-OneEmail -Recipient $email -DisplayName $displayName) {
        $ok++
    } else {
        $fail++
    }
    
    # Sleep between emails (except for the last one)
    if ($total -lt $userLines.Count) {
        Write-Host "Sleeping for $secs seconds..."
        Start-Sleep -Seconds $secs
    }
}

Write-Host "Summary: total=$total ok=$ok fail=$fail (sleep_ms=$SleepMs)"
if ($fail -gt 0) { exit 1 } else { exit 0 }
