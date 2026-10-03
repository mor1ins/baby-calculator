from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from service.contracts.operations import AppError


def sleep_times(sleep: dict[str, Any], now: datetime) -> None:
    start, end = sleep["start"], sleep["end"]
    if start > now or (end is not None and (end > now or end <= start)):
        raise AppError(422, "validation_error", "Проверьте время: конец позже начала, факты не в будущем")
    if sleep["ends_night"] and (sleep["kind"] != "night" or end is None):
        raise AppError(422, "validation_error", "Завершить ночь можно только у законченного ночного сна")
    for event in sleep["events"]:
        if sleep["kind"] != "night" or event["occurred_at"] < start or (end and event["occurred_at"] > end):
            raise AppError(409, "events_outside_sleep", "Новые границы исключают ночную отметку")


def sleep_cycle(sleep: dict[str, Any], others: list[dict[str, Any]], zone: str) -> None:
    day, start, end = sleep["day"], sleep["start"], sleep["end"]
    local_start = start.astimezone(ZoneInfo(zone)).date()
    if not day <= local_start <= day + timedelta(days=1):
        raise AppError(422, "validation_error", "Начало сна не относится к выбранному циклу")
    if sleep["ends_night"] and end.astimezone(ZoneInfo(zone)).date() <= day:
        raise AppError(422, "validation_error", "Утренний подъём должен начинать следующий день")
    for other in others:
        if other["id"] == sleep["id"]:
            continue
        _overlap(sleep, other)
        _date_order(sleep, other, zone)
        _cycle_pair(sleep, other, zone)


def _overlap(sleep: dict[str, Any], other: dict[str, Any]) -> None:
    if sleep["end"] is None and other["end"] is None:
        raise AppError(409, "open_sleep_exists", "Уже есть незавершённый сон")
    if (other["end"] is None or sleep["start"] < other["end"]) and (
            sleep["end"] is None or other["start"] < sleep["end"]):
        raise AppError(409, "sleep_overlap", "Интервалы сна пересекаются")


def _cycle_pair(sleep: dict[str, Any], other: dict[str, Any], zone: str) -> None:
    if other["ends_night"] and other["end"].astimezone(ZoneInfo(zone)).date() == sleep["day"]:
        if sleep["start"] < other["end"]:
            raise AppError(422, "validation_error", "Сон начинается раньше утренней границы")
    if other["day"] == sleep["day"]:
        _same_day(sleep, other)
    if other["day"] > sleep["day"] and (sleep["end"] is None or sleep["end"] > other["start"]):
        raise AppError(422, "validation_error", "Сон выходит за границу следующего цикла")


def _same_day(sleep: dict[str, Any], other: dict[str, Any]) -> None:
    invalid_end = (sleep["ends_night"] and other["start"] >= sleep["end"]) or (
        other["ends_night"] and sleep["start"] >= other["end"])
    both_end = sleep["ends_night"] and other["ends_night"]
    nap_after_night = (sleep["kind"] == "nap" and other["kind"] == "night" and sleep["start"] > other["start"]) or (
        other["kind"] == "nap" and sleep["kind"] == "night" and other["start"] > sleep["start"])
    if invalid_end or both_end or nap_after_night:
        raise AppError(422, "validation_error", "Нарушена последовательность сна внутри дня")


def _date_order(sleep: dict[str, Any], other: dict[str, Any], zone: str) -> None:
    if other["day"] < sleep["day"]:
        if other["end"] is None or other["end"] > sleep["start"]:
            raise AppError(422, "validation_error", "Дата цикла не соответствует порядку записей")
        if other["ends_night"] and other["end"].astimezone(ZoneInfo(zone)).date() > sleep["day"]:
            raise AppError(422, "validation_error", "Выбранный цикл предшествует утреннему подъёму")
    if sleep["ends_night"] and other["day"] > sleep["day"]:
        if sleep["end"].astimezone(ZoneInfo(zone)).date() > other["day"]:
            raise AppError(422, "validation_error", "Утренний подъём выходит за дату следующего цикла")
