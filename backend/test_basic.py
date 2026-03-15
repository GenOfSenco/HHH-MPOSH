"""Простые unit-тесты, запускаются при старте приложения."""
from auth import hash_password, verify_password


def test_hash_password_returns_string():
    h = hash_password("test123")
    assert isinstance(h, str)
    assert len(h) > 0


def test_verify_password_correct():
    h = hash_password("secret")
    assert verify_password("secret", h) is True


def test_verify_password_wrong():
    h = hash_password("secret")
    assert verify_password("wrong", h) is False
