"""Tests for potato.cloud — AI自主云电脑+邮箱"""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from potato.cloud import (
    CloudMachine,
    CloudStore,
    EmailRecord,
    EmailMessage,
    ProviderInfo,
    PROVIDERS,
    DEPLOY_FUNCS,
    _load_store,
    _save_store,
    _machine_from_dict,
    get_or_create_email,
    set_email_user,
    check_inbox,
    read_email,
    extract_verification_code,
    cloud_up,
    cloud_list,
    cloud_current,
    cloud_connect,
    cloud_down,
    cloud_update,
    cloud_remove,
    cloud_refresh,
    cloud_providers,
    cloud_dashboard,
)


# ═══════════════════════════════════════════════════════
# 数据模型
# ═══════════════════════════════════════════════════════

class TestModels:
    def test_cloud_machine_defaults(self):
        m = CloudMachine(id="test", provider="gcs", status="running")
        assert m.brand == "GBTxiaotudou"
        assert m.port == 22
        assert m.protocol == "ssh"
        assert m.deploy_log == []

    def test_email_record(self):
        r = EmailRecord(address="test@grr.la", sid_token="abc123")
        assert r.provider == "guerrillamail"
        assert r.seq == 0

    def test_provider_info(self):
        assert len(PROVIDERS) == 4
        for name, p in PROVIDERS.items():
            assert not p.needs_credit_card, f"{name} needs credit card"
            assert p.label
            assert p.web_url.startswith("https://")


# ═══════════════════════════════════════════════════════
# 持久化
# ═══════════════════════════════════════════════════════

class TestPersistence:
    def test_load_empty(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = _load_store()
        assert store.machines == []
        assert store.email is None

    def test_save_and_load(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(
            machines=[{"id": "m1", "provider": "gcs", "status": "running"}],
            active_id="m1",
            email={"address": "test@grr.la", "sid_token": "abc", "seq": 0, "created_at": "", "provider": "guerrillamail"},
        )
        _save_store(store)
        loaded = _load_store()
        assert len(loaded.machines) == 1
        assert loaded.active_id == "m1"
        assert loaded.email["address"] == "test@grr.la"

    def test_load_old_format_email_string(self, tmp_path, monkeypatch):
        """旧版email字段是字符串，不应崩溃"""
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        p = tmp_path / "cloud.json"
        p.write_text(json.dumps({"machines": [], "email": "old@grr.la", "active_id": None}))
        store = _load_store()
        assert store.email is None  # 旧格式忽略，重新创建

    def test_machine_from_dict_camel_case(self):
        """旧版字段名兼容"""
        old = {
            "id": "gcs-1",
            "provider": "google-cloud-shell",
            "status": "deploying",
            "webUrl": "https://shell.google.cloud",
            "os": "Debian Linux",
            "createdAt": "2025-01-01",
            "lastConnected": "2025-01-01",
        }
        m = _machine_from_dict(old)
        assert m.web_url == "https://shell.google.cloud"
        assert m.os_name == "Debian Linux"
        assert m.created_at == "2025-01-01"


# ═══════════════════════════════════════════════════════
# 验证码提取
# ═══════════════════════════════════════════════════════

class TestVerificationCode:
    def test_6_digit_code(self):
        assert extract_verification_code("您的验证码是 123456") == "123456"

    def test_4_digit_code(self):
        assert extract_verification_code("验证码: 8901") == "8901"

    def test_english_verification(self):
        assert extract_verification_code("Your verification code is 567890") == "567890"

    def test_pin_pattern(self):
        assert extract_verification_code("PIN: 998877") == "998877"

    def test_no_code(self):
        assert extract_verification_code("Hello world, no code here") is None

    def test_alphanumeric_code(self):
        result = extract_verification_code("Your code is AB12CD")
        assert result is not None
        assert len(result) == 6


# ═══════════════════════════════════════════════════════
# 邮箱(Mock Guerrilla Mail API)
# ═══════════════════════════════════════════════════════

class TestEmail:
    @pytest.mark.asyncio
    async def test_get_or_create_email_new(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"email_addr": "test123@grr.la", "sid_token": "tok_abc"}
        mock_resp.raise_for_status = MagicMock()

        with patch("potato.cloud.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            MockClient.return_value = mock_client

            rec = await get_or_create_email()
            assert rec.address == "test123@grr.la"
            assert rec.sid_token == "tok_abc"

    @pytest.mark.asyncio
    async def test_check_inbox_empty(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        # 先保存邮箱记录
        store = CloudStore(email={"address": "test@grr.la", "sid_token": "tok", "seq": 0, "created_at": "", "provider": "guerrillamail"})
        _save_store(store)

        mock_resp = MagicMock()
        mock_resp.json.return_value = {"list": []}
        mock_resp.raise_for_status = MagicMock()

        with patch("potato.cloud.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            MockClient.return_value = mock_client

            msgs = await check_inbox()
            assert msgs == []


# ═══════════════════════════════════════════════════════
# 云电脑操作(Mock)
# ═══════════════════════════════════════════════════════

class TestCloudOperations:
    @pytest.mark.asyncio
    async def test_cloud_up_creates_machine(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")

        # Mock邮箱
        mock_resp = MagicMock()
        mock_resp.json.return_value = {"email_addr": "ai@grr.la", "sid_token": "tok"}
        mock_resp.raise_for_status = MagicMock()

        with patch("potato.cloud.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            MockClient.return_value = mock_client

            machine = await cloud_up("google-cloud-shell")
            assert machine.provider == "google-cloud-shell"
            assert machine.status == "deploying"
            assert machine.brand == "GBTxiaotudou"
            assert machine.email == "ai@grr.la"

    @pytest.mark.asyncio
    async def test_cloud_list(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(machines=[{"id": "m1", "provider": "gcs", "status": "running", "brand": "GBTxiaotudou", "email": "", "ip": "", "port": 22, "protocol": "ssh", "username": "", "password": "", "web_url": "", "os_name": "", "specs": "", "created_at": "", "last_connected": "", "notes": "", "deploy_log": []}])
        _save_store(store)
        machines = await cloud_list()
        assert len(machines) == 1

    @pytest.mark.asyncio
    async def test_cloud_connect(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(
            machines=[{"id": "m1", "provider": "google-cloud-shell", "status": "running", "brand": "GBTxiaotudou", "email": "", "ip": "shell.google.cloud", "port": 443, "protocol": "web", "username": "ai", "password": "", "web_url": "https://shell.cloud.google.com", "os_name": "Debian", "specs": "e2-micro", "created_at": "", "last_connected": "", "notes": "", "deploy_log": []}],
            active_id="m1",
        )
        _save_store(store)
        result = await cloud_connect("m1")
        assert result is not None
        assert "cmd" in result
        assert "shell.cloud.google.com" in result["cmd"]

    @pytest.mark.asyncio
    async def test_cloud_down(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(machines=[{"id": "m1", "provider": "gcs", "status": "running", "brand": "GBTxiaotudou", "email": "", "ip": "", "port": 22, "protocol": "ssh", "username": "", "password": "", "web_url": "", "os_name": "", "specs": "", "created_at": "", "last_connected": "", "notes": "", "deploy_log": []}], active_id="m1")
        _save_store(store)
        await cloud_down("m1")
        store2 = _load_store()
        assert store2.machines[0]["status"] == "stopped"

    @pytest.mark.asyncio
    async def test_cloud_update(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(machines=[{"id": "m1", "provider": "gcs", "status": "deploying", "brand": "GBTxiaotudou", "email": "", "ip": "", "port": 22, "protocol": "ssh", "username": "", "password": "", "web_url": "", "os_name": "", "specs": "", "created_at": "", "last_connected": "", "notes": "", "deploy_log": []}], active_id="m1")
        _save_store(store)
        m = await cloud_update("m1", {"ip": "1.2.3.4", "status": "running"})
        assert m.ip == "1.2.3.4"
        assert m.status == "running"

    @pytest.mark.asyncio
    async def test_cloud_remove(self, tmp_path, monkeypatch):
        monkeypatch.setattr("potato.cloud.CLOUD_STORE", tmp_path / "cloud.json")
        store = CloudStore(machines=[{"id": "m1", "provider": "gcs", "status": "running", "brand": "GBTxiaotudou", "email": "", "ip": "", "port": 22, "protocol": "ssh", "username": "", "password": "", "web_url": "", "os_name": "", "specs": "", "created_at": "", "last_connected": "", "notes": "", "deploy_log": []}], active_id="m1")
        _save_store(store)
        ok = await cloud_remove("m1")
        assert ok
        store2 = _load_store()
        assert len(store2.machines) == 0
        assert store2.active_id is None

    def test_cloud_providers(self):
        providers = cloud_providers()
        assert len(providers) == 4
        assert all(not p["needs_credit_card"] for p in providers)


# ═══════════════════════════════════════════════════════
# 部署函数(不依赖网络)
# ═══════════════════════════════════════════════════════

class TestDeployFunctions:
    @pytest.mark.asyncio
    async def test_deploy_google_cloud_shell(self):
        m = await DEPLOY_FUNCS["google-cloud-shell"]("test@grr.la")
        assert m.provider == "google-cloud-shell"
        assert m.web_url == "https://shell.cloud.google.com"
        assert len(m.deploy_log) > 0

    @pytest.mark.asyncio
    async def test_deploy_clawcloud(self):
        m = await DEPLOY_FUNCS["clawcloud"]("test@grr.la")
        assert m.provider == "clawcloud"
        assert m.password == "gbtxiaotudou"

    @pytest.mark.asyncio
    async def test_deploy_huggingface(self):
        # HuggingFace有网络请求，mock掉
        with patch("potato.cloud.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_client.post.return_value = mock_resp
            mock_client.__aenter__ = AsyncMock(return_value=mock_client)
            mock_client.__aexit__ = AsyncMock(return_value=None)
            MockClient.return_value = mock_client

            m = await DEPLOY_FUNCS["huggingface-space"]("test@grr.la")
            assert m.provider == "huggingface-space"

    @pytest.mark.asyncio
    async def test_deploy_github_codespaces(self):
        m = await DEPLOY_FUNCS["github-codespaces"]("test@grr.la")
        assert m.provider == "github-codespaces"
        assert m.port == 6080


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
