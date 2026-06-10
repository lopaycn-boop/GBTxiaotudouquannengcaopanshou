"""Tests for deployment hardening: DB SSL downgrade guard and vault fail-closed."""
import sys

import pytest

sys.path.insert(0, ".")

from potato.bootstrap_config import build_crdb_dsn
from potato.vault import _get_vault_key


class TestCrdbSslDowngradeGuard:
    def test_verify_full_missing_cert_raises_by_default(self, monkeypatch):
        monkeypatch.delenv("POTATO_DB_SSL_ALLOW_DOWNGRADE", raising=False)
        url = "postgresql://u:p@host:26257/db?sslmode=verify-full"
        with pytest.raises(RuntimeError, match="verify-full"):
            build_crdb_dsn(url, "/nonexistent/root.crt")

    def test_verify_full_downgrade_opt_in(self, monkeypatch):
        monkeypatch.setenv("POTATO_DB_SSL_ALLOW_DOWNGRADE", "true")
        url = "postgresql://u:p@host:26257/db?sslmode=verify-full"
        dsn = build_crdb_dsn(url, "/nonexistent/root.crt")
        assert "sslmode=require" in dsn
        assert "verify-full" not in dsn

    def test_no_sslmode_defaults_to_require(self, monkeypatch):
        monkeypatch.delenv("POTATO_DB_SSL_ALLOW_DOWNGRADE", raising=False)
        dsn = build_crdb_dsn("postgresql://u:p@host:26257/db", "/nonexistent/root.crt")
        assert "sslmode=require" in dsn


class TestVaultFailClosed:
    def test_server_env_without_key_raises(self, monkeypatch):
        monkeypatch.delenv("VAULT_ENCRYPTION_KEY", raising=False)
        monkeypatch.setenv("POTATO_ENV", "production")
        with pytest.raises(RuntimeError, match="VAULT_ENCRYPTION_KEY"):
            _get_vault_key()

    def test_explicit_key_works_in_server_env(self, monkeypatch):
        monkeypatch.setenv("POTATO_ENV", "production")
        monkeypatch.setenv("VAULT_ENCRYPTION_KEY", "stable-key")
        monkeypatch.setenv("VAULT_SALT", "stable-salt")
        key = _get_vault_key()
        assert isinstance(key, bytes) and len(key) == 32

    def test_local_desktop_fingerprint_fallback(self, monkeypatch):
        monkeypatch.delenv("VAULT_ENCRYPTION_KEY", raising=False)
        monkeypatch.delenv("POTATO_ENV", raising=False)
        monkeypatch.setenv("POTATO_ALLOW_FINGERPRINT_VAULT", "true")
        key = _get_vault_key()
        assert isinstance(key, bytes) and len(key) == 32
