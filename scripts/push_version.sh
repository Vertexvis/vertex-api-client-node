#!/bin/bash
set -o errexit -o noclobber -o nounset

function git_current_branch() {
  local ref
  ref=$(git symbolic-ref --quiet HEAD 2> /dev/null)
  local ret=$?

  if [[ $ret != 0 ]]; then
    [[ $ret == 128 ]] && return  # no git repo.
    ref=$(git rev-parse --short HEAD 2> /dev/null) || return
  fi
  echo "${ref#refs/heads/}"
}

yarn generate

git commit --all --message "Update to latest spec"

yarn version --"${1:-patch}"

git push --set-upstream origin "$(git_current_branch)"

gh pr create --reviewer jareddellitt,kbpope,therockstorm --title "[$(git_current_branch | tr '[:lower:]' '[:upper:]')]: Update to latest spec" --body ""
