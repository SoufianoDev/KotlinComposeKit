import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "scripts" / "install-opencode.sh"


def path_without_opencode(directory):
    tools = directory / "system-tools"
    tools.mkdir()
    if os.name != "nt":
        for name in ("sh", "sed", "head", "awk"):
            executable = shutil.which(name)
            if executable:
                (tools / name).symlink_to(executable)
    return str(tools)



class OpenCodeInstallerTests(unittest.TestCase):
    def run_installer(self, version, *, present=True):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            log = directory / "calls.txt"
            executable = directory / "opencode"
            if present:
                executable.write_text(
                    "#!/bin/sh\n"
                    'if [ "$1" = "--version" ]; then printf "%s\\n" "$MOCK_VERSION"; exit 0; fi\n'
                    'printf "%s\\n" "$@" > "$MOCK_LOG"\n',
                    encoding="utf-8",
                )
                executable.chmod(0o755)
            env = os.environ.copy()
            env["PATH"] = (
                str(directory) + os.pathsep + env.get("PATH", "")
                if present else path_without_opencode(directory)
            )
            env["MOCK_VERSION"] = version
            env["MOCK_LOG"] = str(log)
            result = subprocess.run(
                [shutil.which("sh") or "sh", str(INSTALLER)],
                text=True,
                capture_output=True,
                env=env,
                check=False,
            )
            return result, log.read_text(encoding="utf-8").splitlines() if log.exists() else []

    def test_v2_uses_official_global_plugin_add_command(self):
        result, args = self.run_installer("2.0.22")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(args, [
            "plugin", "add", "github:SoufianoDev/KotlinComposeKit"
        ])

    def test_v1_uses_legacy_global_plugin_command(self):
        result, args = self.run_installer("1.18.29")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(args, [
            "plugin",
            "kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git",
            "--global",
        ])

    def test_rejects_versions_below_supported_minimum(self):
        for version in ("1.18.28", "2.0.21"):
            with self.subTest(version=version):
                result, _ = self.run_installer(version)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("too old", result.stderr)

    def test_rejects_unknown_major_version(self):
        result, _ = self.run_installer("3.0.0")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Unsupported OpenCode version", result.stderr)

    def test_requires_opencode_even_when_host_path_has_other_tools(self):
        result, _ = self.run_installer("2.0.22", present=False)
        self.assertEqual(result.returncode, 127)
        self.assertIn("OpenCode was not found", result.stdout)


class OpenCodePowerShellInstallerTests(unittest.TestCase):
    powershell = shutil.which("powershell") or shutil.which("pwsh")
    installer = ROOT / "scripts" / "install-opencode.ps1"

    def run_installer(self, version, *, present=True, expression=False, command_error=False):
        with tempfile.TemporaryDirectory() as temporary:
            directory = pathlib.Path(temporary)
            log = directory / "calls.txt"

            if present and os.name == "nt":
                executable = directory / "opencode.cmd"
                executable.write_text(
                    '@echo off\r\n'
                    'if "%1"=="--version" (echo %MOCK_VERSION%& exit /b 0)\r\n'
                    '> "%MOCK_LOG%" echo %*\r\n'
                    'exit /b 0\r\n',
                    encoding="utf-8",
                )
            elif present:
                executable = directory / "opencode"
                executable.write_text(
                    "#!/bin/sh\n"
                    'if [ "$1" = "--version" ]; then printf "%s\\n" "$MOCK_VERSION"; exit 0; fi\n'
                    'printf "%s\\n" "$@" > "$MOCK_LOG"\n',
                    encoding="utf-8",
                )
                executable.chmod(0o755)

            env = os.environ.copy()
            env["PATH"] = (
                str(directory) + os.pathsep + env.get("PATH", "")
                if present else path_without_opencode(directory)
            )
            env["MOCK_VERSION"] = version
            env["MOCK_LOG"] = str(log)
            command = [self.powershell, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass"]
            if expression:
                env["INSTALLER_PATH"] = str(self.installer)
                probe = 'function Get-Command { Write-Error "probe failure" }' if command_error else ""
                command.extend(["-Command", f"""
                    $ErrorActionPreference = 'Continue'
                    {probe}
                    try {{
                        Get-Content -Raw -LiteralPath $env:INSTALLER_PATH | Invoke-Expression
                        Write-Output 'INSTALLER_SUCCEEDED'
                    }} catch {{
                        Write-Output ('INSTALLER_ERROR: ' + $_.Exception.Message)
                    }}
                    Write-Output ('PREFERENCE: ' + $ErrorActionPreference)
                """])
            else:
                command.extend(["-File", str(self.installer)])
            result = subprocess.run(
                command,
                text=True,
                capture_output=True,
                env=env,
                check=False,
            )
            calls = log.read_text(encoding="utf-8").strip().split() if log.exists() else []
            return result, calls

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_v2_uses_native_global_plugin_add_command(self):
        result, args = self.run_installer("2.0.22")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            args,
            ["plugin", "add", "github:SoufianoDev/KotlinComposeKit"],
        )

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_v1_uses_native_global_plugin_command(self):
        result, args = self.run_installer("1.18.29")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            args,
            [
                "plugin",
                "kotlin-compose-kit@git+https://github.com/SoufianoDev/KotlinComposeKit.git",
                "--global",
            ],
        )

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_rejects_unsupported_versions(self):
        for version in ("1.18.28", "2.0.21", "3.0.0"):
            with self.subTest(version=version):
                result, _ = self.run_installer(version)
                self.assertNotEqual(result.returncode, 0)

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_requires_opencode_even_when_host_path_has_other_tools(self):
        result, _ = self.run_installer("2.0.22", present=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("OpenCode was not found", result.stderr)

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_expression_preserves_caller_preference_after_success_and_failure(self):
        for present in (True, False):
            with self.subTest(present=present):
                result, _ = self.run_installer("2.0.22", present=present, expression=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertIn("PREFERENCE: Continue", result.stdout)
                self.assertIn("INSTALLER_SUCCEEDED" if present else "OpenCode was not found", result.stdout)

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_expression_stops_on_nonterminating_errors(self):
        result, _ = self.run_installer("2.0.22", expression=True, command_error=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("INSTALLER_ERROR: probe failure", result.stdout)
        self.assertIn("PREFERENCE: Continue", result.stdout)
        self.assertNotIn("INSTALLER_SUCCEEDED", result.stdout)


if __name__ == "__main__":
    unittest.main()
