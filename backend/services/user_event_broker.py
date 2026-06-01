import asyncio
import json
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
from typing import Any


class UserEventBroker:
    def __init__(self) -> None:
        self._subscribers: dict[str, set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]]] = defaultdict(set)

    def subscribe(self, user_code: str) -> tuple[asyncio.Queue, asyncio.AbstractEventLoop]:
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue()
        self._subscribers[user_code].add((loop, queue))
        return queue, loop

    def unsubscribe(self, user_code: str, loop: asyncio.AbstractEventLoop, queue: asyncio.Queue) -> None:
        subscribers = self._subscribers.get(user_code)
        if not subscribers:
            return
        subscribers.discard((loop, queue))
        if not subscribers:
            self._subscribers.pop(user_code, None)

    def publish(self, user_code: str, event: dict[str, Any]) -> None:
        message = json.loads(json.dumps(event, default=_json_default))
        for loop, queue in list(self._subscribers.get(user_code, set())):
            loop.call_soon_threadsafe(queue.put_nowait, message)


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    return str(value)


user_event_broker = UserEventBroker()
