"""Public asset downloads — Play Store / App Store icons & graphics.

Serves files from /app/playstore_assets via authenticated-free URLs so the
owner can grab them straight from their phone or browser when uploading to
the Google Play Console or Apple App Store Connect.
"""
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

ASSETS_DIR = Path("/app/playstore_assets")

router = APIRouter(tags=["assets"])

# Whitelist exactly the files we want exposed.
_ALLOWED = {
    "aiforge_play_icon_512.png",
    "aiforge_icon_1024.png",
    "aiforge_feature_graphic_1024x500.png",
    "aiforge_adaptive_foreground_1024.png",
    "aiforge_themed_icon_432.png",
}


@router.get("/assets/playstore/{filename}")
async def get_playstore_asset(filename: str, inline: bool = False):
    if filename not in _ALLOWED:
        raise HTTPException(status_code=404, detail="Not found")
    p = ASSETS_DIR / filename
    if not p.exists():
        raise HTTPException(status_code=404, detail="Asset file missing")
    headers = {}
    if not inline:
        headers["Content-Disposition"] = f'attachment; filename="{filename}"'
    return FileResponse(str(p), media_type="image/png", filename=filename, headers=headers)


@router.get("/assets/playstore", response_class=HTMLResponse)
async def list_playstore_assets():
    """A tiny browsable index — useful to share with the team."""
    rows = "\n".join(
        f'''
        <li>
          <img src="/api/assets/playstore/{f}?inline=1" alt="{f}" />
          <div class="meta">
            <div class="name">{f}</div>
            <a class="dl" href="/api/assets/playstore/{f}" download>⬇ Download</a>
          </div>
        </li>'''
        for f in sorted(_ALLOWED)
    )
    return HTMLResponse(
        f"""<!doctype html><html><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>AiForge — Play Store Assets</title>
<style>
  body{{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;
       background:#020208;color:#fff;padding:24px;max-width:760px;margin:auto;}}
  h1{{color:#00F0FF;letter-spacing:-0.5px;margin:0 0 6px;}}
  p.note{{color:#A1A1AA;font-size:13px;line-height:18px;margin:0 0 22px;}}
  ul{{padding:0;list-style:none;display:flex;flex-direction:column;gap:14px;}}
  li{{padding:14px;background:#0A0A14;border:1px solid #ffffff14;
      border-radius:14px;display:flex;align-items:center;gap:16px;}}
  li img{{width:96px;height:96px;object-fit:contain;
         background:#06060c;border-radius:12px;border:1px solid #ffffff14;}}
  .meta{{flex:1;}}
  .name{{font-weight:800;color:#fff;margin-bottom:6px;word-break:break-all;}}
  .dl{{color:#00FF66;text-decoration:none;font-weight:800;font-size:13px;
       border:1px solid #00FF6644;padding:6px 10px;border-radius:999px;}}
  .dl:hover{{background:#00FF6611;}}
</style></head><body>
<h1>AiForge — Play Store Assets</h1>
<p class="note">Tap <b>⬇ Download</b> on any file. Use the <code>512×512</code> icon and the <code>1024×500</code> feature graphic in the Google Play Console.</p>
<ul>{rows}</ul>
</body></html>"""
    )
