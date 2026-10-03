from dependency_injector import containers, providers
from mediapyr import Mediator

from service.messaging.bus import MediatorMessageBus


class Container(containers.DeclarativeContainer):
    """Composition root. Register future handler factories here, never inside consumers."""

    mediator = providers.Factory(Mediator)
    message_bus = providers.Singleton(MediatorMessageBus, mediator_factory=mediator.provider, max_transfers=3)
