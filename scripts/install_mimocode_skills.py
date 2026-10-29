"""Install this repository's Agent Skills for native MiMo Code discovery."""

import argparse
import os
import shutil
import sys
from pathlib import Path
from typing import Mapping, Optional, Tuple


ROOT = Path(__file__).resolve().parents[1]
SKILLS_SOURCE = ROOT / "skills"


def global_skills_directory(
    environ: Optional[Mapping[str, str]] = None,
    home: Optional[Path] = None,
    platform: Optional[str] = None,
) -> Path:
    """Resolve MiMo Code's configured global skills directory."""
    env = os.environ if environ is None else environ
    mimocode_home = env.get("MIMOCODE_HOME")
    if mimocode_home:
        root = Path(mimocode_home).expanduser()
        if not root.is_absolute():
            raise ValueError("MIMOCODE_HOME must be an absolute path")
        return root / "config" / "skills"

    xdg_config_home = env.get("XDG_CONFIG_HOME")
    if xdg_config_home:
        root = Path(xdg_config_home).expanduser()
        if not root.is_absolute():
            raise ValueError("XDG_CONFIG_HOME must be an absolute path")
        return root / "mimocode" / "skills"

    current_platform = os.name if platform is None else platform
    if current_platform == "nt":
        appdata = env.get("APPDATA")
        if appdata:
            return Path(appdata).expanduser() / "mimocode" / "skills"
        base = (Path.home() if home is None else home) / "AppData" / "Roaming"
        return base / "mimocode" / "skills"

    return (Path.home() if home is None else home) / ".config" / "mimocode" / "skills"


def project_skills_directory(project_dir: Path) -> Path:
    """Resolve the Agent Skills-compatible project directory."""
    return project_dir.expanduser() / ".agents" / "skills"


def _contains_symlink(path: Path) -> bool:
    if path.is_symlink():
        return True
    return path.is_dir() and any(item.is_symlink() for item in path.rglob("*"))


def discover_skills(source_root: Path) -> Tuple[Path, ...]:
    """Return top-level skill directories, excluding other repository content."""
    if not source_root.is_dir():
        raise ValueError("Skills source directory does not exist: {}".format(source_root))

    skills = []
    for candidate in sorted(source_root.iterdir(), key=lambda item: item.name):
        if candidate.is_symlink():
            raise ValueError("Refusing symlinked skill source: {}".format(candidate))
        if candidate.is_dir() and (candidate / "SKILL.md").is_file():
            if _contains_symlink(candidate):
                raise ValueError("Refusing skill source containing symlinks: {}".format(candidate))
            skills.append(candidate)
    if not skills:
        raise ValueError("No skill directories containing SKILL.md found in {}".format(source_root))
    return tuple(skills)


def install_skills(
    source_root: Path,
    destination: Path,
    *,
    force: bool = False,
    dry_run: bool = False,
) -> Tuple[Tuple[str, ...], Tuple[str, ...]]:
    """Copy skills, skipping existing directories unless forced.

    Forced installs update repository-managed files but retain extra files already
    present in an installed skill directory. Existing symlinks are rejected before
    writes so installation cannot accidentally write through one.
    """
    skills = discover_skills(source_root)
    destination = destination.expanduser()

    if destination.is_symlink():
        raise ValueError("Refusing symlinked destination directory: {}".format(destination))
    if destination.exists() and not destination.is_dir():
        raise ValueError("Destination exists and is not a directory: {}".format(destination))

    planned = []
    skipped = []
    for source in skills:
        target = destination / source.name
        if target.is_symlink():
            raise ValueError("Refusing symlinked destination skill: {}".format(target))
        if target.exists() and not target.is_dir():
            raise ValueError("Destination skill path exists and is not a directory: {}".format(target))
        if target.exists() and not force:
            skipped.append(source.name)
            continue
        if target.exists() and force and _contains_symlink(target):
            raise ValueError("Refusing to update destination skill containing symlinks: {}".format(target))
        planned.append((source, target))

    if not dry_run and planned:
        destination.mkdir(parents=True, exist_ok=True)
        for source, target in planned:
            shutil.copytree(source, target, dirs_exist_ok=target.exists())

    return tuple(source.name for source, _ in planned), tuple(skipped)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--scope",
        choices=("user", "project"),
        default="user",
        help="Install globally for the current user (default) or into a project",
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project root used with --scope project (default: current directory)",
    )
    parser.add_argument(
        "--destination",
        type=Path,
        help="Override the destination skills directory",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Update existing skills with repository files; preserve additional local files",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be installed without writing files",
    )
    args = parser.parse_args(argv)

    try:
        if args.destination:
            destination = args.destination
        elif args.scope == "project":
            destination = project_skills_directory(args.project_dir)
        else:
            destination = global_skills_directory()
        installed, skipped = install_skills(
            SKILLS_SOURCE,
            destination,
            force=args.force,
            dry_run=args.dry_run,
        )
    except (OSError, ValueError) as error:
        print("MiMo Code skill installation failed: {}".format(error), file=sys.stderr)
        return 1

    action = "Would install" if args.dry_run else "Installed"
    if installed:
        print("{} {} skill(s) in {}:".format(action, len(installed), destination))
        for name in installed:
            print("  {}".format(name))
    if skipped:
        print("Skipped {} existing skill(s): {}".format(len(skipped), ", ".join(skipped)))
        print("Use --force to update their repository-managed files.")
    if not installed and not skipped:
        print("No skills found to install.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
