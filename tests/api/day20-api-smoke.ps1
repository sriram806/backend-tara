param(
  [string]$AuthUrl = $(if ($env:AUTH_URL) { $env:AUTH_URL } else { 'http://localhost:4001' }),
  [string]$UserUrl = $(if ($env:USER_URL) { $env:USER_URL } else { 'http://localhost:4002' }),
  [string]$BillingUrl = $(if ($env:BILLING_URL) { $env:BILLING_URL } else { 'http://localhost:4010' }),
  [string]$NotificationUrl = $(if ($env:NOTIFY_URL) { $env:NOTIFY_URL } else { 'http://localhost:4012' }),
  [string]$InterviewUrl = $(if ($env:INTERVIEW_URL) { $env:INTERVIEW_URL } else { 'http://localhost:4013' }),
  [string]$AiUrl = $(if ($env:AI_URL) { $env:AI_URL } else { 'http://localhost:8000' }),
  [string]$SmokeEmail = $(if ($env:SMOKE_EMAIL) { $env:SMOKE_EMAIL } else { '' }),
  [string]$SmokePassword = $(if ($env:SMOKE_PASSWORD) { $env:SMOKE_PASSWORD } else { '' }),
  [string]$AccessToken = $(if ($env:ACCESS_TOKEN) { $env:ACCESS_TOKEN } else { '' })
)

$ErrorActionPreference = 'Stop'

$results = New-Object System.Collections.Generic.List[Object]
$token = $AccessToken

function Convert-ToJsonBody {
  param([Parameter(Mandatory = $true)]$Value)
  return ($Value | ConvertTo-Json -Depth 10)
}

function Invoke-Api {
  param(
    [Parameter(Mandatory = $true)][string]$Method,
    [Parameter(Mandatory = $true)][string]$Url,
    [object]$Body = $null,
    [string]$BearerToken = '',
    [hashtable]$Headers = @{}
  )

  $requestHeaders = @{}
  foreach ($k in $Headers.Keys) {
    $requestHeaders[$k] = $Headers[$k]
  }

  if ($BearerToken) {
    $requestHeaders['Authorization'] = "Bearer $BearerToken"
  }

  $payload = $null
  if ($null -ne $Body) {
    $payload = Convert-ToJsonBody -Value $Body
    if (-not $requestHeaders.ContainsKey('Content-Type')) {
      $requestHeaders['Content-Type'] = 'application/json'
    }
  }

  try {
    $response = Invoke-WebRequest -Method $Method -Uri $Url -Headers $requestHeaders -Body $payload -TimeoutSec 30
    $bodyObj = $null
    if ($response.Content) {
      try {
        $bodyObj = $response.Content | ConvertFrom-Json
      } catch {
        $bodyObj = $response.Content
      }
    }

    return [PSCustomObject]@{
      StatusCode = [int]$response.StatusCode
      Body = $bodyObj
      RawBody = $response.Content
      Url = $Url
      Method = $Method
    }
  } catch {
    if ($_.Exception.Response) {
      $status = [int]$_.Exception.Response.StatusCode
      $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
      $content = $reader.ReadToEnd()
      $bodyObj = $null
      if ($content) {
        try {
          $bodyObj = $content | ConvertFrom-Json
        } catch {
          $bodyObj = $content
        }
      }

      return [PSCustomObject]@{
        StatusCode = $status
        Body = $bodyObj
        RawBody = $content
        Url = $Url
        Method = $Method
      }
    }

    throw
  }
}

function Record-Result {
  param(
    [string]$Case,
    [bool]$Passed,
    [int]$Status,
    [string]$Expectation,
    [string]$Details
  )

  $results.Add([PSCustomObject]@{
    Case = $Case
    Passed = $Passed
    Status = $Status
    Expectation = $Expectation
    Details = $Details
  }) | Out-Null
}

function Assert-Status {
  param(
    [Parameter(Mandatory = $true)][string]$Case,
    [Parameter(Mandatory = $true)]$Response,
    [Parameter(Mandatory = $true)][int[]]$Expected,
    [string]$Details = ''
  )

  $passed = $Expected -contains [int]$Response.StatusCode
  $expectation = ($Expected -join ',')
  Record-Result -Case $Case -Passed $passed -Status ([int]$Response.StatusCode) -Expectation $expectation -Details $Details
}

# Step 1 + Step 10: Architecture/ops readiness probes
Assert-Status -Case 'health.auth' -Response (Invoke-Api -Method GET -Url "$AuthUrl/health") -Expected @(200)
Assert-Status -Case 'health.user' -Response (Invoke-Api -Method GET -Url "$UserUrl/health") -Expected @(200)
Assert-Status -Case 'ready.user' -Response (Invoke-Api -Method GET -Url "$UserUrl/health/ready") -Expected @(200,503)
Assert-Status -Case 'health.billing' -Response (Invoke-Api -Method GET -Url "$BillingUrl/health") -Expected @(200)
Assert-Status -Case 'health.notification' -Response (Invoke-Api -Method GET -Url "$NotificationUrl/health") -Expected @(200)
Assert-Status -Case 'health.interview' -Response (Invoke-Api -Method GET -Url "$InterviewUrl/health") -Expected @(200)
Assert-Status -Case 'health.ai' -Response (Invoke-Api -Method GET -Url "$AiUrl/health") -Expected @(200)
Assert-Status -Case 'ready.ai' -Response (Invoke-Api -Method GET -Url "$AiUrl/ready") -Expected @(200,503)

# Step 2: Auth flows + edge/security checks
$registerEmail = "day20.$([guid]::NewGuid().ToString('N').Substring(0,8))@example.com"
$registerPassword = 'Day20@Pass1234'
$registerRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/register" -Body @{
  email = $registerEmail
  password = $registerPassword
  fullName = 'Day 20 Test User'
}
Assert-Status -Case 'auth.register' -Response $registerRes -Expected @(201,409)

$invalidOtpRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/verify-email" -Body @{
  email = $registerEmail
  otp = '000000'
}
Assert-Status -Case 'auth.verify.invalid-otp' -Response $invalidOtpRes -Expected @(400)

$loginProbeEmail = if ($SmokeEmail) { $SmokeEmail } else { $registerEmail }
$loginProbePassword = if ($SmokePassword) { $SmokePassword } else { $registerPassword }
$loginRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/login" -Body @{
  email = $loginProbeEmail
  password = $loginProbePassword
}
Assert-Status -Case 'auth.login' -Response $loginRes -Expected @(200,401,403)
if ($loginRes.StatusCode -eq 200 -and $loginRes.Body -and $loginRes.Body.data -and $loginRes.Body.data.accessToken) {
  $token = $loginRes.Body.data.accessToken
}

$refreshInvalidRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/refresh" -Body @{ refreshToken = 'invalid-refresh-token' }
Assert-Status -Case 'auth.refresh.invalid-token' -Response $refreshInvalidRes -Expected @(401)

$forgotRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/forgot-password" -Body @{ email = $loginProbeEmail }
Assert-Status -Case 'auth.forgot-password' -Response $forgotRes -Expected @(200,404)

$resetInvalidRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/reset-password" -Body @{
  email = $loginProbeEmail
  otp = '111111'
  newPassword = 'New@Pass12345'
}
Assert-Status -Case 'auth.reset-password.invalid-otp' -Response $resetInvalidRes -Expected @(400,404)

$logoutRes = Invoke-Api -Method DELETE -Url "$AuthUrl/auth/logout" -Body @{ refreshToken = 'invalid-refresh-token' }
Assert-Status -Case 'auth.logout' -Response $logoutRes -Expected @(200)

$injectionLoginRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/login" -Body @{
  email = "' OR 1=1 --"
  password = 'bad-input'
}
Assert-Status -Case 'security.sqli.login' -Response $injectionLoginRes -Expected @(400,401)

# Step 14: JWT tampering check
$tampered = if ($token) { "$token.tampered" } else { 'bad.jwt.value' }
$tamperRes = Invoke-Api -Method GET -Url "$UserUrl/users/me" -BearerToken $tampered
Assert-Status -Case 'security.jwt.tamper' -Response $tamperRes -Expected @(401)

# Step 3 + 9 + 12 + 11 + 13 with auth fallback behavior
if ($token) {
  $meRes = Invoke-Api -Method GET -Url "$UserUrl/users/me" -BearerToken $token
  Assert-Status -Case 'user.me' -Response $meRes -Expected @(200)

  $targetRoleRes = Invoke-Api -Method POST -Url "$UserUrl/onboarding/target-role" -BearerToken $token -Body @{
    title = 'Backend Engineer'
    level = 'mid'
    industry = 'SaaS'
    locationPreference = 'Remote'
    keywords = @('node', 'fastify', 'postgres')
  }
  Assert-Status -Case 'onboarding.target-role' -Response $targetRoleRes -Expected @(201,402)

  $targetRoleInvalidRes = Invoke-Api -Method POST -Url "$UserUrl/onboarding/target-role" -BearerToken $token -Body @{
    title = '<script>alert(1)</script>'
    level = 'mid'
    keywords = @('x')
  }
  Assert-Status -Case 'onboarding.target-role.invalid' -Response $targetRoleInvalidRes -Expected @(400)

  $resumeRes = Invoke-Api -Method POST -Url "$UserUrl/onboarding/resume" -BearerToken $token -Body @{
    mode = 'draft'
    resume = @{
      title = 'Senior Backend Engineer'
      summary = 'Built scalable backend systems across identity, event processing, and analytics with measurable performance and reliability improvements over multiple releases.'
      skills = @(
        @{ name = 'TypeScript'; category = 'technical'; proficiency = 'advanced' },
        @{ name = 'Fastify'; category = 'technical'; proficiency = 'advanced' },
        @{ name = 'PostgreSQL'; category = 'technical'; proficiency = 'advanced' },
        @{ name = 'Redis'; category = 'tool'; proficiency = 'advanced' },
        @{ name = 'Docker'; category = 'tool'; proficiency = 'intermediate' }
      )
      experience = @(
        @{
          company = 'Think AI'
          role = 'Backend Engineer'
          location = 'Remote'
          startDate = '2022-01'
          endDate = ''
          isCurrent = $true
          bullets = @(
            'Built resilient queue workers with retry and dead-letter handling for async AI workloads.',
            'Optimized API performance and reduced p95 latency by introducing targeted read caching.'
          )
          technologies = @('Node.js', 'Fastify', 'PostgreSQL', 'Redis')
        }
      )
      projects = @(
        @{
          name = 'Validation Platform'
          role = 'Lead Engineer'
          url = 'https://example.com/project'
          bullets = @('Delivered a test orchestration workflow that improved release confidence and defect detection.')
          technologies = @('TypeScript', 'k6', 'Postman')
        }
      )
      education = @(
        @{
          institution = 'State University'
          degree = 'B.Tech'
          field = 'Computer Science'
          startYear = '2016'
          endYear = '2020'
          grade = '8.5 CGPA'
          highlights = @('Graduated with distinction')
        }
      )
    }
  }
  Assert-Status -Case 'onboarding.resume' -Response $resumeRes -Expected @(200,201,402)

  $recommendationRes = Invoke-Api -Method GET -Url "$UserUrl/user/recommendations?limit=5&refresh=false" -BearerToken $token
  Assert-Status -Case 'recommendation.list' -Response $recommendationRes -Expected @(200)

  $featureFlagRes = Invoke-Api -Method GET -Url "$UserUrl/feature-flags" -BearerToken $token
  Assert-Status -Case 'feature-flags.list' -Response $featureFlagRes -Expected @(200)

  $abVariantRes = Invoke-Api -Method GET -Url "$UserUrl/experiments/variant?experimentKey=onboarding-copy-v1" -BearerToken $token
  Assert-Status -Case 'ab.variant' -Response $abVariantRes -Expected @(200,404)

  $examStartRes = Invoke-Api -Method POST -Url "$UserUrl/exam/start" -BearerToken $token -Body @{
    skillName = 'Node.js'
    difficultyLevel = 2
    timeLimitSeconds = 1200
  }
  Assert-Status -Case 'exam.start' -Response $examStartRes -Expected @(201,402,429)

  $roadmapRes = Invoke-Api -Method POST -Url "$UserUrl/ai/roadmap/generate" -BearerToken $token -Body @{
    analysisRunId = [guid]::NewGuid().ToString()
    targetRole = 'Backend Engineer'
    durationDays = 90
  }
  Assert-Status -Case 'roadmap.generate' -Response $roadmapRes -Expected @(202,400,402,429)

  $interviewRes = Invoke-Api -Method POST -Url "$InterviewUrl/interview/sessions" -BearerToken $token -Body @{
    userId = 'day20-user'
    role = 'Backend Engineer'
    type = 'technical'
  }
  Assert-Status -Case 'interview.create-session' -Response $interviewRes -Expected @(201)

  $billingRes = Invoke-Api -Method GET -Url "$BillingUrl/billing/subscription" -BearerToken $token
  Assert-Status -Case 'billing.subscription' -Response $billingRes -Expected @(200,402,404)

  $notifyRes = Invoke-Api -Method GET -Url "$NotificationUrl/notifications" -BearerToken $token
  Assert-Status -Case 'notification.list' -Response $notifyRes -Expected @(200)
} else {
  Record-Result -Case 'auth.token.available' -Passed $false -Status 0 -Expectation '200 login OR ACCESS_TOKEN env' -Details 'No token available. Provide SMOKE_EMAIL/SMOKE_PASSWORD for verified user, or ACCESS_TOKEN for protected-route coverage.'
}

# Step 14 brute-force/rate-limit signal
$rateLimitHit = $false
for ($i = 0; $i -lt 12; $i++) {
  $rateRes = Invoke-Api -Method POST -Url "$AuthUrl/auth/login" -Body @{
    email = "ratelimit-$i@example.com"
    password = 'WrongPass123!'
  }

  if ($rateRes.StatusCode -eq 429) {
    $rateLimitHit = $true
    break
  }
}
Record-Result -Case 'security.rate-limit.login' -Passed $rateLimitHit -Status ($(if ($rateLimitHit) { 429 } else { 0 })) -Expectation '429 within burst attempts' -Details 'Detects brute-force controls on login endpoint.'

$failed = @($results | Where-Object { -not $_.Passed })
$results | Sort-Object Case | Format-Table -AutoSize

if ($failed.Count -gt 0) {
  Write-Host ''
  Write-Host "FAILED CASES: $($failed.Count)" -ForegroundColor Red
  $failed | Format-Table -AutoSize
  exit 1
}

Write-Host ''
Write-Host "All Day 20 smoke checks passed ($($results.Count) cases)." -ForegroundColor Green
exit 0
