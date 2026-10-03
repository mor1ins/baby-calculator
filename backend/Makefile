.PHONY: setup run format lint test test-integration migrate check
setup:
	uv sync --locked
run:
	uv run --locked uvicorn service.bootstrap:create_app --factory --host 127.0.0.1 --port 8000
format:
	uv run --locked isort service tests migrations ../deploy/create_admin.py
lint:
	uv run --locked isort --check-only service tests migrations ../deploy/create_admin.py
	uv run --locked flake8 service tests migrations ../deploy/create_admin.py
	uv run --locked mypy service tests migrations ../deploy/create_admin.py
	uv run --locked pylint service tests migrations ../deploy/create_admin.py
	uv run --locked lint-imports
test:
	uv run --locked pytest -m "not integration"
check: lint test
test-integration:
	@test -n "$$BABY_TEST_DATABASE_URL" || (echo "Set BABY_TEST_DATABASE_URL to a PostgreSQL account with CREATEDB"; exit 1)
	uv run --locked pytest -m integration
migrate:
	uv run --locked alembic upgrade head
