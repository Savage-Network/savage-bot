"""
Download EXACT tracks from multiple Spotify playlists using:
1. Spotify API (with your credentials) to get the real track list
2. yt-dlp to search YouTube and download each track as MP3
3. Skips files that already exist in the music/ folder.

Usage: python download_playlist.py
"""

import subprocess
import sys
import os
import json
import urllib.request
import urllib.parse
import re

# --- Config ---
PLAYLISTS = [
    "7kcvJ5wIan9CqDDeeD1gD0", # SO AS PURA
    "2orR7sqELCOLxy5vwQr7g7", # Nova Playlist
]
TRACKS = [
    "6VH6SBNNL2RVWwImq046ce",
    "7pTKz7HUryYYheQuEUQ9qR",
    "1lflD04lIdgV10sCMwFYOu",
]
CLIENT_ID     = "3697be55bc42480cb938083e6ab42f0f"
CLIENT_SECRET = "4d575a2bc70e45e484be8d15a51bf516"
FFMPEG        = os.path.abspath(r"node_modules\ffmpeg-static\ffmpeg.exe")
OUTPUT_DIR    = os.path.abspath("music")
# Usamos o título do uploader e título do vídeo para o ficheiro
OUTPUT_TMPL   = os.path.join(OUTPUT_DIR, "%(uploader)s - %(title)s.%(ext)s")

def get_token():
    creds = f"{CLIENT_ID}:{CLIENT_SECRET}".encode()
    import base64
    b64 = base64.b64encode(creds).decode()
    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode()
    req = urllib.request.Request(
        "https://accounts.spotify.com/api/token",
        data=data,
        headers={"Authorization": f"Basic {b64}", "Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())["access_token"]

def get_playlist_tracks(token, playlist_id):
    tracks = []
    url = f"https://api.spotify.com/v1/playlists/{playlist_id}/tracks?limit=100"
    while url:
        req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with urllib.request.urlopen(req) as resp:
                data = json.loads(resp.read())
        except Exception as e:
            print(f"  ✗ Erro ao carregar tracks da playlist {playlist_id}: {e}")
            break
            
        for item in data.get("items", []):
            t = item.get("track")
            if not t or t.get("is_local"):
                continue
            name    = t["name"] or "Desconhecido"
            artists = ", ".join(a["name"] for a in t["artists"] if a.get("name")) or "Desconhecido"
            tracks.append({"name": name, "artists": artists, "id": t["id"]})
        url = data.get("next")
    return tracks

def get_track(token, track_id):
    url = f"https://api.spotify.com/v1/tracks/{track_id}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    try:
        with urllib.request.urlopen(req) as resp:
            t = json.loads(resp.read())
            name    = t["name"] or "Desconhecido"
            artists = ", ".join(a["name"] for a in t["artists"] if a.get("name")) or "Desconhecido"
            return {"name": name, "artists": artists, "id": t["id"]}
    except Exception as e:
        print(f"  ✗ Erro ao carregar track {track_id}: {e}")
        return None

def track_exists(name, artists):
    # Verificação simples baseada no nome da música e artista nos ficheiros actuais
    # Como o yt-dlp pode mudar ligeiramente o nome, isto é uma aproximação
    clean_name = re.sub(r'[^a-zA-Z0-9]', '', name).lower()
    for f in os.listdir(OUTPUT_DIR):
        if f.endswith(".mp3"):
            cf = re.sub(r'[^a-zA-Z0-9]', '', f).lower()
            if clean_name in cf:
                return True
    return False

def download(name, artists):
    if track_exists(name, artists):
        print(f"    - Ignorada (já existe): {artists} - {name}")
        return

    query = f"{artists} - {name}"
    print(f"\n>>> A baixar: {query}")
    cmd = [
        sys.executable, "-m", "yt_dlp",
        f"ytsearch1:{query}",
        "--extract-audio",
        "--audio-format", "mp3",
        "--audio-quality", "0",
        "-o", OUTPUT_TMPL,
        "--ffmpeg-location", FFMPEG,
        "--no-playlist",
        "--quiet",
        "--progress",
        "--no-warnings",
    ]
    result = subprocess.run(cmd)
    if result.returncode == 0:
        print(f"    ✓ {query}")
    else:
        print(f"    ✗ Erro: {query}")

if __name__ == "__main__":
    print("=== Sincronização de Playlists Spotify ===\n")
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    try:
        token = get_token()
    except Exception as e:
        print(f"✗ Ergo de Autenticação: {e}")
        sys.exit(1)

    all_tracks = []
    seen_ids = set()

    for pid in PLAYLISTS:
        print(f"A obter músicas da playlist {pid}...")
        p_tracks = get_playlist_tracks(token, pid)
        for t in p_tracks:
            if t["id"] not in seen_ids:
                all_tracks.append(t)
                seen_ids.add(t["id"])
        print(f"  ✓ {len(p_tracks)} músicas encontradas.\n")

    for tid in TRACKS:
        print(f"A obter música individual {tid}...")
        t = get_track(token, tid)
        if t and t["id"] not in seen_ids:
            all_tracks.append(t)
            seen_ids.add(t["id"])

    print(f"Total de músicas únicas a verificar: {len(all_tracks)}\n")

    for t in all_tracks:
        download(t["name"], t["artists"])

    print("\n\n=== Sincronização concluída! ===")
    
    # Atualizar o library.json automaticamente no final
    print("A atualizar library.json...")
    res = {}
    for f in os.listdir(OUTPUT_DIR):
        if f.endswith(('.mp3', '.webm', '.ogg')):
            title = f.split(' - ')[1].split(' (')[0].split(' [')[0] if ' - ' in f else f.split('.')[0]
            artist = f.split(' - ')[0] if ' - ' in f else 'Desconhecido'
            res[f] = {"title": title, "artist": artist}
    
    with open(os.path.join(OUTPUT_DIR, "library.json"), "w", encoding="utf-8") as lj:
        json.dump(res, lj, indent=2, ensure_ascii=False)
    print("✓ library.json atualizado.")
