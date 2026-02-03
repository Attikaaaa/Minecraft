#!/bin/bash

# Minecraft textúrák letöltése
BASE_URL="https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.19.3/assets/minecraft/textures/block"

# Létrehozzuk a textures mappát
mkdir -p textures

# Textúrák listája
textures=(
    "grass_block_top.png"
    "grass_block_side.png"
    "dirt.png"
    "stone.png"
    "oak_log.png"
    "oak_log_top.png"
    "oak_leaves.png"
    "sand.png"
    "coal_ore.png"
    "cobblestone.png"
    "oak_planks.png"
    "water_still.png"
    "crafting_table_top.png"
    "crafting_table_side.png"
    "crafting_table_front.png"
    "iron_ore.png"
    "gold_ore.png"
    "diamond_ore.png"
    "redstone_ore.png"
    "lapis_ore.png"
    "emerald_ore.png"
    "torch.png"
)

echo "Textúrák letöltése..."

for texture in "${textures[@]}"; do
    echo "Letöltés: $texture"
    curl -s -o "textures/$texture" "$BASE_URL/$texture"
    
    if [ $? -eq 0 ]; then
        echo "✓ $texture letöltve"
    else
        echo "✗ Hiba: $texture"
    fi
done

echo ""
echo "Kész! Textúrák a textures/ mappában."
