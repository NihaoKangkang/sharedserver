from __future__ import annotations

import asyncio
import json

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .models import ClipboardUpdate


class ClipboardHub:
    def __init__(self, max_text_size: int = 2 * 1024 * 1024) -> None:
        self.content = ""
        self.max_text_size = max_text_size
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
                await self.send(websocket, {"type": "clipboard", "content": self.content})
            while True:
                raw = await websocket.receive()
                if raw["type"] == "websocket.disconnect":
                    break
                text = raw.get("text")
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
                    if message.content != self.content:
                        self.content = message.content
                        await asyncio.gather(*(
                            self.send(client, {"type": "clipboard", "content": self.content})
                            for client in tuple(self.clients) if client is not websocket
                        ))
                    # Acknowledge without sending the sender an old text snapshot.
                    await self.send(websocket, {"type": "ack", "id": message.id})
        except WebSocketDisconnect:
            pass
        finally:
            async with self.lock:
                self.clients.discard(websocket)
