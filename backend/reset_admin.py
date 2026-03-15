import sys
sys.path.insert(0,'.')

from database import get_supabase
from auth import hash_password


def reset_admin_password(new_password: str="admin"):
    try:
        supabase=get_supabase()
        new_hash=hash_password(new_password)
        result=supabase.table("users").update({
            "password":new_hash
        }).eq("username","admin").execute()
        if result.data:
            return True
        else:
            return False
    except Exception:
        return False


def create_admin_if_not_exists(password: str="admin"):
    try:
        supabase=get_supabase()
        check=supabase.table("users").select("id").eq("username","admin").execute()
        if check.data:
            return reset_admin_password(password)
        new_hash=hash_password(password)
        result=supabase.table("users").insert({
            "username":"admin",
            "password":new_hash,
            "first_name":"Admin",
            "last_name":"System",
            "role":"admin"
        }).execute()
        if result.data:
            return True
        else:
            return False
    except Exception:
        return False


if __name__=="__main__":
    new_pass=sys.argv[1] if len(sys.argv)>1 else "admin"
    create_admin_if_not_exists(new_pass)
