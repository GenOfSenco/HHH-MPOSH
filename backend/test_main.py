import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch,MagicMock
from auth import hash_password

ADMIN_HASHED_PASSWORD=hash_password("admin")

MOCK_ADMIN={
    "id":"test-uuid-123",
    "username":"admin",
    "password":ADMIN_HASHED_PASSWORD,
    "first_name":"Admin",
    "last_name":"System",
    "role":"admin"
}

MOCK_USER={
    "id":"test-uuid-456",
    "username":"testuser",
    "password":hash_password("userpass"),
    "first_name":"Test",
    "last_name":"User",
    "role":"user"
}


def make_mock_supabase():
    mock_db={
        "admin":MOCK_ADMIN,
        "testuser":MOCK_USER,
    }
    def table(name):
        t=MagicMock()
        def select(*args):
            s=MagicMock()
            def eq(field,value):
                e=MagicMock()
                def execute():
                    r=MagicMock()
                    if field=="username":
                        r.data=[mock_db[value]] if value in mock_db else []
                    elif field=="id":
                        r.data=[u for u in mock_db.values() if u["id"]==value]
                    else:
                        r.data=[]
                    return r
                e.execute=execute
                return e
            s.eq=eq
            def execute_all():
                r=MagicMock()
                r.data=list(mock_db.values())
                return r
            s.execute=execute_all
            return s
        def insert(data):
            i=MagicMock()
            def execute():
                r=MagicMock()
                new={**data,"id":"new-uuid-789"}
                mock_db[data["username"]]=new
                r.data=[new]
                return r
            i.execute=execute
            return i
        t.select=select
        t.insert=insert
        return t
    supabase=MagicMock()
    supabase.table=table
    return supabase


@pytest.fixture
def client():
    mock_supa=make_mock_supabase()
    with patch("database.supabase",mock_supa),\
         patch("main.get_supabase",return_value=mock_supa):
        from main import app
        with TestClient(app,raise_server_exceptions=True) as c:
            yield c


class TestAuth:
    def test_login_success_admin(self,client):
        resp=client.post("/api/login",json={"username":"admin","password":"admin"})
        assert resp.status_code==200
        data=resp.json()
        assert "access_token" in data
        assert data["token_type"]=="bearer"
        assert data["user"]["role"]=="admin"
        assert data["user"]["username"]=="admin"

    def test_login_wrong_password(self,client):
        resp=client.post("/api/login",json={"username":"admin","password":"wrongpass"})
        assert resp.status_code==401

    def test_login_nonexistent_user(self,client):
        resp=client.post("/api/login",json={"username":"nobody","password":"pass"})
        assert resp.status_code==401


class TestProtectedEndpoints:
    def _admin_token(self,client) -> str:
        resp=client.post("/api/login",json={"username":"admin","password":"admin"})
        return resp.json()["access_token"]

    def test_create_user_without_token_forbidden(self,client):
        resp=client.post("/api/users",json={
            "username":"newone",
            "password":"pass1234",
            "first_name":"New",
            "last_name":"One",
            "role":"user",
        })
        assert resp.status_code in (401,403)

    def test_create_user_as_admin_success(self,client):
        token=self._admin_token(client)
        resp=client.post(
            "/api/users",
            headers={"Authorization":f"Bearer {token}"},
            json={
                "username":"newone",
                "password":"pass1234",
                "first_name":"New",
                "last_name":"One",
                "role":"user",
            }
        )
        assert resp.status_code==200
        data=resp.json()
        assert data["username"]=="newone"
        assert data["role"]=="user"

    def test_analytics_requires_auth(self,client):
        resp=client.get("/api/analytics/training")
        assert resp.status_code in (401,403)

    def test_analytics_with_auth_returns_data(self,client):
        token=self._admin_token(client)
        resp=client.get(
            "/api/analytics/training",
            headers={"Authorization":f"Bearer {token}"}
        )
        assert resp.status_code==200
        data=resp.json()
        assert "accuracy" in data
        assert "val_accuracy" in data
        assert isinstance(data["accuracy"],list)


class TestHealth:
    def test_health(self,client):
        resp=client.get("/api/health")
        assert resp.status_code==200
        assert resp.json()["status"]=="healthy"

    def test_root(self,client):
        resp=client.get("/")
        assert resp.status_code==200
        assert "Alien" in resp.json()["message"]


if __name__=="__main__":
    pytest.main([__file__,"-v"])
