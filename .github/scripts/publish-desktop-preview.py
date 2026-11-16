import base64
import hashlib
import json
import os
import re
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener


REPOSITORY = "zht-innovation/zhterp-desktop"
FEED_BRANCH = "desktop-preview-feed"
FEED_PATH = f"/contents/latest.json?ref={FEED_BRANCH}"
WINDOWS = "zh-erp-windows-x64-setup.exe"
MACOS = "zh-erp-macos-universal.app.tar.gz"
PAYLOAD_NAMES = (WINDOWS, f"{WINDOWS}.sig", "zh-erp-macos-universal.dmg", MACOS, f"{MACOS}.sig")


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


HTTP = build_opener(NoRedirects())


def github_request(method, path, *, payload=None, asset=None, allow=()):
    host = "api.github.com" if asset is None else "uploads.github.com"
    headers = {
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
        "User-Agent": "zhterp-desktop-preview-publisher",
        "X-GitHub-Api-Version": "2026-03-10",
    }
    url = f"https://{host}/repos/{REPOSITORY}{path}"
    body = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        body = json.dumps(payload).encode("utf-8")
    if asset is not None:
        headers["Content-Type"] = "application/octet-stream"
        headers["Content-Length"] = str(asset.stat().st_size)
        url += "?" + urlencode({"name": asset.name})

    def send(data):
        request = Request(url, data=data, headers=headers, method=method)
        try:
            with HTTP.open(request, timeout=120) as response:
                content = response.read()
                return response.status, json.loads(content) if content else None
        except HTTPError as error:
            if error.code in allow:
                return error.code, None
            raise RuntimeError(f"GitHub {method} {path} failed (HTTP {error.code}).") from error

    if asset is not None:
        with asset.open("rb") as source:
            return send(source)
    return send(body)


def version_parts(version):
    if not isinstance(version, str) or not re.fullmatch(r"(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)", version):
        raise ValueError("Expected a three-part release version without leading zeroes.")
    return tuple(int(part) for part in version.split("."))


def verify_source_tag(tag, commit):
    _, repository = github_request("GET", "")
    if repository.get("visibility") != "public" or repository["full_name"] != REPOSITORY:
        raise ValueError(f"The updater requires public repository {REPOSITORY}.")
    _, ref = github_request("GET", f"/git/ref/tags/{tag}")
    target = ref["object"]
    while target["type"] == "tag":
        _, annotated_tag = github_request("GET", f"/git/tags/{target['sha']}")
        target = annotated_tag["object"]
    if target["type"] != "commit" or target["sha"] != commit:
        raise ValueError(f"Tag {tag} no longer points at the validated commit.")


def json_bytes(value):
    return (json.dumps(value, sort_keys=True, indent=2) + "\n").encode("utf-8")


def file_digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()


def prepare_assets(directory, version, tag):
    if {path.name for path in directory.iterdir()} != set(PAYLOAD_NAMES):
        raise ValueError("The two build artifacts did not supply the expected five files.")
    digests = {}
    for name in PAYLOAD_NAMES:
        path = directory / name
        if path.is_symlink() or not path.is_file() or path.stat().st_size == 0:
            raise ValueError(f"Missing or invalid release file: {name}.")
        digests[name] = file_digest(path)

    platforms = {}
    for platform, name in (("windows-x86_64", WINDOWS), ("darwin-x86_64", MACOS), ("darwin-aarch64", MACOS)):
        signature = (directory / f"{name}.sig").read_text(encoding="ascii").strip()
        if not base64.b64decode(signature, validate=True):
            raise ValueError(f"Invalid updater signature for {name}.")
        platforms[platform] = {
            "signature": signature,
            "url": f"https://github.com/{REPOSITORY}/releases/download/{tag}/{name}",
        }

    manifest = {"version": version, "platforms": platforms}
    checksums = "".join(f"{digest}  {name}\n" for name, digest in digests.items())
    (directory / "SHA256SUMS.txt").write_text(checksums, encoding="ascii")
    (directory / "latest.json").write_bytes(json_bytes(manifest))
    for name in ("SHA256SUMS.txt", "latest.json"):
        digests[name] = file_digest(directory / name)
    return manifest, digests


def find_release(tag):
    status, release = github_request("GET", f"/releases/tags/{tag}", allow=(404,))
    if status == 200:
        return release

    page = 1
    match = None
    while True:
        # The tag endpoint excludes drafts. Authenticated release listings include them.
        _, releases = github_request("GET", f"/releases?per_page=100&page={page}")
        for release in releases:
            if release["tag_name"] == tag:
                if match is not None:
                    raise ValueError(f"Multiple releases refer to {tag}; resolve the duplicates in GitHub.")
                match = release
        if len(releases) < 100:
            return match
        page += 1


def verify_asset(asset, name, digest):
    if asset["name"] != name or asset["state"] != "uploaded" or asset.get("digest") != f"sha256:{digest}":
        raise ValueError(f"Remote release asset {name} differs from the build artifact.")


def publish_release(directory, digests, version, tag, commit):
    release = find_release(tag)
    if release is None:
        _, release = github_request("POST", "/releases", payload={
            "tag_name": tag,
            "target_commitish": commit,
            "name": f"ZH ERP 预发 {version}",
            "draft": True,
            "prerelease": True,
            "make_latest": "false",
        })
    if not release["prerelease"]:
        raise ValueError(f"Release {tag} exists without the prerelease flag.")

    release_path = f"/releases/{release['id']}"
    _, remote_assets = github_request("GET", f"{release_path}/assets?per_page=100")
    existing = set()
    for asset in remote_assets:
        name = asset["name"]
        if name not in digests or name in existing:
            raise ValueError(f"Unexpected release asset: {name}.")
        if release["draft"] and asset["state"] == "starter":
            # GitHub can retain an empty asset after a failed upload.
            github_request("DELETE", f"/releases/assets/{asset['id']}")
            continue
        verify_asset(asset, name, digests[name])
        existing.add(name)

    missing = [name for name in digests if name not in existing]
    if not release["draft"]:
        if missing:
            raise ValueError(f"Published release {tag} is missing: {', '.join(missing)}.")
        return

    for name in missing:
        _, uploaded = github_request("POST", f"{release_path}/assets", asset=directory / name)
        verify_asset(uploaded, name, digests[name])
    _, published = github_request("PATCH", release_path, payload={"draft": False, "make_latest": "false"})
    if published["draft"] or not published["prerelease"]:
        raise ValueError(f"Release {tag} was not published as a prerelease.")


def advance_feed(manifest):
    ref = f"refs/heads/{FEED_BRANCH}"
    status, _ = github_request("GET", f"/git/ref/heads/{FEED_BRANCH}", allow=(404,))
    if status == 404:
        _, main_ref = github_request("GET", "/git/ref/heads/main")
        status, _ = github_request(
            "POST", "/git/refs", payload={"ref": ref, "sha": main_ref["object"]["sha"]}, allow=(409, 422),
        )
        if status != 201:
            github_request("GET", f"/git/ref/heads/{FEED_BRANCH}")

    release_version = version_parts(manifest["version"])
    for _ in range(3):
        status, current_file = github_request("GET", FEED_PATH, allow=(404,))
        feed = dict(manifest)
        body = {"branch": FEED_BRANCH, "message": f"Publish desktop preview {manifest['version']}"}
        if status == 200:
            current = json.loads(base64.b64decode(current_file["content"]))
            current_version = version_parts(current["version"])
            if "paused" in current:
                if type(current["paused"]) is not bool:
                    raise ValueError("The update feed's paused field must be a boolean.")
                feed["paused"] = current["paused"]
            if current_version > release_version:
                print(f"The preview feed already points to newer release {current['version']}.")
                return
            if current_version == release_version:
                if current != feed:
                    raise ValueError("The same version already points to different update metadata.")
                return
            body["sha"] = current_file["sha"]

        body["content"] = base64.b64encode(json_bytes(feed)).decode("ascii")
        status, _ = github_request("PUT", "/contents/latest.json", payload=body, allow=(409, 422))
        if status in (200, 201):
            return
    raise RuntimeError("The preview feed could not be updated. Check branch rules and retry the publish job.")


def main():
    if os.environ["GITHUB_REPOSITORY"] != REPOSITORY:
        raise ValueError(f"Run this publisher only in {REPOSITORY}.")
    version = os.environ["RELEASE_VERSION"]
    commit = os.environ["RELEASE_COMMIT"]
    version_parts(version)
    tag = f"desktop-preview-v{version}"
    if tag != os.environ["GITHUB_REF_NAME"] or not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise ValueError("Invalid preview release tag or commit.")
    verify_source_tag(tag, commit)
    directory = Path(sys.argv[1])
    manifest, digests = prepare_assets(directory, version, tag)
    publish_release(directory, digests, version, tag, commit)
    advance_feed(manifest)
    print(f"GitHub preview release verified: {tag}.")


if __name__ == "__main__":
    try:
        main()
    except (KeyError, OSError, RuntimeError, ValueError) as error:
        sys.exit(f"Preview publish failed: {error}")
