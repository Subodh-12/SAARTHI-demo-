"""Pack routes — manifest list, download."""
from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse

from ...core.settings import get_settings
from ...domain.schemas import PackDownloadInfo, PackManifest
from ..middleware import require_device_auth

router = APIRouter(prefix="/packs", tags=["packs"])


@router.get("/manifest", response_model=list[PackManifest])
async def list_pack_manifests(request: Request):
    pack_repo = request.app.state.pack_repository
    return await pack_repo.list_pack_manifests()


@router.get("/{pack_id}/versions/{version}", response_model=PackDownloadInfo)
async def get_pack_download_info(
    pack_id: str, version: str,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    pack_repo = request.app.state.pack_repository
    m = await pack_repo.get_pack_manifest(pack_id, version)
    if not m:
        raise HTTPException(status_code=404, detail="pack not found")
    base = request.base_url
    url = f"{base}api/v1/packs/{pack_id}/versions/{version}/download"
    return PackDownloadInfo(
        pack_id=m.pack_id, version=m.version, url=url,
        byte_size=m.byte_size, checksum_sha256=m.checksum_sha256,
    )


@router.get("/{pack_id}/versions/{version}/download")
async def download_pack(
    pack_id: str, version: str,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    s = get_settings()
    p_path = Path(s.packs_dir) / f"{pack_id}-{version}.srt.tar.gz"
    if not p_path.exists():
        # Fall back to .json
        p_path = Path(s.packs_dir) / f"{pack_id}-{version}.json"
        if not p_path.exists():
            raise HTTPException(status_code=404, detail="pack file not found")
    # Record install on the device
    pack_repo = request.app.state.pack_repository
    device_id, _ = ctx
    # Read manifest for size/checksum
    m = await pack_repo.get_pack_manifest(pack_id, version)
    if m:
        await pack_repo.record_installed_pack(device_id, pack_id, version,
                                              m.byte_size, m.checksum_sha256)
    return FileResponse(p_path, media_type="application/gzip",
                        filename=p_path.name)


__all__ = ["router"]
