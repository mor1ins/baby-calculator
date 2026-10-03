from contextvars import ContextVar
from dataclasses import dataclass
from typing import Any, Callable, Literal, Protocol, cast

from mediapyr import Event, IEventHandler, IRequestHandler, Mediator, Request

from service.contracts.messages import Command, Notification

Layer = Literal["api", "application", "domain", "infrastructure"]
ALLOWED: dict[Layer, frozenset[Layer]] = {
    "api": frozenset({"application"}),
    "application": frozenset({"domain", "infrastructure"}),
    "domain": frozenset(),
    "infrastructure": frozenset(),
}


class ArchitectureViolation(RuntimeError):
    """A command exceeds the allowed dependency graph or dispatch budget."""


class Handler(Protocol):
    async def handle(self, message: Any) -> Any:
        ...


@dataclass
class Execution:
    transfers: int = 0


@dataclass(frozen=True)
class Binding:
    factory: Callable[[], Handler]
    layer: Layer


class GuardedHandler:
    def __init__(self, bus: "MediatorMessageBus", binding: Binding) -> None:
        self._bus = bus
        self._binding = binding

    async def handle(self, message: Any) -> Any:
        return await self._bus.invoke(self._binding, message)


class MediatorMessageBus:
    """Container-local mediapyr adapter; every handler invocation counts as a transfer."""

    def __init__(self, mediator_factory: Callable[..., Mediator], max_transfers: int = 3) -> None:
        if max_transfers < 1:
            raise ValueError("max_transfers must be positive")
        self._max_transfers = max_transfers
        self._bindings: dict[type[Handler], Binding] = {}
        self._commands: set[type[Command]] = set()
        self._execution: ContextVar[Execution | None] = ContextVar("execution", default=None)
        self._layer: ContextVar[Layer] = ContextVar("layer", default="api")
        self._mediator = mediator_factory(provider=self._resolve)

    def _resolve(self, handler_type: type[Handler]) -> GuardedHandler:
        return GuardedHandler(self, self._bindings[handler_type])

    def register(
        self, message_type: type[Command] | type[Notification], handler_type: type[Handler],
        factory: Callable[[], Handler], layer: Layer,
    ) -> None:
        if layer not in ALLOWED:
            raise ValueError(f"Unknown layer: {layer}")
        if handler_type in self._bindings:
            raise ValueError("Handler is already registered")
        if issubclass(message_type, Command):
            if message_type in self._commands:
                raise ValueError("Command already has a handler")
            self._mediator.request_handler(cast(type[Request], message_type))(cast(type[IRequestHandler], handler_type))
            self._commands.add(message_type)
        elif issubclass(message_type, Notification):
            self._mediator.event_handler(cast(type[Event], message_type))(cast(type[IEventHandler], handler_type))
        else:
            raise TypeError("Unsupported message type")
        self._bindings[handler_type] = Binding(factory, layer)

    async def invoke(self, binding: Binding, message: Any) -> Any:
        source = self._layer.get()
        if binding.layer not in ALLOWED[source]:
            raise ArchitectureViolation(f"Forbidden transfer: {source} -> {binding.layer}")
        execution = self._execution.get()
        if execution is None:
            raise ArchitectureViolation("Handler invoked outside bus execution")
        execution.transfers += 1
        if execution.transfers > self._max_transfers:
            raise ArchitectureViolation(f"Transfer budget exceeded: {self._max_transfers}")
        token = self._layer.set(binding.layer)
        try:
            return await binding.factory().handle(message)
        finally:
            self._layer.reset(token)

    async def _dispatch(self, message: Command | Notification) -> Any:
        token = None
        if self._execution.get() is None:
            token = self._execution.set(Execution())
        try:
            if isinstance(message, Command):
                return await self._mediator.send(cast(Request, message))
            return await self._mediator.publish(cast(Event, message))
        finally:
            if token is not None:
                self._execution.reset(token)

    async def send(self, command: Command) -> Any:
        return await self._dispatch(command)

    async def publish(self, event: Notification) -> None:
        await self._dispatch(event)
