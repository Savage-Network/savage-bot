import os
import json

MUSIC_DIR = "music"
LIBRARY_FILE = os.path.join(MUSIC_DIR, "library.json")

def verify_library():
    if not os.path.exists(LIBRARY_FILE):
        print(f"✗ {LIBRARY_FILE} não encontrado!")
        return

    with open(LIBRARY_FILE, "r", encoding="utf-8") as f:
        library = json.load(f)

    files_in_dir = [f for f in os.listdir(MUSIC_DIR) if f.endswith((".mp3", ".ogg", ".wav"))]
    files_in_lib = list(library.keys())

    missing_in_lib = [f for f in files_in_dir if f not in files_in_lib]
    extra_in_lib = [f for f in files_in_lib if f not in files_in_dir]

    if not missing_in_lib and not extra_in_lib:
        print("✓ Tudo OK! Todas as músicas estão no library.json.")
    else:
        if missing_in_lib:
            print(f"⚠ {len(missing_in_lib)} músicas faltam no library.json:")
            for f in missing_in_lib:
                print(f"  - {f}")
                # Tenta inferir nome do ficheiro (Limpeza básica)
                name = f.replace(".mp3", "").replace(".ogg", "").replace(".wav", "")
                if " - " in name:
                    parts = name.split(" - ", 1)
                    library[f] = {"artist": parts[0], "title": parts[1]}
                else:
                    library[f] = {"artist": "Desconhecido", "title": name}
            
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(library, f, indent=2, ensure_ascii=False)
            print(f"✓ {LIBRARY_FILE} atualizado com as músicas em falta.")

        if extra_in_lib:
            print(f"ℹ {len(extra_in_lib)} entradas no library.json não têm ficheiro físico (limpando...):")
            for f in extra_in_lib:
                print(f"  - {f}")
                del library[f]
            
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(library, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    verify_library()
