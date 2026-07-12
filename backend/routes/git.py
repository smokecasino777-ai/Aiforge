import subprocess
from fastapi import APIRouter, Depends, HTTPException
from core import ensure_admin, get_current_user, logger

router = APIRouter(tags=["git"])

@router.get("/admin/git/status")
async def git_status(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        res = subprocess.run(["git", "status", "--short"], capture_output=True, text=True, check=True)
        log = subprocess.run(["git", "log", "-n", "1", "--oneline"], capture_output=True, text=True, check=True)
        branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True)
        return {
            "status": res.stdout,
            "last_commit": log.stdout.strip(),
            "branch": branch.stdout.strip()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/git/pull")
async def git_pull(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        # We use origin and the current branch
        branch_res = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()
        res = subprocess.run(["git", "pull", "origin", branch], capture_output=True, text=True)
        return {"output": res.stdout + res.stderr}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/admin/git/push")
async def git_push(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        branch_res = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True, check=True)
        branch = branch_res.stdout.strip()
        # Note: This assumes the environment has git credentials configured
        res = subprocess.run(["git", "push", "origin", branch], capture_output=True, text=True)
        return {"output": res.stdout + res.stderr}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
