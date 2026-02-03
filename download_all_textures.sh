#!/bin/bash

BASE_URL="https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.19.3/assets/minecraft/textures"

echo "=== MINECRAFT TEXTÚRÁK LETÖLTÉSE ==="
echo ""

# Blokk textúrák
echo "📦 Blokk textúrák letöltése..."
mkdir -p textures/block
curl -s "$BASE_URL/block/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    curl -s -o "textures/block/$texture" "$BASE_URL/block/$texture"
done

# GUI textúrák
echo ""
echo "🎨 GUI textúrák letöltése..."
mkdir -p textures/gui
mkdir -p textures/gui/container
mkdir -p textures/gui/sprites
curl -s "$BASE_URL/gui/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    mkdir -p "textures/gui/$(dirname "$texture")"
    curl -s -o "textures/gui/$texture" "$BASE_URL/gui/$texture"
done

# Item textúrák
echo ""
echo "🔨 Item textúrák letöltése..."
mkdir -p textures/item
curl -s "$BASE_URL/item/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    curl -s -o "textures/item/$texture" "$BASE_URL/item/$texture"
done

# Entity textúrák
echo ""
echo "🐄 Entity textúrák letöltése..."
mkdir -p textures/entity
curl -s "$BASE_URL/entity/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    mkdir -p "textures/entity/$(dirname "$texture")"
    curl -s -o "textures/entity/$texture" "$BASE_URL/entity/$texture"
done

# Environment textúrák
echo ""
echo "🌍 Environment textúrák letöltése..."
mkdir -p textures/environment
curl -s "$BASE_URL/environment/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    curl -s -o "textures/environment/$texture" "$BASE_URL/environment/$texture"
done

# Particle textúrák
echo ""
echo "✨ Particle textúrák letöltése..."
mkdir -p textures/particle
curl -s "$BASE_URL/particle/_list.json" | grep -o '"[^"]*\.png"' | tr -d '"' | while read texture; do
    echo "  → $texture"
    curl -s -o "textures/particle/$texture" "$BASE_URL/particle/$texture"
done

echo ""
echo "✅ KÉSZ! Minden textúra letöltve."
echo ""
echo "Statisztika:"
echo "  Blokkok: $(ls textures/block/*.png 2>/dev/null | wc -l)"
echo "  GUI: $(find textures/gui -name '*.png' 2>/dev/null | wc -l)"
echo "  Itemek: $(ls textures/item/*.png 2>/dev/null | wc -l)"
echo "  Entityk: $(find textures/entity -name '*.png' 2>/dev/null | wc -l)"
echo "  Environment: $(ls textures/environment/*.png 2>/dev/null | wc -l)"
echo "  Particle: $(ls textures/particle/*.png 2>/dev/null | wc -l)"
