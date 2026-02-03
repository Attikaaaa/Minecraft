#!/bin/bash

BASE_URL="https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.19.3/assets/minecraft/textures"

echo "=== MINECRAFT 1.19.3 ÖSSZES ASSET LETÖLTÉSE ==="
echo ""

# Függvény a mappák letöltéséhez
download_folder() {
    local folder=$1
    local target=$2
    
    echo "📦 $folder letöltése..."
    mkdir -p "textures/$target"
    
    # Lista fájl letöltése
    curl -s "$BASE_URL/$folder/_list.json" -o "textures/$target/_list.json" 2>/dev/null
    
    if [ -f "textures/$target/_list.json" ]; then
        # PNG fájlok kinyerése és letöltése
        grep -o '"[^"]*\.png"' "textures/$target/_list.json" | tr -d '"' | while read file; do
            mkdir -p "textures/$target/$(dirname "$file")"
            curl -s "$BASE_URL/$folder/$file" -o "textures/$target/$file" 2>/dev/null
            echo "  ✓ $file"
        done
        rm "textures/$target/_list.json"
    fi
}

# Block textúrák (már megvan, de frissítjük)
download_folder "block" "block"

# GUI textúrák
download_folder "gui" "gui"

# Item textúrák
download_folder "item" "item"

# Entity textúrák
download_folder "entity" "entity"

# Particle textúrák
download_folder "particle" "particle"

# Environment textúrák (nap, hold, felhők)
download_folder "environment" "environment"

# Effect textúrák
download_folder "effect" "effect"

# Font textúrák
download_folder "font" "font"

# Painting textúrák
download_folder "painting" "painting"

# Mob effect textúrák
download_folder "mob_effect" "mob_effect"

# Colormap textúrák
download_folder "colormap" "colormap"

# Map textúrák
download_folder "map" "map"

# Misc textúrák
download_folder "misc" "misc"

echo ""
echo "✅ MINDEN ASSET LETÖLTVE!"
echo ""
echo "Statisztika:"
echo "  Blokkok: $(find textures/block -name '*.png' 2>/dev/null | wc -l)"
echo "  GUI: $(find textures/gui -name '*.png' 2>/dev/null | wc -l)"
echo "  Items: $(find textures/item -name '*.png' 2>/dev/null | wc -l)"
echo "  Entities: $(find textures/entity -name '*.png' 2>/dev/null | wc -l)"
echo "  Particles: $(find textures/particle -name '*.png' 2>/dev/null | wc -l)"
echo "  Environment: $(find textures/environment -name '*.png' 2>/dev/null | wc -l)"
echo "  Effects: $(find textures/effect -name '*.png' 2>/dev/null | wc -l)"
echo "  Összesen: $(find textures -name '*.png' 2>/dev/null | wc -l) textúra"
