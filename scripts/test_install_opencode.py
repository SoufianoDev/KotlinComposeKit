import os
import pathlib
import shutil
import subprocess
import tempfile
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
INSTALLER = ROOT / "scripts" / "install-opencode.sh"


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
            env["PATH"] = str(directory) + os.pathsep + env.get("PATH", "")
            env["MOCK_VERSION"] = version
            env["MOCK_LOG"] = str(log)
            result = subprocess.run(
                ["sh", str(INSTALLER)],
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
            "plugin", "add", "github:SoufianoDev/KotlinComposeKit", "--global"
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

    def test_requires_opencode(self):
        result, _ = self.run_installer("2.0.22", present=False)
        self.assertEqual(result.returncode, 127)
        self.assertIn("OpenCode was not found", result.stdout)


class OpenCodePowerShellInstallerTests(unittest.TestCase):
    powershell = shutil.which("pwsh") or shutil.which("powershell")
    installer = ROOT / "scripts" / "install-opencode.ps1"

    def run_installer(self, version, *, present=True):
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
            env["PATH"] = str(directory) + os.pathsep + env.get("PATH", "")
            env["MOCK_VERSION"] = version
            env["MOCK_LOG"] = str(log)
            result = subprocess.run(
                [
                    self.powershell,
                    "-NoProfile",
                    "-NonInteractive",
                    "-ExecutionPolicy",
                    "Bypass",
                    "-File",
                    str(self.installer),
                ],
                text=True,
                capture_output=True,
                env=env,
                check=False,
            )
            calls = log.read_text(encoding="utf-8").strip().split()
            return result, calls

    @unittest.skipUnless(powershell, "PowerShell is not installed")
    def test_v2_uses_native_global_plugin_add_command(self):
        result, args = self.run_installer("2.0.22")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            args,
            ["plugin", "add", "github:SoufianoDev/KotlinComposeKit", "--global"],
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
    def test_requires_opencode(self):
        result, _ = self.run_installer("2.0.22", present=False)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("OpenCode was not found", result.stderr)


if __name__ == "__main__":
    unittest.main()
