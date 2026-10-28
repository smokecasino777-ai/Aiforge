"""Approved reference catalog. Never mistakes proposed SKUs for live store products."""
VERSION = "credits_v1"
CREDIT_MICROS = 1000
PROMO_MONTHLY_CEILING = 25_000_000
PLANS = [
    {"id": "spark", "name": "Spark", "price_usd": 9.99, "credits": 2000},
    {"id": "creator", "name": "Creator", "price_usd": 19.99, "credits": 4500, "suggested": True},
    {"id": "pro", "name": "Pro", "price_usd": 49.99, "credits": 12000},
    {"id": "studio", "name": "Studio", "price_usd": 99.99, "credits": 25000},
    {"id": "max", "name": "Max", "price_usd": 199.99, "credits": 50000},
]
PACKS = [
    {"id": f"pack_{credits}", "name": f"{credits:,} credits", "price_usd": price, "credits": credits}
    for price, credits in [(2.99, 400), (9.99, 1500), (24.99, 4000), (49.99, 8500),
                          (99.99, 18000), (249.99, 47500), (499.99, 95000), (999.99, 190000)]
]
CATALOG = {x["id"]: {**x, "kind": kind, "catalog_version": VERSION}
           for kind, items in [("monthly", PLANS), ("purchased", PACKS)] for x in items}

# These are implemented routes, NOT confirmed connected-account price quotes.
# An owner must verify a bounded maximum charge before any route is enabled.
ACTIONS = {
    "chat": {"label": "AI chat", "model": "gemini-2.5-flash-lite", "provider": "gemini", "max_output_tokens": 1024},
    "caption": {"label": "AI caption", "model": "gemini-2.5-flash-lite", "provider": "gemini", "max_output_tokens": 512},
    "scad": {"label": "OpenSCAD source", "model": "gemini-2.5-flash-lite", "provider": "gemini", "max_output_tokens": 2048},
    "image": {"label": "AI image · 1024px", "model": "gemini-3.1-flash-image-preview", "provider": "gemini", "max_output_tokens": 8192},
    "model3d": {"label": "3D-style image · not a mesh", "model": "gemini-3.1-flash-image-preview", "provider": "gemini", "max_output_tokens": 8192},
    "image_edit": {"label": "AI image edit · 1024px", "model": "gemini-3.1-flash-image-preview", "provider": "gemini", "max_output_tokens": 8192},
    "avatar": {"label": "AI avatar · square image", "model": "gemini-3.1-flash-image-preview", "provider": "gemini", "max_output_tokens": 8192},
    "tts": {"label": "Basic voice · up to 4000 characters", "model": "tts-1", "provider": "openai", "max_output_tokens": 0},
    "stt": {"label": "Transcription · up to 60 seconds", "model": "whisper-1", "provider": "openai", "max_output_tokens": 0},
}
UNAVAILABLE = {
    "video": "Video generation awaits a supported, priced replacement. Local video editing is available.",
    "research": "Research is not enabled until connected-provider costs and access are verified.",
    "premium_voice": "Premium voices await verified access and pricing.",
}