"""Iteration 9: MongoProxy + select_authorized_db() failover unit tests.

Simulates the Emergent Atlas production failure mode where the URI's default
database ('fierce-forge') returns OperationFailure code=13 ("not authorized on
fierce-forge to execute command"), but the same Mongo user IS authorized on
the DB_NAME env value. Verifies that core.select_authorized_db() probes each
candidate, catches the failure, and re-points core.db (a MongoProxy) at the
first authorized candidate — WITHOUT raising, so backend startup never bricks.

Also verifies MongoProxy identity is preserved across re-points, so any
module that did `from core import db` at import time still sees the new
database after re-point (same wrapper object; internal handle swapped).
"""
from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from pymongo.errors import OperationFailure

import core


def _fake_db(name: str, find_one_behavior):
    """Build a fake motor database with a .users.find_one AsyncMock.

    find_one_behavior is either an Exception instance (to raise) or a value
    (to return).
    """
    fake = SimpleNamespace()
    fake.name = name
    users_coll = SimpleNamespace()
    if isinstance(find_one_behavior, Exception):
        users_coll.find_one = AsyncMock(side_effect=find_one_behavior)
    else:
        users_coll.find_one = AsyncMock(return_value=find_one_behavior)
    fake.users = users_coll
    return fake


class _FakeClient:
    """Stand-in for AsyncIOMotorClient.

    __getitem__(name) returns a pre-registered fake db, or a new fake that
    raises OperationFailure so unknown names always fail closed.
    """

    def __init__(self, dbs, admin_command_result=None, admin_command_exc=None):
        self._dbs = dbs
        self.admin = SimpleNamespace()
        if admin_command_exc is not None:
            self.admin.command = AsyncMock(side_effect=admin_command_exc)
        else:
            self.admin.command = AsyncMock(return_value=admin_command_result or {})

    def __getitem__(self, name):
        if name in self._dbs:
            return self._dbs[name]
        # Unknown db → simulate "not authorized"
        return _fake_db(
            name,
            OperationFailure(f"not authorized on {name}", code=13),
        )


@pytest.fixture
def _restore_core(monkeypatch):
    """Snapshot & restore core module globals mutated by these tests."""
    saved_client = core.mongo_client
    saved_uri_default = core._uri_default_db
    saved_db_name = core.DB_NAME
    saved_proxy_internal = core.db._db
    yield
    core.mongo_client = saved_client
    core._uri_default_db = saved_uri_default
    core.DB_NAME = saved_db_name
    core.db.point_to(saved_proxy_internal)


# ---------------------------------------------------------------------------
# P0 — failover: 1st candidate raises OperationFailure, 2nd succeeds.
# ---------------------------------------------------------------------------
class TestSelectAuthorizedDbFailover:
    def test_first_candidate_unauthorized_second_wins(self, monkeypatch, _restore_core):
        # First candidate: URI default db = "fierce-forge" → 'not authorized' code 13
        first = _fake_db(
            "fierce-forge",
            OperationFailure("not authorized on fierce-forge to execute command { find: \"users\" }", code=13),
        )
        # Second candidate: DB_NAME env = "aiforge" → find_one returns None (authorized, no docs)
        second = _fake_db("aiforge", None)

        fake_client = _FakeClient({"fierce-forge": first, "aiforge": second})
        monkeypatch.setattr(core, "mongo_client", fake_client)
        monkeypatch.setattr(core, "_uri_default_db", first)
        monkeypatch.setattr(core, "DB_NAME", "aiforge")
        # Start proxy at the (wrong) default db
        core.db.point_to(first)

        # Act
        asyncio.get_event_loop().run_until_complete(core.select_authorized_db())

        # Assert: db re-pointed to the second candidate; did NOT raise.
        assert core.db.name == "aiforge"
        # find_one was actually attempted on both, in order.
        first.users.find_one.assert_awaited_once()
        second.users.find_one.assert_awaited_once()

    def test_all_candidates_fail_keeps_initial_and_does_not_raise(
        self, monkeypatch, _restore_core
    ):
        first = _fake_db(
            "fierce-forge",
            OperationFailure("not authorized on fierce-forge", code=13),
        )
        second = _fake_db(
            "aiforge",
            OperationFailure("not authorized on aiforge", code=13),
        )
        fake_client = _FakeClient({"fierce-forge": first, "aiforge": second})
        monkeypatch.setattr(core, "mongo_client", fake_client)
        monkeypatch.setattr(core, "_uri_default_db", first)
        monkeypatch.setattr(core, "DB_NAME", "aiforge")
        core.db.point_to(first)

        # Must NOT raise — startup would brick.
        asyncio.get_event_loop().run_until_complete(core.select_authorized_db())

        # Kept initial db (nothing else was authorized).
        assert core.db.name == "fierce-forge"

    def test_role_scoped_db_from_connection_status_is_probed(
        self, monkeypatch, _restore_core
    ):
        # URI default and DB_NAME both blow up; but the user has a
        # readWrite role on 'scoped_prod_db' → that must be tried and win.
        first = _fake_db(
            "fierce-forge",
            OperationFailure("not authorized on fierce-forge", code=13),
        )
        second = _fake_db(
            "aiforge",
            OperationFailure("not authorized on aiforge", code=13),
        )
        third = _fake_db("scoped_prod_db", None)

        conn_status = {
            "authInfo": {
                "authenticatedUserRoles": [
                    {"role": "readWrite", "db": "scoped_prod_db"},
                    # admin/local/config must be ignored.
                    {"role": "read", "db": "admin"},
                ]
            }
        }
        fake_client = _FakeClient(
            {"fierce-forge": first, "aiforge": second, "scoped_prod_db": third},
            admin_command_result=conn_status,
        )
        monkeypatch.setattr(core, "mongo_client", fake_client)
        monkeypatch.setattr(core, "_uri_default_db", first)
        monkeypatch.setattr(core, "DB_NAME", "aiforge")
        core.db.point_to(first)

        asyncio.get_event_loop().run_until_complete(core.select_authorized_db())

        assert core.db.name == "scoped_prod_db"
        third.users.find_one.assert_awaited_once()

    def test_connection_status_failure_is_swallowed(self, monkeypatch, _restore_core):
        # connectionStatus itself may fail on locked-down Atlas users.
        # select_authorized_db must still probe URI default + DB_NAME.
        first = _fake_db("fierce-forge", None)  # succeeds
        fake_client = _FakeClient(
            {"fierce-forge": first},
            admin_command_exc=OperationFailure("no auth", code=13),
        )
        monkeypatch.setattr(core, "mongo_client", fake_client)
        monkeypatch.setattr(core, "_uri_default_db", first)
        monkeypatch.setattr(core, "DB_NAME", "aiforge")
        core.db.point_to(first)

        asyncio.get_event_loop().run_until_complete(core.select_authorized_db())
        assert core.db.name == "fierce-forge"


# ---------------------------------------------------------------------------
# P0 — MongoProxy identity: `from core import db` importers see re-point.
# ---------------------------------------------------------------------------
class TestMongoProxyRepointing:
    def test_from_core_import_db_sees_repoint(self, _restore_core):
        # Simulate an importer that grabbed `db` at module import time.
        from core import db as imported_db

        original = imported_db._db

        new_target = _fake_db("some_other_db", None)
        # Re-point via the proxy: any module that already imported db must
        # now see the new target THROUGH the same proxy instance.
        core.db.point_to(new_target)

        assert imported_db is core.db  # same wrapper object
        assert imported_db.name == "some_other_db"
        assert imported_db._db is new_target

        # Attribute forwarding: .users must forward to the new target.
        assert imported_db.users is new_target.users
        # __getitem__ forwarding.
        new_target_collection = MagicMock(name="creations_collection")
        new_target.__dict__["creations"] = new_target_collection  # attribute path
        # __getitem__ delegates to the underlying db's __getitem__; simulate:
        new_target_class_like = MagicMock()
        new_target_class_like.__getitem__ = MagicMock(return_value="col-x")
        core.db.point_to(new_target_class_like)
        assert imported_db["anything"] == "col-x"
        new_target_class_like.__getitem__.assert_called_with("anything")

        # Restore
        core.db.point_to(original)
