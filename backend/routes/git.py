import base64
import os
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from fastapi import APIRouter, Depends, HTTPException
from core import ensure_admin, get_current_user, GITHUB_TOKEN

router = APIRouter(tags=["git"])

# Git commands must run from the checkout root, not from whichever directory
# the API server happened to be launched in (often `backend/`).
REPO_ROOT = Path(__file__).resolve().parents[2]
GIT_TIMEOUT_SECONDS = 120


def _git_env() -> dict:
    """Disable interactive credential prompts and pass GitHub auth securely."""
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"

    # Use an HTTP header rather than putting the token in the remote URL or
    # command-line arguments, where it could be logged or exposed in process
    # listings. This also leaves the configured `origin` URL untouched.
    if GITHUB_TOKEN:
        try:
            config_count = int(env.get("GIT_CONFIG_COUNT", "0"))
        except ValueError:
            config_count = 0
        env["GIT_CONFIG_COUNT"] = str(config_count + 1)
        env[f"GIT_CONFIG_KEY_{config_count}"] = "http.https://github.com/.extraheader"
        credential = base64.b64encode(f"x-access-token:{GITHUB_TOKEN}".encode()).decode()
        env[f"GIT_CONFIG_VALUE_{config_count}"] = f"AUTHORIZATION: basic {credential}"

    return env


def _run_git(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args],
        cwd=REPO_ROOT,
        env=_git_env(),
        capture_output=True,
        text=True,
        timeout=GIT_TIMEOUT_SECONDS,
        check=False,
    )


def _git_output(*args: str) -> str:
    result = _run_git(*args)
    if result.returncode != 0:
        message = (result.stderr or result.stdout).strip()
        raise RuntimeError(message or f"git {' '.join(args)} failed")
    return result.stdout.strip()


def _safe_remote_url(url: str) -> str:
    """Remove embedded HTTP credentials before returning a remote to clients."""
    parts = urlsplit(url)
    if parts.scheme and parts.hostname and (parts.username or parts.password):
        host = parts.hostname
        if parts.port:
            host = f"{host}:{parts.port}"
        return urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))
    return url


def _current_branch() -> str:
    branch = _git_output("branch", "--show-current")
    if not branch:
        raise RuntimeError("The checkout is in a detached HEAD state; switch to a branch before syncing.")
    return branch


def _sync_error(result: subprocess.CompletedProcess) -> HTTPException:
    output = (result.stdout + result.stderr).strip()
    return HTTPException(status_code=502, detail=output or "Git remote operation failed.")


@router.get("/admin/git/status")
async def git_status(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        status = _git_output("status", "--short")
        last_commit = _git_output("log", "-n", "1", "--oneline")
        branch = _current_branch()
        remote = _safe_remote_url(_git_output("remote", "get-url", "origin"))
        return {
            "status": status,
            "last_commit": last_commit,
            "branch": branch,
            "remote": remote,
        }
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timed out while reading Git status.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/git/pull")
async def git_pull(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        branch = _current_branch()
        result = _run_git("pull", "--ff-only", "origin", branch)
        if result.returncode != 0:
            raise _sync_error(result)
        return {"output": result.stdout + result.stderr}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timed out while pulling from GitHub.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/admin/git/push")
async def git_push(user: dict = Depends(get_current_user)):
    await ensure_admin(user)
    try:
        branch = _current_branch()
        result = _run_git("push", "origin", branch)
        if result.returncode != 0:
            raise _sync_error(result)
        return {"output": result.stdout + result.stderr}
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Timed out while pushing to GitHub.")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
