"""
Public download redirect endpoints.

GET /api/v1/download/mac     → redirects to the latest macOS .dmg
GET /api/v1/download/windows → redirects to the latest Windows .exe
GET /api/v1/download/latest  → returns the release JSON (version, assets, notes)

These call the GitHub Releases API so the URL always points to the
newest published release regardless of the version number in the filename.
If GITHUB_TOKEN is set in env, it is used for private-repo access.
"""

import os
import httpx
from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse, JSONResponse

router = APIRouter(tags=["download"])

REPO = "brayohmurithidev/fazicore-pos"
GITHUB_API = f"https://api.github.com/repos/{REPO}/releases/latest"


async def _fetch_latest() -> dict:
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    token = os.getenv("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(GITHUB_API, headers=headers)

    if resp.status_code == 404:
        raise HTTPException(404, "No published release found")
    if resp.status_code != 200:
        raise HTTPException(502, "Could not reach GitHub API")
    return resp.json()


def _find_asset(assets: list[dict], suffix: str) -> str | None:
    for asset in assets:
        if asset["name"].endswith(suffix):
            return asset["browser_download_url"]
    return None


@router.get("/download/latest")
async def release_info():
    """Return the latest release metadata (version, notes, asset URLs)."""
    data = await _fetch_latest()
    assets = data.get("assets", [])
    return JSONResponse({
        "version": data.get("tag_name", "").lstrip("v"),
        "tag":     data.get("tag_name"),
        "notes":   data.get("body", ""),
        "mac_url": _find_asset(assets, "_universal.dmg"),
        "win_url": _find_asset(assets, "_x64-setup.exe"),
        "msi_url": _find_asset(assets, "_x64_en-US.msi"),
    })


@router.get("/download/mac")
async def download_mac():
    """Redirect to the latest macOS universal DMG."""
    data = await _fetch_latest()
    url = _find_asset(data.get("assets", []), "_universal.dmg")
    if not url:
        raise HTTPException(404, "macOS asset not found in latest release")
    return RedirectResponse(url, status_code=302)


@router.get("/download/windows")
async def download_windows():
    """Redirect to the latest Windows NSIS installer."""
    data = await _fetch_latest()
    url = _find_asset(data.get("assets", []), "_x64-setup.exe")
    if not url:
        raise HTTPException(404, "Windows asset not found in latest release")
    return RedirectResponse(url, status_code=302)
