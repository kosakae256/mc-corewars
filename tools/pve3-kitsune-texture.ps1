$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$base=Join-Path $root 'worlds/pve-v3'
$source=[Drawing.Bitmap]::new((Join-Path $base 'user/kitsune-candidates/texture-tiles-source.png'))
$atlas=[Drawing.Bitmap]::new(128,128,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
# Nearest-neighbor format conversion only; artwork comes from the generated tile sheet.
for($y=0;$y -lt 128;$y++){for($x=0;$x -lt 128;$x++){
  $c=$source.GetPixel([int][Math]::Floor(($x+.5)*$source.Width/128),[int][Math]::Floor(($y+.5)*$source.Height/128))
  $atlas.SetPixel($x,$y,[Drawing.Color]::FromArgb(255,$c.R,$c.G,$c.B))
}}
$atlas.Save((Join-Path $base 'packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3/kitsune_selected_a_v1.png'),[Drawing.Imaging.ImageFormat]::Png)
$source.Dispose();$atlas.Dispose()
