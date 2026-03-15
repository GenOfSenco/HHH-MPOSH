import os
from supabase import create_client,Client
from dotenv import load_dotenv

env_path=os.path.join(os.path.dirname(__file__),'.env')
load_dotenv(env_path)

SUPABASE_URL=os.getenv("SUPABASE_URL","")
SUPABASE_KEY=os.getenv("SUPABASE_KEY","")

supabase: Client=None
_init_error=None

try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase=create_client(SUPABASE_URL,SUPABASE_KEY)
except Exception as e:
    _init_error=str(e)


def get_supabase() -> Client:
    if supabase is None:
        raise RuntimeError(
            f"Supabase not initialized! "
            f"Check SUPABASE_URL and SUPABASE_KEY in backend/.env. "
            f"Init error: {_init_error}"
        )
    return supabase


def test_connection() -> bool:
    try:
        client=get_supabase()
        result=client.table("users").select("id").limit(1).execute()
        return True
    except Exception:
        return False
