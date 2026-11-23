import os
import sys
import subprocess

def build():
    print("==========================================")
    print("  AuraFocus - 正在打包单文件绿色免安装 EXE")
    print("==========================================")
    
    base_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(base_dir)

    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        "--clean",
        "--noconfirm",
        "AuraFocus.spec"
    ]
    
    print("正在执行 PyInstaller 优化打包...")
    res = subprocess.run(cmd)
    
    if res.returncode == 0:
        exe_path = os.path.join(base_dir, "dist", "AuraFocus.exe")
        size_mb = os.path.getsize(exe_path) / (1024 * 1024)
        print("\n==========================================")
        print("[SUCCESS] 打包成功！独立免安装单文件 EXE 已生成：")
        print(f"[PATH] {exe_path}")
        print(f"[SIZE] {size_mb:.2f} MB (极度轻量，免安装便携)")
        print("==========================================")
    else:
        print("\n[ERROR] 打包遇到错误，请检查日志。")
    return res.returncode

if __name__ == '__main__':
    sys.exit(build())
