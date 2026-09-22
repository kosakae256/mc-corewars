# **弾幕の玉**（`pve_v3:orb`）。**東方の弾幕をイメージした玉**——
# **白い芯 ＋ 青緑の身 ＋ 濃い縁**（`worlds/pve-v3/docs/spec/25-enemy-kit.md` 6-1）。
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out=Join-Path $root 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3_orb.png'
$n=16; $c=($n-1)/2.0
$bmp=[Drawing.Bitmap]::new($n,$n,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
try {
  for($y=0;$y -lt $n;$y++){ for($x=0;$x -lt $n;$x++){
    $d=[Math]::Sqrt([Math]::Pow($x-$c,2)+[Math]::Pow($y-$c,2))
    # **外は透明・縁は濃い青緑・身は明るい青緑・芯は白**
    if($d -gt 7.6){ $col=[Drawing.Color]::FromArgb(0,0,0,0) }
    elseif($d -gt 6.2){ $col=[Drawing.Color]::FromArgb(255,10,70,86) }
    elseif($d -gt 5.0){ $col=[Drawing.Color]::FromArgb(255,24,148,164) }
    elseif($d -gt 3.2){ $col=[Drawing.Color]::FromArgb(255,74,226,214) }
    elseif($d -gt 2.0){ $col=[Drawing.Color]::FromArgb(255,178,247,242) }
    else { $col=[Drawing.Color]::FromArgb(255,255,255,255) }
    $bmp.SetPixel($x,$y,$col)
  }}
  $bmp.Save($out,[Drawing.Imaging.ImageFormat]::Png)
} finally { $bmp.Dispose() }
Write-Output ('kaita: '+$out)
