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
Resize-Jpg 'public/tracks/mexiku-beach.jpg' 'public/tracks/mexiku-beach.jpg' 1024 70
Resize-Jpg 'public/tracks/mexiku-city.jpg' 'public/tracks/mexiku-city.jpg' 1024 70
