#!/usr/bin/env bash
# shellcheck source=./utils.sh
. "$(pwd)"/scripts/utils.sh
set -o errexit -o noclobber -o nounset

function git_current_branch() {
  local ref
  ref=$(git symbolic-ref --quiet HEAD 2> /dev/null)
  local ret=$?

  if [[ $ret != 0 ]]; then
    [[ $ret == 128 ]] && return
    ref=$(git rev-parse --short HEAD 2> /dev/null) || return
  fi
  echo "${ref#refs/heads/}"
}

function generate_client() {
  yarn generate
  yarn verify
}

function version_package() {
  old_ver=$(get_version)

  yarn version --"${1:-patch}"

  new_ver=$(get_version)

  # Update version in `user-agent` header
  sed -i "" "s|vertex-api-client-node/${old_ver}|vertex-api-client-node/${new_ver}|" client/vertex-client.ts
}

function create_pull_request() {
  git commit --all --message "Update to latest spec"
  git push --set-upstream origin "$(git_current_branch)"
  gh pr create --reviewer jareddellitt,kbpope,therockstorm --title "[$(git_current_branch | tr '[:lower:]' '[:upper:]')]: Update to latest spec" --body "$(cat ../.github/pull_request_template.md)"
}

generate_client
version_package "$@"
create_pull_request
