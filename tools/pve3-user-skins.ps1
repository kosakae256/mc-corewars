$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../worlds/pve-v3'))
$rp=Join-Path $base 'packs/pve_v3/resource_packs/pve_v3'
# 指定原稿の複製。原稿には書き込まない。
$skins=@{
  barrage='skinseedskin-1675942737947-16474377.png';gunner='cowboy.png'
  tank='b9084b9a100f5336.png';blinker='4240813023.png'
  shotgun='military-soldier-minecraft.png';titan='red-dream.png'
  vital='the-shadow-assassin.png';taint='Green Toxic Slime Demon with Glowing Yellow Eyes.png'
  healer='navia.png'
  rouser='Bearded Man in Red and Black Striped Cheerleader O.png'
  crusher='Lumberjack.png'
  chiller='5ef197d2b2d4367e.png'
}
foreach($id in $skins.Keys){
  Copy-Item -LiteralPath (Join-Path $base ('user/'+$skins[$id])) -Destination (Join-Path $rp ('textures/entity/pve3/'+$id+'_user_v1.png'))
}
# 緑成分を青へ移すRGBチャンネル置換。黄（RとGが近い）と無彩色を保持。
# 黄色から緑への境界は連続補間し、元の輝度階調とアルファを保つ。
$source=[Drawing.Bitmap]::new((Join-Path $base ('user/'+$skins.taint)))
$charged=[Drawing.Bitmap]::new($source.Width,$source.Height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
for($y=0;$y -lt $source.Height;$y++){for($x=0;$x -lt $source.Width;$x++){
  $c=$source.GetPixel($x,$y)
  $hue=$c.GetHue()
  $blend=0.0
  if($hue -gt 70 -and $hue -lt 170){$blend=[Math]::Min(1,[Math]::Min(($hue-70)/25,(170-$hue)/15))}
  # green -> electric blue; small green component gives a cyan-blue highlight.
  $r=[int][Math]::Round($c.R*(1-$blend)+$c.B*$blend)
  $g=[int][Math]::Round($c.G*(1-$blend)+($c.R*.75+$c.G*.25)*$blend)
  $b=[int][Math]::Round($c.B*(1-$blend)+$c.G*$blend)
  $charged.SetPixel($x,$y,[Drawing.Color]::FromArgb($c.A,$r,$g,$b))
}}
$charged.Save((Join-Path $rp 'textures/entity/pve3/charged_user_v1.png'),[Drawing.Imaging.ImageFormat]::Png)
$source.Dispose();$charged.Dispose()
$source=[Drawing.Bitmap]::new((Join-Path $base 'user/ghost.png'))
$ghost=[Drawing.Bitmap]::new($source.Width,$source.Height,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
for($y=0;$y -lt $source.Height;$y++){for($x=0;$x -lt $source.Width;$x++){
  $c=$source.GetPixel($x,$y)
  $ghost.SetPixel($x,$y,[Drawing.Color]::FromArgb([int][Math]::Round($c.A*.5),$c.R,$c.G,$c.B))
}}
$ghost.Save((Join-Path $rp 'textures/entity/pve3/wraith_user_v1.png'),[Drawing.Imaging.ImageFormat]::Png)
$source.Dispose();$ghost.Dispose()
Write-Output ('Prepared '+($skins.Count+2)+' user skins ('+$skins.Count+' unchanged, charged palette, wraith alpha).')
