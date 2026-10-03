from dataclasses import dataclass

from service.contracts.messages import Command


class CheckReadiness(Command):
    pass


class CheckDatabase(Command):
    pass


@dataclass
class RuntimeStatus:
    started: bool = False
