# Import the generated sprite at the pack's low resolution, retaining source alpha.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source=[Drawing.Bitmap]::new((Join-Path $root 'worlds/pve-v3/user/barrage-bullet/generated.png'))
$texture=[Drawing.Bitmap]::new(32,32,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  for($y=0;$y -lt 32;$y++){for($x=0;$x -lt 32;$x++){
    $sx=[int][Math]::Floor(($x+0.5)*$source.Width/32)
    $sy=[int][Math]::Floor(($y+0.5)*$source.Height/32)
    $texture.SetPixel($x,$y,$source.GetPixel($sx,$sy))
  }}
  $out=Join-Path $root 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/particle/pve3_barrage_bullet.png'
  $texture.Save($out,[Drawing.Imaging.ImageFormat]::Png)
} finally {$texture.Dispose();$source.Dispose()}
