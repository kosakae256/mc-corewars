# Convert the generated atlas to the requested 32x32; never repaint its pixels.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$base=Join-Path $PSScriptRoot '../worlds/pve-v3'
$source=[Drawing.Bitmap]::new((Join-Path $base 'user/saw-bomb-designs/atlas-source.png'))
$atlas=[Drawing.Bitmap]::new(32,32,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  for($y=0;$y -lt 32;$y++){for($x=0;$x -lt 32;$x++){
    $sx=[int][Math]::Floor(($x+.5)*$source.Width/32)
    $sy=[int][Math]::Floor(($y+.5)*$source.Height/32)
    $atlas.SetPixel($x,$y,$source.GetPixel($sx,$sy))
  }}
  $atlas.Save((Join-Path $base 'packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3/saw_bomb_rpg_v1.png'),[Drawing.Imaging.ImageFormat]::Png)
} finally {$source.Dispose();$atlas.Dispose()}
