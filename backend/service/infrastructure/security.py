import asyncio
import hashlib
import secrets

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError


class Passwords:
    def __init__(self, hasher: PasswordHasher) -> None:
        self._hasher = hasher
        self._dummy = hasher.hash(secrets.token_urlsafe(32))

    async def hash(self, password: str) -> str:
        return await asyncio.to_thread(self._hasher.hash, password)

    async def verify(self, password: str, encoded: str | None) -> bool:
        try:
            valid = await asyncio.to_thread(self._hasher.verify, encoded or self._dummy, password)
            return valid and encoded is not None
        except VerificationError:
            return False


def token_digest(token: str) -> bytes:
    return hashlib.sha256(token.encode()).digest()
