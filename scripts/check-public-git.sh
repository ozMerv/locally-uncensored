#!/bin/sh
# Conservative pre-publication scanner for commits not on the reviewed base.
# The caller must still inspect every diff manually.
set -eu
base_ref="${1:-master}"
head_ref="${2:-HEAD}"
base=$(git merge-base "$base_ref" "$head_ref") || {
  echo "BLOCKED: cannot establish reviewed base" >&2
  exit 1
}
for commit in $(git rev-list --reverse "$base..$head_ref"); do
  if git diff-tree --no-commit-id -r --name-only "$commit" |
    grep -Ei '(^|/)(\.env($|\.)|id_(rsa|ed25519)|.*\.(pem|p12|pfx)|hosts\.yml|secrets?\.json)' |
    grep -Ev '(^|/)\.env\.example$' >/dev/null; then
    echo "BLOCKED: secret/config file in commit $commit" >&2
    exit 1
  fi
  # Match additions only. Treat all literal IPv4 endpoints as suspect to
  # prevent publishing home infrastructure, even in tests and examples.
  if git show --format= --unified=0 "$commit" |
    grep '^+[^+]' |
    grep -Ei '([0-9]{1,3}\.){3}[0-9]{1,3}|([a-z0-9.-]+\.(lan|home|home\.arpa|internal))(:[0-9]+)?|ghp_[A-Za-z0-9]{20}|sk-[A-Za-z0-9]{20}' >/dev/null; then
    echo "BLOCKED: network address, private hostname or token in commit $commit" >&2
    exit 1
  fi
done
echo "Privacy scan passed for $base_ref..$head_ref (manual review still required)."
