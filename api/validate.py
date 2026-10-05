"""Validate OpenAPI, response/request fixtures and essential schema restrictions."""

import copy
import json
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import validate

ROOT = Path(__file__).resolve().parent
spec = yaml.safe_load((ROOT / "openapi.yaml").read_text(encoding="utf-8"))
validate(spec)


def validator(name):
    schema = {
        "$ref": f"#/components/schemas/{name}",
        "components": spec["components"],
    }
    return Draft202012Validator(schema, format_checker=FormatChecker())


examples = {
    "day": "Day",
    "empty-day": "Day",
    "session": "Session",
    "open-night": "Sleep",
    "error": "Error",
    "sleep-create": "SleepWrite",
    "event-put": "SleepEventPut",
}
fixtures = {}
for filename, schema_name in examples.items():
    fixtures[filename] = json.loads((ROOT / "examples" / f"{filename}.json").read_text(encoding="utf-8"))
    validator(schema_name).validate(fixtures[filename])

# These guard the contract itself, not the unimplemented server's behavior.
invalid_cases = [
    ("Register", {"name": "Анна", "email": "anna@example.com", "password": "example-password", "timezone": "Europe/Moscow", "roles": ["admin"]}),
    ("ProfilePatch", {"blocked": True}),
    ("UserStatusPatch", {"blocked": True}),
    ("SleepWrite", {**fixtures["sleep-create"], "kind": "awake"}),
    ("SleepWrite", {**fixtures["sleep-create"], "start": "2026-10-03T20:10:00"}),
    ("SleepWrite", {**fixtures["sleep-create"], "ends_night": "yes"}),
    ("SleepPatch", {}),
    ("CommentPut", {"target_id": "interval-1", "text": ""}),
    ("ScheduleSegment", {"kind": "nap", "duration_minutes": 0}),
]
forecast_with_comment = copy.deepcopy(fixtures["day"]["timeline"][-1])
forecast_with_comment["comment"] = fixtures["day"]["timeline"][1]["comment"]
invalid_cases.append(("TimelineInterval", forecast_with_comment))
for schema_name, value in invalid_cases:
    if not list(validator(schema_name).iter_errors(value)):
        raise AssertionError(f"Invalid fixture unexpectedly accepted: {schema_name}")

operation_ids = []
for path, methods in spec["paths"].items():
    for method, operation in methods.items():
        operation_ids.append(operation["operationId"])
        if method != "get":
            assert operation["security"] == [{"sessionCookie": [], "csrfToken": []}], path
        if path.startswith("/admin/") and method != "get":
            assert path.endswith("/status") and method == "patch", path
assert len(operation_ids) == len(set(operation_ids))
print(f"Valid OpenAPI: {len(operation_ids)} operations, {len(examples)} examples, {len(invalid_cases)} negative checks.")
