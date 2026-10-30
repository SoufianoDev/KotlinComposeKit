$ErrorActionPreference = "Stop"

$repository = "SoufianoDev/KotlinComposeKit"
$v1Package = "kotlin-compose-kit@git+https://github.com/$repository.git"
$v2Package = "github:$repository"

if (-not (Get-Command opencode -ErrorAction SilentlyContinue)) {
    throw "OpenCode was not found. Install OpenCode first: https://opencode.ai"
}

$versionOutput = (& opencode --version 2>&1 | Out-String).Trim()
$versionExitCode = $LASTEXITCODE
if ($versionExitCode -ne 0) {
    throw "Could not read the OpenCode version: $versionOutput"
}

$versionMatch = [regex]::Match($versionOutput, '(?<!\d)(\d+\.\d+\.\d+)(?!\d)')
if (-not $versionMatch.Success) {
    throw "Unrecognized OpenCode version output: $versionOutput"
}

$version = [version]$versionMatch.Groups[1].Value

switch ($version.Major) {
    1 {
        if ($version -lt [version]"1.18.29") {
            throw "OpenCode $version is too old. Version 1.18.29 or newer is required."
        }

        Write-Host "Installing KotlinComposeKit globally for OpenCode V1 ($version)..."
        & opencode plugin $v1Package --global
    }
    2 {
        if ($version -lt [version]"2.0.22") {
            throw "OpenCode $version is too old. Version 2.0.22 or newer is required."
        }

        Write-Host "Installing KotlinComposeKit globally for OpenCode V2 ($version)..."
        & opencode plugin add $v2Package --global
    }
    default {
        throw "Unsupported OpenCode version: $version. Supported versions are V1.18.29+ and V2.0.22+."
    }
}

$installExitCode = $LASTEXITCODE
if ($installExitCode -ne 0) {
    throw "OpenCode plugin installation failed with exit code $installExitCode."
}

Write-Host ""
Write-Host "KotlinComposeKit is installed globally. Restart OpenCode to load it."
