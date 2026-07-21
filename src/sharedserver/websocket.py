from __future__ import annotations

import asyncio

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from .models import ClipboardUpdate


class ClipboardHub:
    def __init__(self) -> None:
        self.content = ""
        self.clients: set[WebSocket] = set()
        self.lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self.lock:
            self.clients.add(websocket)
            content = self.content
        await websocket.send_json({"type": "clipboard", "content": content})

    async def disconnect(self, websocket: WebSocket) -> None:
        async with self.lock:
            self.clients.discard(websocket)

    async def broadcast(self, content: str) -> None:
        async with self.lock:
            self.content = content
            clients = tuple(self.clients)
        failed: list[WebSocket] = []
        for client in clients:
            try:
                await client.send_json({"type": "clipboard", "content": content})
            except (RuntimeError, WebSocketDisconnect):
                failed.append(client)
        if failed:
            async with self.lock:
                self.clients.difference_update(failed)

    async def handle(self, websocket: WebSocket) -> None:
        await self.connect(websocket)
        try:
            while True:
                try:
                    message = ClipboardUpdate.model_validate(await websocket.receive_json())
                except (ValidationError, ValueError):
                    await websocket.send_json(
                        {"type": "error", "message": "invalid clipboard message"}
                    )
                    continue
                await self.broadcast(message.content)
        except WebSocketDisconnect:
            pass
        finally:
            await self.disconnect(websocket)
