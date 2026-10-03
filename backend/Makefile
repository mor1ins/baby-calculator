.PHONY: setup format lint test check
setup:
	uv sync --locked
format:
	uv run --locked isort service tests
lint:
	uv run --locked isort --check-only service tests
	uv run --locked flake8 service tests
	uv run --locked mypy service tests
	uv run --locked pylint service tests
	uv run --locked lint-imports
test:
	uv run --locked pytest
check: lint test
