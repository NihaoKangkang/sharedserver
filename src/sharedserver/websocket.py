from __future__ import annotations

import asyncio
import json
from typing import Awaitable, Callable

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .models import ClipboardUpdate


class ClipboardHub:
    def __init__(self, max_text_size: int = 2 * 1024 * 1024, *, can_read: bool = True, can_write: bool = True,
                 on_text: Callable[[str], Awaitable[None]] | None = None) -> None:
        self.content = ""
        self.max_text_size = max_text_size
        self.can_read = can_read
        self.can_write = can_write
        self.on_text = on_text
        self.image_path: str | None = None
        self.clients: set[WebSocket] = set()
        # Serialize initial snapshots and broadcasts so a stale snapshot cannot
        # arrive after an update. Bound slow clients so they cannot stall everyone.
        self.lock = asyncio.Lock()

    async def send(self, client: WebSocket, message: dict) -> None:
        try:
            await asyncio.wait_for(client.send_json(message), timeout=2)
        except (RuntimeError, WebSocketDisconnect, OSError, asyncio.TimeoutError):
            self.clients.discard(client)

    async def handle(self, websocket: WebSocket) -> None:
        await websocket.accept()
        try:
            async with self.lock:
                self.clients.add(websocket)
                await self.send(websocket, {"type": "clipboard", "content": self.content if self.can_read else ""})
                if self.can_read and self.image_path is not None:
                    await self.send(websocket, {"type": "image", "path": self.image_path})
            while True:
                raw = await websocket.receive()
                if raw["type"] == "websocket.disconnect":
                    break
                text = raw.get("text")
                if not self.can_write:
                    await self.send(websocket, {"type": "error", "message": "shared text is read-only"})
                    continue
                if text is None or len(text.encode("utf-8")) > self.max_text_size * 6 + 1024:
                    await self.send(websocket, {"type": "error", "message": "clipboard accepts text messages only within the size limit"})
                    continue
                try:
                    message = ClipboardUpdate.model_validate(json.loads(text))
                    if len(message.content.encode("utf-8")) > self.max_text_size:
                        raise ValueError("too large")
                except (ValidationError, ValueError, UnicodeError):
                    await self.send(websocket, {"type": "error", "message": f"clipboard accepts text up to {self.max_text_size} UTF-8 bytes"})
                    continue
                async with self.lock:
                    try:
                        await self._update_text(message.content, sender=websocket)
                    except (ValueError, OSError):
                        await self.send(websocket, {"type": "error", "message": "could not save text submission"})
                        continue
                    # Acknowledge without sending the sender an old text snapshot.
                    await self.send(websocket, {"type": "ack", "id": message.id})
        except WebSocketDisconnect:
            pass
        finally:
            async with self.lock:
                self.clients.discard(websocket)

    async def _update_text(self, content: str, sender: WebSocket | None = None) -> None:
        if self.on_text is not None:
            await self.on_text(content)
        if content == self.content:
            return
        self.content = content
        if self.can_read:
            await asyncio.gather(*(self.send(client, {"type": "clipboard", "content": content})
                                   for client in tuple(self.clients) if client is not sender))

    async def update_text(self, content: str) -> None:
        async with self.lock:
            await self._update_text(content)

    async def update_image(self, path: str) -> None:
        async with self.lock:
            self.image_path = path
            if self.can_read:
                await asyncio.gather(*(self.send(client, {"type": "image", "path": path})
                                       for client in tuple(self.clients)))
