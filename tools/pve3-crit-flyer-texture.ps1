$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
foreach($mob in @('crit','flyer')) {
  $source=[Drawing.Bitmap]::new((Join-Path $root "worlds/pve-v3/user/crit-flyer-designs/$mob-source.png"))
  $atlas=[Drawing.Bitmap]::new(128,128,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  # Format conversion only. All artwork comes from the generated atlas.
  for($y=0;$y -lt 128;$y++){for($x=0;$x -lt 128;$x++){
    $c=$source.GetPixel([int][Math]::Floor(($x+.5)*$source.Width/128),[int][Math]::Floor(($y+.5)*$source.Height/128))
    $atlas.SetPixel($x,$y,[Drawing.Color]::FromArgb(255,$c.R,$c.G,$c.B))
  }}
  $atlas.Save((Join-Path $root "worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3/$($mob)_rpg_v1.png"),[Drawing.Imaging.ImageFormat]::Png)
  $source.Dispose();$atlas.Dispose()
}
