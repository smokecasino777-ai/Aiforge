import subprocess
import os
from fastapi import APIRouter, Depends, HTTPException
from core import ensure_admin, get_current_user, logger, GITHUB_TOKEN

router = APIRouter(tags=["git"])

def _get_authenticated_url(url: str) -> str:
    if not GITHUB_TOKEN or "github.com" not in url:
        return url
    # Replace https://github.com/... with https://<token>@github.com/...
    if url.startswith("https://"):
        return url.replace("https://", f"https://{GITHUB_TOKEN}@")
    return url

@router.get("/admin/git/status")
async def git_status(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        # Use a custom env to prevent git from prompting for credentials
        git_env = os.environ.copy()
        git_env["GIT_TERMINAL_PROMPT"] = "0"

        res = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, check=True, env=git_env)
        log = subprocess.run(["git", "log", "-n", "1", "--oneline"], capture_output=True, text=True, check=True, env=git_env)
        branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True, env=git_env)
        remote_res = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True, env=git_env)
        remote_url = remote_res.stdout.strip()

        return {
            "status": res.stdout,
            "last_commit": log.stdout.strip(),
            "branch": branch.stdout.strip(),
            "remote": remote_url.split("@")[-1] if "@" in remote_url else remote_url
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/git/pull")
async def git_pull(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        branch_res = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()

        remote_res = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
        remote_url = _get_authenticated_url(remote_res.stdout.strip())

        res = subprocess.run(["git", "pull", remote_url, branch], capture_output=True, text=True)
        return {"output": res.stdout + res.stderr}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/git/push")
async def git_push(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        branch_res = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()

        remote_res = subprocess.run(["git", "remote", "get-url", "origin"], capture_output=True, text=True)
        remote_url = _get_authenticated_url(remote_res.stdout.strip())

        res = subprocess.run(["git", "push", remote_url, branch], capture_output=True, text=True)
        return {"output": res.stdout + res.stderr}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

