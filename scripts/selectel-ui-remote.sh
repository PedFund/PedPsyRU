#!/usr/bin/env bash
# Run on a pre-provisioned Selectel host as a low-privilege deploy user.
# Arguments are validated by the CI runner and validated again here.
set -Eeuo pipefail
mode="${1:-}"
app_root="${2:-}"
service="${3:-}"
base="${4:-}"
head="${5:-}"
old_hash="${6:-}"
new_hash="${7:-}"
stage_dir="${8:-}"
sha_re='^[0-9a-f]{40}$'
hash_re='^[0-9a-f]{64}$'
[[ "$mode" = status || "$mode" = apply ]] || { echo 'Invalid mode' >&2; exit 2; }
[[ "$app_root" =~ ^/opt/[a-zA-Z0-9_./-]+$ && "$app_root" != *..* && "$app_root" != *//* ]] || { echo 'Invalid app root' >&2; exit 2; }
[[ "$service" =~ ^[a-zA-Z0-9_.@-]+$ ]] || { echo 'Invalid service' >&2; exit 2; }
[[ -d "$app_root" && ! -L "$app_root" ]] || { echo 'Unknown app root' >&2; exit 2; }
css="$app_root/web/workspace/styles.css"
marker="$app_root/.mettest-deployed-git-sha"
[[ -f "$css" && ! -L "$css" && -f "$marker" && ! -L "$marker" ]] || { echo 'Missing verified CSS or deployment marker; bootstrap manually' >&2; exit 3; }
current="$(tr -d '\r\n' < "$marker")"
[[ "$current" =~ $sha_re ]] || { echo 'Invalid deployment marker' >&2; exit 3; }
if [[ "$mode" = status ]]; then
  printf 'deployed_sha=%s\ncss_sha256=%s\n' "$current" "$(sha256sum "$css" | cut -d' ' -f1)"
  exit 0
fi
[[ "$base" =~ $sha_re && "$head" =~ $sha_re && "$old_hash" =~ $hash_re && "$new_hash" =~ $hash_re ]] || { echo 'Invalid expected hashes' >&2; exit 2; }
[[ "$stage_dir" =~ ^/tmp/mettest-ui-cd\.[a-zA-Z0-9]+$ && -d "$stage_dir" ]] || { echo 'Invalid staging directory' >&2; exit 2; }
[[ "$current" = "$base" ]] || { echo "Deployment drift: live $current, expected $base" >&2; exit 4; }
[[ "$(sha256sum "$css" | cut -d' ' -f1)" = "$old_hash" ]] || { echo 'Live CSS differs from recorded release; refusing overwrite' >&2; exit 4; }
[[ -f "$stage_dir/styles.css" && ! -L "$stage_dir/styles.css" ]] || { echo 'Missing staged CSS' >&2; exit 4; }
[[ "$(sha256sum "$stage_dir/styles.css" | cut -d' ' -f1)" = "$new_hash" ]] || { echo 'Staged CSS checksum differs' >&2; exit 4; }
command -v flock >/dev/null && command -v curl >/dev/null || { echo 'flock/curl required' >&2; exit 4; }
exec 9>"$app_root/.mettest-ui-cd.lock"
flock -x 9
[[ "$(tr -d '\r\n' < "$marker")" = "$base" ]] || { echo 'Marker changed during deployment' >&2; exit 4; }
[[ "$(sha256sum "$css" | cut -d' ' -f1)" = "$old_hash" ]] || { echo 'CSS changed during deployment' >&2; exit 4; }
backup_dir="$app_root/.mettest-ui-backups"
mkdir -p "$backup_dir"
backup="$backup_dir/${base}-$(date -u +%Y%m%dT%H%M%SZ).css"
cp -p "$css" "$backup"
applied=0
committed=0
temp_css=''
restore_if_failed(){
  rc=$?
  trap - EXIT
  if [[ "$applied" = 1 && "$committed" = 0 ]]; then
    echo 'Deploy failed; restoring previous CSS and restarting service' >&2
    cp -p "$backup" "$css" || true
    sudo -n systemctl restart "$service" || echo 'Emergency: manual restart needed' >&2
  fi
  [[ -z "$temp_css" ]] || rm -f "$temp_css"
  exit "$rc"
}
trap restore_if_failed EXIT
temp_css="$(mktemp "$app_root/web/workspace/.styles.css.XXXXXXXX")"
install -m 0644 "$stage_dir/styles.css" "$temp_css"
mv -f "$temp_css" "$css"
temp_css=''
applied=1
sudo -n systemctl restart "$service"
sudo -n systemctl is-active --quiet "$service"
ok=0
for attempt in 1 2 3 4 5 6; do
  if curl -fsS --max-time 12 "https://mettest.vibemind.pro/health" >/dev/null; then
    downloaded="$(curl -fsS --max-time 12 -H 'Cache-Control: no-cache' "https://mettest.vibemind.pro/workspace/styles.css?cd=$head" | sha256sum | cut -d' ' -f1)" || downloaded=''
    if [[ "$downloaded" = "$new_hash" ]]; then ok=1; break; fi
  fi
  sleep 2
done
[[ "$ok" = 1 ]] || { echo 'Health or public CSS verification failed' >&2; exit 5; }
temp_marker="$(mktemp "$app_root/.mettest-deployed-sha.XXXXXXXX")"
printf '%s\n' "$head" > "$temp_marker"
mv -f "$temp_marker" "$marker"
committed=1
echo "DEPLOYED: $base -> $head; CSS SHA256 $new_hash"
