param([string]$Only = '')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
# UV packing and nearest-neighbor format conversion of the generated artwork.
# Actual costume painting remains in the generated source images.
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Collections.Generic;
public class EnemyTexturePacker {
  static bool Foreground(Bitmap b,int x,int y,bool alpha) {
    Color c=b.GetPixel(x,y);
    if(alpha) return c.A>=245;
    Color bg=b.GetPixel(0,0);
    return Math.Abs(c.R-bg.R)+Math.Abs(c.G-bg.G)+Math.Abs(c.B-bg.B)>90;
  }
  static Rectangle Bounds(Bitmap b,int start,int end,bool alpha) {
    int[] rows=new int[b.Height],cols=new int[b.Width];
    for(int y=0;y<b.Height;y+=2) for(int x=start;x<end;x+=2)
      if(Foreground(b,x,y,alpha)){rows[y]++;cols[x]++;}
    int max=0;foreach(int c in rows)max=Math.Max(max,c);
    int top=0,bottom=b.Height-1,left=start,right=end-1;
    while(top<bottom&&rows[top]<max*.18)top++;
    while(bottom>top&&rows[bottom]<max*.18)bottom--;
    while(left<right&&cols[left]<b.Height*.05)left++;
    while(right>left&&cols[right]<b.Height*.05)right--;
    if(right-left<20||bottom-top<40)throw new Exception("Cannot locate front/back sprite");
    return Rectangle.FromLTRB(left,top,right+1,bottom+1);
  }
  static Color Sample(Bitmap b,double x,double y) {
    int ix=Math.Max(0,Math.Min(b.Width-1,(int)x));
    int iy=Math.Max(0,Math.Min(b.Height-1,(int)y));
    Color c=b.GetPixel(ix,iy);
    if(c.A<128){ // UV samples on slightly uneven cutout edges snap to nearest opaque texel.
      for(int r=1;r<Math.Max(b.Width,b.Height)/8;r++)
        for(int d=-r;d<=r;d++){
          int[,] offsets={{d,-r},{d,r},{-r,d},{r,d}};
          for(int k=0;k<4;k++){
            int xx=ix+offsets[k,0],yy=iy+offsets[k,1];
            if(xx<0||xx>=b.Width||yy<0||yy>=b.Height)continue;
            Color v=b.GetPixel(xx,yy);if(v.A>=245)return Color.FromArgb(255,v.R,v.G,v.B);
          }
        }
    }
    return Color.FromArgb(255,c.R,c.G,c.B);
  }
  static void Blit(Bitmap src,RectangleF r,Bitmap dst,Rectangle d){
    for(int y=0;y<d.Height;y++)for(int x=0;x<d.Width;x++)
      dst.SetPixel(d.X+x,d.Y+y,Sample(src,r.X+(x+.5)*r.Width/d.Width,r.Y+(y+.5)*r.Height/d.Height));
  }
  static Bitmap Sprite(Bitmap src,Rectangle b,bool alpha){
    Bitmap s=new Bitmap(16,32,PixelFormat.Format32bppArgb);
    int probe=b.Top+(int)(b.Height*.12),left=b.Left,right=b.Right-1;
    while(left<right&&!Foreground(src,left,probe,alpha))left++;
    while(right>left&&!Foreground(src,right,probe,alpha))right--;
    int shoulder=b.Top+(int)(b.Height*.25);
    for(int y=b.Top+(int)(b.Height*.18);y<b.Top+b.Height*.4;y++){
      int n=0;for(int x=b.Left;x<b.Right;x+=2)if(Foreground(src,x,y,alpha))n+=2;
      if(n>(right-left)*1.3){shoulder=y;break;}
    }
    Blit(src,new RectangleF(left,b.Top,right-left+1,shoulder-b.Top),s,new Rectangle(4,0,8,8));
    int waist=shoulder+(b.Bottom-shoulder)/2;
    Blit(src,new RectangleF(b.Left,shoulder,b.Width,waist-shoulder),s,new Rectangle(0,8,16,12));
    Blit(src,new RectangleF(b.Left+b.Width*.25f,waist,b.Width*.5f,b.Bottom-waist),s,new Rectangle(4,20,8,12));
    return s;
  }
  static void Part(Bitmap f,Bitmap b,Bitmap a,Rectangle source,int u,int v,int w,int h,int depth){
    Blit(f,source,a,new Rectangle(u+depth,v+depth,w,h));
    Blit(b,source,a,new Rectangle(u+2*depth+w,v+depth,w,h));
    // Side faces use the outermost back columns; faces never appear on the sides of the head.
    Blit(b,new Rectangle(source.X,source.Y,Math.Min(depth,source.Width),source.Height),a,new Rectangle(u,v+depth,depth,h));
    Blit(b,new Rectangle(source.Right-Math.Min(depth,source.Width),source.Y,Math.Min(depth,source.Width),source.Height),a,new Rectangle(u+depth+w,v+depth,depth,h));
    Blit(b,new Rectangle(source.X,source.Y,w,1),a,new Rectangle(u+depth,v,w,depth));
    Blit(f,new Rectangle(source.X,source.Bottom-1,w,1),a,new Rectangle(u+depth+w,v,w,depth));
  }
  public static string Pack(string input,string output,string metalSource){
    using(Bitmap src=new Bitmap(input)){
      bool alpha=src.GetPixel(0,0).A<128;
      Rectangle fbox=Bounds(src,0,src.Width/2,alpha),bbox=Bounds(src,src.Width/2,src.Width,alpha);
      using(Bitmap f=Sprite(src,fbox,alpha))using(Bitmap back=Sprite(src,bbox,alpha))
      using(Bitmap a=new Bitmap(128,128,PixelFormat.Format32bppArgb)){
        Part(f,back,a,new Rectangle(4,0,8,8),0,0,8,8,8);
        Part(f,back,a,new Rectangle(4,8,8,12),16,16,8,12,4);
        Part(f,back,a,new Rectangle(0,8,4,12),40,16,4,12,4);
        Part(f,back,a,new Rectangle(12,8,4,12),32,48,4,12,4);
        Part(f,back,a,new Rectangle(4,20,4,12),0,16,4,12,4);
        Part(f,back,a,new Rectangle(8,20,4,12),16,48,4,12,4);
        Rectangle[] patches={new Rectangle(5,10,6,7),new Rectangle(5,30,6,2),new Rectangle(5,0,6,2),
          new Rectangle(5,11,6,4),new Rectangle(4,1,8,3),new Rectangle(5,18,6,2),new Rectangle(6,5,4,2),new Rectangle(4,0,8,3)};
        for(int i=0;i<patches.Length;i++)Blit(i==7?back:f,patches[i],a,new Rectangle(64+i%4*8,i/4*8,8,8));
        // Shared neutral steel/ivory/leather colors come from generated armor artwork.
        if(System.IO.File.Exists(metalSource)) using(Bitmap mat=new Bitmap(metalSource)){
          Color[] targets={Color.FromArgb(205,215,228),Color.FromArgb(105,67,42),Color.FromArgb(235,240,247)};
          int[] slots={4,5,2};
          for(int k=0;k<slots.Length;k++){
            int best=int.MaxValue,bx=0,by=0;
            for(int y=0;y<mat.Height;y+=4)for(int x=0;x<mat.Width;x+=4){
              Color c=mat.GetPixel(x,y);if(c.A<245)continue;
              int score=(c.R-targets[k].R)*(c.R-targets[k].R)+(c.G-targets[k].G)*(c.G-targets[k].G)+(c.B-targets[k].B)*(c.B-targets[k].B);
              if(score<best){best=score;bx=x;by=y;}
            }
            Blit(mat,new Rectangle(bx,by,Math.Min(12,mat.Width-bx),Math.Min(12,mat.Height-by)),a,new Rectangle(64+slots[k]%4*8,slots[k]/4*8,8,8));
          }
        }
        a.Save(output,ImageFormat.Png);
      }
      return String.Format("front {0}, back {1}",fbox,bbox);
    }
  }
}
'@
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$art = Join-Path $root 'worlds/pve-v3/user/enemy-designs-v1'
$rp = Join-Path $root 'worlds/pve-v3/packs/pve_v3/resource_packs/pve_v3/textures/entity/pve3'
$catalog = Get-Content (Join-Path $PSScriptRoot 'catalog.json') -Encoding UTF8 -Raw | ConvertFrom-Json
foreach ($design in $catalog) {
    if ($Only -and $Only -ne $design.id) { continue }
    $inputImage = Join-Path $art ($design.id + '-source.png')
    if (!(Test-Path -LiteralPath $inputImage)) { continue }
    $outputImage = Join-Path $rp ($design.id + '_design_v1.png')
    $result = [EnemyTexturePacker]::Pack($inputImage, $outputImage, (Join-Path $art 'materials-source.png'))
    Write-Output ($design.id + ': ' + $result)
}
