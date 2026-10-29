import tempfile
import unittest
from pathlib import Path

from scripts.install_mimocode_skills import (
    global_skills_directory,
    install_skills,
    project_skills_directory,
)


class MiMoCodeSkillInstallerTest(unittest.TestCase):
    def test_mimocode_home_takes_precedence(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / "mimo-home"
            result = global_skills_directory(
                {"MIMOCODE_HOME": str(root), "XDG_CONFIG_HOME": "/ignored"},
                home=Path(directory),
            )
            self.assertEqual(root / "config" / "skills", result)

    def test_xdg_config_home_is_used_when_mimocode_home_is_unset(self):
        with tempfile.TemporaryDirectory() as directory:
            xdg = Path(directory) / "xdg-config"
            result = global_skills_directory({"XDG_CONFIG_HOME": str(xdg)}, home=Path(directory))
            self.assertEqual(xdg / "mimocode" / "skills", result)

    def test_default_global_and_windows_paths(self):
        home = Path("/tmp/example-home")
        self.assertEqual(
            home / ".config" / "mimocode" / "skills",
            global_skills_directory({}, home=home, platform="posix"),
        )
        self.assertEqual(
            Path("C:/Users/example/AppData/Roaming/mimocode/skills"),
            global_skills_directory(
                {"APPDATA": "C:/Users/example/AppData/Roaming"},
                home=home,
                platform="nt",
            ),
        )

    def test_rejects_relative_mimocode_home_and_xdg_config_home(self):
        with self.assertRaisesRegex(ValueError, "MIMOCODE_HOME"):
            global_skills_directory({"MIMOCODE_HOME": "relative/path"})
        with self.assertRaisesRegex(ValueError, "XDG_CONFIG_HOME"):
            global_skills_directory({"XDG_CONFIG_HOME": "relative/path"})

    def test_project_directory_uses_agents_compatibility_path(self):
        project = Path("/tmp/sample-project")
        self.assertEqual(project / ".agents" / "skills", project_skills_directory(project))

    def test_installs_skill_and_nested_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            destination = root / "destination"
            skill = source / "compose-helper"
            (skill / "references").mkdir(parents=True)
            (skill / "SKILL.md").write_text("name: compose-helper\n", encoding="utf-8")
            (skill / "references" / "guide.md").write_text("guide\n", encoding="utf-8")
            (source / "not-a-skill").mkdir()
            (source / "README.md").write_text("not a skill", encoding="utf-8")

            installed, skipped = install_skills(source, destination)

            self.assertEqual(("compose-helper",), installed)
            self.assertEqual((), skipped)
            self.assertEqual(
                "name: compose-helper\n",
                (destination / "compose-helper" / "SKILL.md").read_text(encoding="utf-8"),
            )
            self.assertEqual(
                "guide\n",
                (destination / "compose-helper" / "references" / "guide.md").read_text(encoding="utf-8"),
            )
            self.assertFalse((destination / "not-a-skill").exists())

    def test_existing_skill_is_skipped_without_force(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            target = root / "destination" / "compose-helper"
            (source / "compose-helper").mkdir(parents=True)
            (source / "compose-helper" / "SKILL.md").write_text("new\n", encoding="utf-8")
            target.mkdir(parents=True)
            (target / "SKILL.md").write_text("custom\n", encoding="utf-8")

            installed, skipped = install_skills(source, target.parent)

            self.assertEqual((), installed)
            self.assertEqual(("compose-helper",), skipped)
            self.assertEqual("custom\n", (target / "SKILL.md").read_text(encoding="utf-8"))

    def test_force_updates_managed_files_but_preserves_extra_local_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_skill = root / "source" / "compose-helper"
            target = root / "destination" / "compose-helper"
            source_skill.mkdir(parents=True)
            target.mkdir(parents=True)
            (source_skill / "SKILL.md").write_text("new\n", encoding="utf-8")
            (target / "SKILL.md").write_text("old\n", encoding="utf-8")
            (target / "local-notes.md").write_text("keep\n", encoding="utf-8")

            installed, skipped = install_skills(root / "source", target.parent, force=True)

            self.assertEqual(("compose-helper",), installed)
            self.assertEqual((), skipped)
            self.assertEqual("new\n", (target / "SKILL.md").read_text(encoding="utf-8"))
            self.assertEqual("keep\n", (target / "local-notes.md").read_text(encoding="utf-8"))

    def test_dry_run_does_not_create_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_skill = root / "source" / "compose-helper"
            destination = root / "not-created" / "skills"
            source_skill.mkdir(parents=True)
            (source_skill / "SKILL.md").write_text("skill\n", encoding="utf-8")

            installed, skipped = install_skills(root / "source", destination, dry_run=True)

            self.assertEqual(("compose-helper",), installed)
            self.assertEqual((), skipped)
            self.assertFalse(destination.exists())

    def test_force_refuses_to_write_through_symlink_in_existing_skill(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source_skill = root / "source" / "compose-helper"
            target = root / "destination" / "compose-helper"
            external = root / "external.md"
            source_skill.mkdir(parents=True)
            target.mkdir(parents=True)
            (source_skill / "SKILL.md").write_text("new\n", encoding="utf-8")
            (target / "SKILL.md").write_text("old\n", encoding="utf-8")
            external.write_text("outside\n", encoding="utf-8")
            (target / "external.md").symlink_to(external)

            with self.assertRaisesRegex(ValueError, "symlinks"):
                install_skills(root / "source", target.parent, force=True)
            self.assertEqual("old\n", (target / "SKILL.md").read_text(encoding="utf-8"))
            self.assertEqual("outside\n", external.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
