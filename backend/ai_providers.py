"""Only the model in the customer's accepted quote may incur AI spend."""
import base64
import io
import uuid
from typing import Optional, Tuple
from PIL import Image
from dotenv import load_dotenv
from fastapi import HTTPException
from core import EMERGENT_LLM_KEY
from metering import provider_start

load_dotenv()


async def generate_text(system: str, prompt: str) -> str:
    quote = await provider_start()
    from emergentintegrations.llm.chat import LlmChat, UserMessage, TextDelta
    model = quote["model"]
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"quote-{quote['quote_id']}",
                   system_message=system[:4000]).with_model(model["provider"], model["model"]).with_params(max_tokens=model["max_output_tokens"], num_retries=0)
    parts = []
    async for event in chat.stream_message(UserMessage(text=prompt[:12000])):
        if isinstance(event, TextDelta):
            parts.append(event.content)
    return "".join(parts)


def bounded_image(encoded: str) -> str:
    try:
        raw = base64.b64decode(encoded.split(",")[-1], validate=True)
        if len(raw) > 6 * 1024 * 1024:
            raise ValueError()
        image = Image.open(io.BytesIO(raw))
        if image.width * image.height > 25_000_000:
            raise ValueError()
        image.thumbnail((1024, 1024))
        buffer = io.BytesIO()
        image.convert("RGB").save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode()
    except Exception:
        raise HTTPException(400, "Use an image under 6 MB and 25 megapixels")


async def _image(prompt: str, image_b64=None, system=None) -> Tuple[str, str]:
    from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent
    image = bounded_image(image_b64) if image_b64 else None
    quote = await provider_start()
    model = quote["model"]
    chat = LlmChat(api_key=EMERGENT_LLM_KEY, session_id=f"image-{uuid.uuid4().hex}",
        system_message=system or "Generate one high-quality image, maximum 1024 pixels per side.")
    chat = chat.with_model(model["provider"], model["model"]).with_params(
        modalities=["image", "text"], max_tokens=model["max_output_tokens"], num_retries=0)
    message = UserMessage(text=prompt[:12000], file_contents=[ImageContent(image)] if image else [])
    _, images = await chat.send_message_multimodal_response(message)
    if not images:
        raise RuntimeError("The provider returned no image. No automatic retry was made.")
    return images[0]["data"], images[0].get("mime_type", "image/png")


async def generate_image(prompt: str) -> Tuple[str, str]:
    return await _image(prompt)


async def edit_image(image_b64: str, instruction: str, system: Optional[str] = None) -> Tuple[str, str]:
    return await _image(instruction, image_b64, system)


async def generate_video(prompt: str, duration: int, size: str) -> Tuple[bytes, str]:
    raise HTTPException(503, "Video generation awaits a verified supported replacement. Video editing remains available.")