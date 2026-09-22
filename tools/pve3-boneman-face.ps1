$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../worlds/pve-v3'))
$original=[Drawing.Bitmap]::new((Join-Path $base 'user/6404524243.png'))
$donor=[Drawing.Bitmap]::new((Join-Path $base 'user/skin_Slim_White_140114730f7c1147462502569e0559ed.png'))
try {
  if($original.Width -ne 64 -or $original.Height -ne 64 -or $donor.Width -ne 64 -or $donor.Height -ne 64){throw 'Expected two 64x64 skins'}
  $result=[Drawing.Bitmap]::new(64,64,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
  try {
    for($y=0;$y -lt 64;$y++){for($x=0;$x -lt 64;$x++){
      # Copy the two front-facing UV rectangles exactly; preserve all other pixels.
      $inFace=$y -ge 8 -and $y -lt 16 -and (($x -ge 8 -and $x -lt 16) -or ($x -ge 40 -and $x -lt 48))
      if($inFace){$pixel=$donor.GetPixel($x,$y)}else{$pixel=$original.GetPixel($x,$y)}
      $result.SetPixel($x,$y,$pixel)
    }}
    $result.Save((Join-Path $base 'packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3/boneman_user_v1.png'),[Drawing.Imaging.ImageFormat]::Png)
  } finally {$result.Dispose()}
} finally {$original.Dispose();$donor.Dispose()}
Write-Output 'Boneman: copied 128 front-face pixels, preserved the other 3968 pixels.'
