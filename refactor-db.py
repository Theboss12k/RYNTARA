import os

base = "src/main/java/com/fleetapp"

os.makedirs(f"{base}/planning/entity", exist_ok=True)
os.makedirs(f"{base}/planning/repository", exist_ok=True)
os.makedirs(f"{base}/config", exist_ok=True)

def move_and_replace(filename, old_dir, new_dir, replacements):
    old_path = f"{base}/{old_dir}/{filename}"
    new_path = f"{base}/{new_dir}/{filename}"
    if os.path.exists(old_path):
        with open(old_path, 'r') as f:
            content = f.read()
        for old, new in replacements.items():
            content = content.replace(old, new)
        with open(new_path, 'w') as f:
            f.write(content)
        os.remove(old_path)

# 1. Move Entities
for e in ["Manifest.java", "Waypoint.java", "Redzone.java"]:
    move_and_replace(e, "entity", "planning/entity", {
        "package com.fleetapp.entity;": "package com.fleetapp.planning.entity;"
    })

# 2. Move Repositories
for r in ["ManifestRepository.java", "WaypointRepository.java", "RedzoneRepository.java"]:
    move_and_replace(r, "repository", "planning/repository", {
        "package com.fleetapp.repository;": "package com.fleetapp.planning.repository;",
        "import com.fleetapp.entity.": "import com.fleetapp.planning.entity."
    })

# 3. Update Service imports
srv_path = f"{base}/service/ConflictEngineService.java"
if os.path.exists(srv_path):
    with open(srv_path, 'r') as f:
        c = f.read()
    c = c.replace("import com.fleetapp.entity.", "import com.fleetapp.planning.entity.")
    c = c.replace("import com.fleetapp.repository.", "import com.fleetapp.planning.repository.")
    with open(srv_path, 'w') as f:
        f.write(c)

print("✅ Files reorganized into com.fleetapp.planning packages!")