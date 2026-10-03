from typing import Any, Protocol


class Command:
    """An operation with exactly one handler; queries use the same dispatch path."""


class Notification:
    """A fact delivered to zero or more handlers within the same execution budget."""


class MessageBus(Protocol):
    async def send(self, command: Command) -> Any:
        ...

    async def publish(self, event: Notification) -> None:
        ...
