# User-requested hue conversion of the vanilla 8x8 flame. Alpha and pixel layout stay intact.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$source=[Drawing.Bitmap]::new((Join-Path $root 'bedrock-samples/resource_pack/textures/particle/particles.png'))
$out=Join-Path $root 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/particle'
try {
  foreach($variant in @(@{Name='blue';Hue=205.0},@{Name='purple';Hue=275.0})) {
    $texture=[Drawing.Bitmap]::new(8,8,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      for($y=0;$y -lt 8;$y++){for($x=0;$x -lt 8;$x++){
        $c=$source.GetPixel($x,$y+24)
        $hi=[Math]::Max($c.R,[Math]::Max($c.G,$c.B))
        $lo=[Math]::Min($c.R,[Math]::Min($c.G,$c.B))
        $s=if($hi -eq 0){0.0}else{(1.0-$lo/$hi)*0.9}
        $v=[Math]::Sqrt((0.2126*$c.R+0.7152*$c.G+0.0722*$c.B)/255)
        $chroma=$v*$s; $sector=$variant.Hue/60
        $cross=$chroma*(1-[Math]::Abs(($sector%2)-1)); $low=$v-$chroma
        $rgb=if($sector -lt 4){@(0.0,$cross,$chroma)}else{@($cross,0.0,$chroma)}
        $texture.SetPixel($x,$y,[Drawing.Color]::FromArgb($c.A,
          [int][Math]::Round(255*($rgb[0]+$low)),[int][Math]::Round(255*($rgb[1]+$low)),[int][Math]::Round(255*($rgb[2]+$low))))
      }}
      $texture.Save((Join-Path $out ('pve3_foxfire_'+$variant.Name+'.png')),[Drawing.Imaging.ImageFormat]::Png)
    } finally {$texture.Dispose()}
  }
} finally {$source.Dispose()}
