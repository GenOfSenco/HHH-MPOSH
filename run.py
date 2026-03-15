import os
import sys
import time
import signal
import subprocess
import threading
import webbrowser
import platform
from pathlib import Path

ROOT=Path(__file__).parent.resolve()
BACKEND_DIR=ROOT/"backend"
FRONTEND_DIR=ROOT/"frontend"

IS_WINDOWS=platform.system()=="Windows"

GREEN="\033[92m"
YELLOW="\033[93m"
RED="\033[91m"
BLUE="\033[94m"
RESET="\033[0m"
BOLD="\033[1m"

processes: list[subprocess.Popen]=[]


def log(color: str, prefix: str, msg: str):
    try:
        print(f"{color}[{prefix}]{RESET} {msg}")
    except Exception:
        print(f"[{prefix}] {msg}")


def find_python() -> str:
    for candidate in ["python","python3",sys.executable]:
        try:
            result=subprocess.run(
                [candidate,"--version"],
                capture_output=True,text=True
            )
            if result.returncode==0:
                return candidate
        except FileNotFoundError:
            continue
    return sys.executable


def find_npm() -> str:
    npm_cmd="npm.cmd" if IS_WINDOWS else "npm"
    try:
        subprocess.run([npm_cmd,"--version"],capture_output=True,check=True)
        return npm_cmd
    except (FileNotFoundError,subprocess.CalledProcessError):
        return "npm"


PYTHON=find_python()
NPM=find_npm()


def install_backend_deps():
    req_file = BACKEND_DIR / "requirements.txt"
    if not req_file.exists():
        return
    result = subprocess.run(
        [PYTHON, "-c", "import fastapi, supabase, jose, passlib, librosa"],
        capture_output=True
    )
    if result.returncode == 0:
        log(GREEN, "DEPS", "Backend-зависимости уже установлены")
        return
    log(YELLOW, "DEPS", "Установка backend-зависимостей (pip install -r requirements.txt)...")
    try:
        subprocess.run(
            [PYTHON, "-m", "pip", "install", "-r", str(req_file), "-q"],
            check=True
        )
        log(GREEN, "DEPS", "Backend-зависимости установлены")
    except subprocess.CalledProcessError:
        log(RED, "DEPS", "Ошибка установки backend-зависимостей")


def install_frontend_deps():
    node_modules = FRONTEND_DIR / "node_modules"
    if node_modules.exists():
        log(GREEN, "DEPS", "Frontend node_modules уже есть")
        return
    log(YELLOW, "DEPS", "Установка frontend-зависимостей (npm install)...")
    try:
        subprocess.run(
            [NPM, "install"],
            cwd=str(FRONTEND_DIR),
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        log(GREEN, "DEPS", "Frontend-зависимости установлены")
    except subprocess.CalledProcessError:
        log(RED, "DEPS", "Ошибка установки frontend-зависимостей")


def stream_output(proc: subprocess.Popen, prefix: str, color: str):
    try:
        for line in iter(proc.stdout.readline, b''):
            text = line.decode('utf-8', errors='replace').rstrip()
            if text:
                log(color, prefix, text)
    except Exception:
        pass


def start_backend() -> subprocess.Popen:
    log(BLUE, "RUN", "Запуск backend (uvicorn), порт 8000...")
    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTHONPATH"] = str(BACKEND_DIR)
    proc = subprocess.Popen(
        [
            PYTHON,"-m","uvicorn",
            "main:app",
            "--host","0.0.0.0",
            "--port","8000",
            "--reload",
        ],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    t=threading.Thread(target=stream_output,args=(proc,"API",GREEN),daemon=True)
    t.start()
    return proc


def start_frontend() -> subprocess.Popen:
    log(BLUE, "RUN", "Запуск frontend (Vite), порт 3000...")
    proc = subprocess.Popen(
        [NPM,"run","dev"],
        cwd=str(FRONTEND_DIR),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env={**os.environ,"FORCE_COLOR":"1"},
    )
    t=threading.Thread(target=stream_output,args=(proc,"UI",BLUE),daemon=True)
    t.start()
    return proc


def wait_for_server(url: str,timeout: int=60) -> bool:
    import urllib.request
    import urllib.error
    start=time.time()
    while time.time()-start<timeout:
        try:
            urllib.request.urlopen(url,timeout=2)
            return True
        except Exception:
            time.sleep(1)
    return False


def open_browser():
    log(YELLOW, "RUN", "Ожидание backend (http://localhost:8000)...")
    if wait_for_server("http://localhost:8000/api/health", timeout=30):
        log(GREEN, "RUN", "Backend готов")
    else:
        log(RED, "RUN", "Backend не ответил за 30 сек")
    log(YELLOW, "RUN", "Ожидание frontend (http://localhost:3000)...")
    if wait_for_server("http://localhost:3000", timeout=60):
        log(GREEN, "RUN", "Frontend готов, открываю браузер")
        time.sleep(1)
        webbrowser.open("http://localhost:3000")
    else:
        log(RED, "RUN", "Frontend не ответил за 60 сек, откройте http://localhost:3000 вручную")


def cleanup(signum=None, frame=None):
    log(YELLOW, "RUN", "Остановка серверов...")
    for p in processes:
        try:
            if IS_WINDOWS:
                subprocess.run(
                    ["taskkill","/F","/T","/PID",str(p.pid)],
                    capture_output=True
                )
            else:
                p.terminate()
                p.wait(timeout=5)
        except Exception:
            try:
                p.kill()
            except Exception:
                pass
    log(GREEN, "RUN", "Выход")
    sys.exit(0)


def run_unit_tests():
    log(BLUE, "TEST", "Запуск unit-тестов...")
    result = subprocess.run(
        [PYTHON, "-m", "pytest", "test_basic.py", "-v", "-q"],
        cwd=str(BACKEND_DIR),
        env={**os.environ, "PYTHONPATH": str(BACKEND_DIR)},
    )
    if result.returncode != 0:
        log(RED, "TEST", "Тесты провалились!")
        sys.exit(1)
    log(GREEN, "TEST", "Все тесты пройдены")


def check_supabase_setup():
    env_file = BACKEND_DIR / ".env"
    if not env_file.exists():
        log(YELLOW, "CONFIG", "Файл backend/.env не найден — создайте по образцу .env.example (Supabase)")
        return
    content = env_file.read_text()
    if "your_supabase" in content.lower() or "SUPABASE_URL" not in content:
        log(YELLOW, "CONFIG", "Проверьте backend/.env: заданы SUPABASE_URL и SUPABASE_KEY")


def main():
    print(f"\n{BOLD}Alien Signal Classifier — запуск{RESET}\n")
    if not BACKEND_DIR.exists():
        log(RED, "RUN", f"Папка backend не найдена: {BACKEND_DIR}")
        sys.exit(1)
    if not FRONTEND_DIR.exists():
        log(RED, "RUN", f"Папка frontend не найдена: {FRONTEND_DIR}")
        sys.exit(1)
    check_supabase_setup()
    install_backend_deps()
    run_unit_tests()
    install_frontend_deps()
    signal.signal(signal.SIGINT, cleanup)
    if IS_WINDOWS:
        signal.signal(signal.SIGBREAK,cleanup)
    else:
        signal.signal(signal.SIGTERM,cleanup)
    backend_proc = start_backend()
    processes.append(backend_proc)
    time.sleep(2)
    frontend_proc = start_frontend()
    processes.append(frontend_proc)
    log(BLUE, "RUN", "Остановка: Ctrl+C")
    browser_thread = threading.Thread(target=open_browser, daemon=True)
    browser_thread.start()
    try:
        while True:
            if backend_proc.poll() is not None:
                time.sleep(3)
                backend_proc=start_backend()
                processes[0]=backend_proc
            if frontend_proc.poll() is not None:
                time.sleep(3)
                frontend_proc=start_frontend()
                processes[1]=frontend_proc
            time.sleep(5)
    except KeyboardInterrupt:
        cleanup()


if __name__=="__main__":
    main()
