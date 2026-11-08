Add-Type -AssemblyName System.Drawing

function Resize-Jpg([string]$src, [string]$dst, [int]$maxW, [long]$quality) {
  $full = Resolve-Path $src
  $img = [System.Drawing.Image]::FromFile($full)
  $scale = [Math]::Min(1.0, $maxW / [double]$img.Width)
  $w = [int][Math]::Max(1, [Math]::Round($img.Width * $scale))
  $h = [int][Math]::Max(1, [Math]::Round($img.Height * $scale))
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $img.Dispose()
  $g.Dispose()
  $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, $quality)
  $tmp = "$dst.__tmp.jpg"
  $bmp.Save($tmp, $codec, $ep)
  $bmp.Dispose()
  Move-Item -Force $tmp $dst
  Get-Item $dst | Select-Object Name, Length
}

Resize-Jpg 'public/tracks/mexiku-preview.jpg' 'public/tracks/mexiku-preview.jpg' 1280 72
Resize-Jpg 'public/tracks/mexiku-facade.jpg' 'public/tracks/mexiku-facade.jpg' 512 70
Resize-Jpg 'public/tracks/mexiku-ground.jpg' 'public/tracks/mexiku-ground.jpg' 512 70
Resize-Jpg 'public/tracks/mexiku-asphalt.jpg' 'public/tracks/mexiku-asphalt.jpg' 512 70
Resize-Jpg 'public/tracks/mexiku-palm.jpg' 'public/tracks/mexiku-palm.jpg' 384 70
if (Test-Path 'public/tracks/mexiku-360.jpg') {
  Resize-Jpg 'public/tracks/mexiku-360.jpg' 'public/tracks/mexiku-360.jpg' 2048 68
}
Get-ChildItem public/tracks/mexiku* | Select-Object Name, Length
