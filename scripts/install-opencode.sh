#!/bin/sh
set -eu

REPOSITORY="SoufianoDev/KotlinComposeKit"
V1_PACKAGE="kotlin-compose-kit@git+https://github.com/${REPOSITORY}.git"
V2_PACKAGE="github:${REPOSITORY}"

if ! command -v opencode >/dev/null 2>&1; then
  printf '%s\n' "OpenCode was not found. Install OpenCode first: https://opencode.ai"
  exit 127
fi

version_output="$(opencode --version 2>&1)" || {
  printf 'Could not read the OpenCode version: %s\n' "$version_output" >&2
  exit 1
}
version="$(printf '%s\n' "$version_output" | sed -nE 's/.*([0-9]+\.[0-9]+\.[0-9]+).*/\1/p' | head -n 1)"
if [ -z "$version" ]; then
  printf 'Unrecognized OpenCode version output: %s\n' "$version_output" >&2
  exit 1
fi

major="${version%%.*}"
case "$major" in
  2)
    if ! awk -v v="$version" 'BEGIN {
      split(v,a,"."); split("2.0.22",b,".");
      for(i=1;i<=3;i++){if(a[i]+0>b[i]+0)exit 0;if(a[i]+0<b[i]+0)exit 1}
      exit 0
    }'; then
      printf 'OpenCode %s is too old. Version 2.0.22 or newer is required.\n' "$version" >&2
      exit 1
    fi
    printf 'Installing KotlinComposeKit globally for OpenCode V2 (%s)...\n' "$version"
    opencode plugin add "$V2_PACKAGE"
    ;;
  1)
    if ! awk -v v="$version" 'BEGIN {
      split(v,a,"."); split("1.18.29",b,".");
      for(i=1;i<=3;i++){if(a[i]+0>b[i]+0)exit 0;if(a[i]+0<b[i]+0)exit 1}
      exit 0
    }'; then
      printf 'OpenCode %s is too old. Version 1.18.29 or newer is required.\n' "$version" >&2
      exit 1
    fi
    printf 'Installing KotlinComposeKit globally for OpenCode V1 (%s)...\n' "$version"
    opencode plugin "$V1_PACKAGE" --global
    ;;
  *)
    printf 'Unsupported OpenCode version: %s. Supported versions are V1.18.29+ and V2.0.22+.\n' "$version" >&2
    exit 1
    ;;
esac

printf '\nKotlinComposeKit is installed globally. Restart OpenCode to load it.\n'
